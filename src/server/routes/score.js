const express = require('express');
const router = express.Router();
const { getSession, updateSession } = require('../services/sessionService');
const { computeAggregateScores } = require('../services/scoringEngine');
const microworldsConfig = require('../../../config/microworlds.json');

router.post('/', (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'Missing sessionId' });
  }

  try {
    const session = getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Compute scores
    const results = computeAggregateScores(session, microworldsConfig);

    // Persist scores
    updateSession(sessionId, { scores: results });

    res.json(results);
  } catch (err) {
    console.error('Error computing scores:', err);
    res.status(500).json({ error: 'Failed to compute scores' });
  }
});

module.exports = router;



