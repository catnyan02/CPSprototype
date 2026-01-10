const express = require('express');
const router = express.Router();
const { getSession } = require('../services/sessionService');
const { getLogs } = require('../services/eventLogger');

router.get('/', (req, res) => {
  const { sessionId } = req.query;

  if (!sessionId) {
    return res.status(400).json({ error: 'Missing sessionId' });
  }

  const session = getSession(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const payload = {
    sessionId,
    exportedAt: new Date().toISOString(),
    scores: session.scores || null,
    logs: getLogs(sessionId)
  };

  res.json(payload);
});

module.exports = router;
