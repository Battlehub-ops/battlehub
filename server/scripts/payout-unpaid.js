#!/usr/bin/env node
/**
 * scripts/payout-unpaid.js
 * Improved batch payout processor with configurable concurrency and dry-run.
 *
 * Usage:
 *   node scripts/payout-unpaid.js          # dry-run (shows what would be done)
 *   node scripts/payout-unpaid.js --apply  # actually applies payouts
 *   node scripts/payout-unpaid.js --limit=100 --batch=50 --apply
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Match = require('../models/Match');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

async function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// Simple worker-pool concurrency helper (no external deps)
async function processWithConcurrency(items, workerFn, concurrency = 5) {
  const results = [];
  let idx = 0;
  const workers = new Array(concurrency).fill(0).map(async () => {
    while (true) {
      const i = idx++;
      if (i >= items.length) break;
      try {
        const r = await workerFn(items[i], i);
        results.push({ index: i, ok: true, result: r });
      } catch (err) {
        results.push({ index: i, ok: false, error: err.message || String(err) });
      }
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const limitArg = args.find(a => a.startsWith('--limit='));
  const batchArg = args.find(a => a.startsWith('--batch='));
  const concurrencyArg = args.find(a => a.startsWith('--concurrency='));

  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 0; // 0 => no limit
  const batchSize = batchArg ? parseInt(batchArg.split('=')[1], 10) : 50;
  const concurrency = concurrencyArg ? parseInt(concurrencyArg.split('=')[1], 10) : 10;

  console.log('[payout] config', { apply, limit, batchSize, concurrency });

  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI missing in .env. Set it to your MongoDB connection string.');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB || undefined });
  console.log('Connected.');

  try {
    // Query unpaid matches: those not processed yet (payoutProcessed != true)
    let q = { payoutProcessed: { $ne: true } };
    let cursor = Match.find(q).sort({ createdAt: -1 }).cursor();

    // Collect matches into array (can be large; for extreme scale consider streaming)
    const matches = [];
    for await (const m of cursor) {
      matches.push(m);
      if (limit && matches.length >= limit) break;
    }

    if (matches.length === 0) {
      console.log('No unpaid matches found.');
      return;
    }

    console.log(`Found ${matches.length} unpaid match(es). Processing in batches of ${batchSize}...`);

    const batches = [];
    for (let i = 0; i < matches.length; i += batchSize) batches.push(matches.slice(i, i + batchSize));

    let summary = { processed: 0, skipped: 0, errors: 0, details: [] };

    for (let bi = 0; bi < batches.length; bi++) {
      const batch = batches[bi];
      console.log(`Processing batch ${bi + 1}/${batches.length} (size=${batch.length})`);

      // Worker for each match in the batch
      const worker = async (matchDoc) => {
        // Populate entries & users & battle for each match fresh (safe)
        const match = await Match.findById(matchDoc._id)
          .populate({ path: 'entries', populate: { path: 'user', select: 'name email balanceUSD' } })
          .populate('battle');

        if (!match) throw new Error('Match not found on re-fetch: ' + matchDoc._id);

        if (match.payoutProcessed || match.paid) {
          summary.skipped++;
          return { skipped: true };
        }

        // Find winner entry
        const winnerId = match.winnerEntry && match.winnerEntry.toString ? match.winnerEntry.toString() : match.winnerEntry;
        const winnerEntry = (match.entries || []).find(e => e._id.toString() === winnerId);
        if (!winnerEntry) throw new Error('Winner entry not found on match ' + match._id);

        const winnerUser = winnerEntry.user;
        if (!winnerUser) throw new Error('Winner user missing for entry ' + winnerEntry._id);

        // Calculate pot and cuts
        const potUSD = (typeof match.potUSD === 'number' && match.potUSD > 0)
          ? match.potUSD
          : (Array.isArray(match.entries) ? match.entries.length * (match.battle?.entryFeeUSD || 0) : 0);
        const platformCutUSD = (typeof match.platformCutUSD === 'number' && match.platformCutUSD >= 0)
          ? match.platformCutUSD
          : +(potUSD * 0.15).toFixed(2);
        const winnerPayoutUSD = (typeof match.winnerPayoutUSD === 'number' && match.winnerPayoutUSD >= 0)
          ? match.winnerPayoutUSD
          : +(potUSD - platformCutUSD).toFixed(2);

        // Dry run: report only
        if (!apply) {
          summary.details.push({ match: match._id.toString(), winner: winnerUser._id.toString(), winnerPayoutUSD, platformCutUSD, applied: false });
          summary.processed++;
          return { applied: false };
        }

        // Apply updates (simple approach: not using Mongo transactions here)
        const updatedUser = await User.findByIdAndUpdate(
          winnerUser._id,
          { $inc: { balanceUSD: winnerPayoutUSD } },
          { new: true }
        );

        await Transaction.create({
          user: updatedUser._id,
          match: match._id,
          amountUSD: winnerPayoutUSD,
          type: 'payout',
          note: `Payout for match ${match._id} (pot: ${potUSD}, platform cut: ${platformCutUSD})`
        });

        await Transaction.create({
          user: null,
          match: match._id,
          amountUSD: platformCutUSD,
          type: 'platform_fee',
          note: `Platform cut for match ${match._id}`
        });

        match.paid = true;
        match.payoutProcessed = true;
        match.payoutAt = new Date();
        match.potUSD = potUSD;
        match.winnerPayoutUSD = winnerPayoutUSD;
        match.platformCutUSD = platformCutUSD;
        await match.save();

        summary.details.push({ match: match._id.toString(), winner: updatedUser._id.toString(), winnerPayoutUSD, platformCutUSD, applied: true });
        summary.processed++;
        return { applied: true };
      };

      // Run the batch with concurrency limit
      await processWithConcurrency(batch, worker, concurrency);

      // Small delay between batches to avoid DB spikes
      await sleep(200);
    }

    console.log('--- summary ---');
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

main().catch(err => {
  console.error('Fatal error', err && err.stack ? err.stack : err);
  process.exit(1);
});
