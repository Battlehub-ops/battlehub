const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  return res.json([]);
});

router.post('/', (req, res) => {
  const body = req.body || {};
  const game = Object.assign({ _id: String(Date.now()), status: 'pending', createdAt: new Date() }, body);
  return res.status(201).json({ ok: true, game });
});

router.post('/:id/start', (req, res) => {
  return res.json({ ok: true, game: { _id: req.params.id, status: 'active' } });
});

router.post('/:id/finish', (req, res) => {
  return res.json({ ok: true, winner: null, game: { _id: req.params.id, status: 'completed' } });
});

router.patch('/:id/players', (req, res) => {
  const players = Array.isArray(req.body && req.body.players) ? req.body.players : [];
  return res.json({ ok: true, game: { _id: req.params.id, players } });
});

module.exports = router;
