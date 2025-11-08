// verify-match.js
require('dotenv').config();
const crypto = require('crypto');

const MATCH_SECRET = process.env.MATCH_SECRET || 'my_battlehub_secret_key';

// **Values taken from the match you created**
const matchId = '690a262b46276402ca1f15a1';      // match._id from /matches
const ts = '1762272811801';                     // timestamp part after `|` in match.seed
const entriesLength = 2;                        // number of entries in that match (2)

const seed = crypto.createHmac('sha256', MATCH_SECRET).update(matchId + '|' + ts).digest('hex');
const num = parseInt(seed.slice(0, 16), 16);
const idx = num % entriesLength;

console.log('MATCH_SECRET used (hidden length):', MATCH_SECRET ? MATCH_SECRET.length + ' chars' : 'none');
console.log('matchId:', matchId);
console.log('ts:', ts);
console.log('seed:', seed);
console.log('num (big int):', num.toString());
console.log('chosen index (idx):', idx);

