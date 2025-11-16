/**
 * Safe pesapal route stub.
 * - If PESAPAL_DISABLED === 'true' this returns 503 for all pesapal endpoints.
 * - Else tries to require pesapaljs-v3 inside try/catch and only uses it when available.
 *
 * When ready to restore full payments, replace this file with the original
 * implementation or remove the PESAPAL_DISABLED env var.
 */

const express = require('express');
const router = express.Router();

const isDisabled = (process.env.PESAPAL_DISABLED || '').toLowerCase() === 'true';

// helper to send consistent "payments disabled" response
function paymentsDisabled(req, res) {
  res.status(503).json({
    ok: false,
    message: 'Payments are temporarily disabled on this deployment. Contact the dev team to re-enable.'
  });
}

if (isDisabled) {
  // All endpoints just return disabled
  router.use( paymentsDisabled);
  module.exports = router;
  return;
}

// Try to load the pesapal module but do not crash if it doesn't exist
let pesapal;
try {
  pesapal = require('pesapaljs-v3').init; // library exposes init function
} catch (err) {
  console.warn('[pesapal] pesapaljs-v3 not available, payments disabled:', err && err.message);
  router.use( paymentsDisabled);
  module.exports = router;
  return;
}

// If we get here, pesapal module loaded; set up minimal working endpoints.
// Note: this is intentionally minimal; restore original logic when ready.

router.get('/health', (req, res) => res.json({ ok: true, pesapal: 'module-loaded' }));

// token route example (only if you need it)
router.post('/token', async (req, res) => {
  try {
    const config = {
      consumerKey: process.env.PESAPAL_CONSUMER_KEY,
      consumerSecret: process.env.PESAPAL_CONSUMER_SECRET,
      baseUrl: process.env.PESAPAL_BASE || 'https://cybqa.pesapal.com/pesapalv3'
    };
    const p = pesapal(config);
    const token = await p.getToken();
    res.json({ ok: true, token });
  } catch (e) {
    console.error('[pesapal] token error', e && e.message);
    res.status(500).json({ ok: false, error: e && e.message ? e.message : 'token error' });
  }
});

module.exports = router;
