const express = require('express');
const router = express.Router();
const { updateSession, getSession } = require('../services/sessionService');

router.post('/', (req, res) => {
  const { sessionId, microworldId, finalOutputs, mcq } = req.body;

  if (!sessionId || !microworldId) {
    return res.status(400).json({ error: 'Missing sessionId or microworldId' });
  }

  try {
    const session = getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const updatedResponses = {
      ...session.responses,
      [microworldId]: {
        finalOutputs: finalOutputs || {},
        mcq: mcq || {}
      }
    };

    updateSession(sessionId, { responses: updatedResponses });

    res.json({ success: true });
  } catch (err) {
    console.error('Error saving control final data:', err);
    res.status(500).json({ error: 'Failed to save control data' });
  }
});

module.exports = router;



