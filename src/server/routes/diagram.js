const express = require('express');
const router = express.Router();
const { updateSession } = require('../services/sessionService');

router.post('/', (req, res) => {
  const { sessionId, microworldId, arrows } = req.body;

  if (!sessionId || !microworldId || !arrows) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Update session with diagram data
    // structure: session.diagrams[microworldId] = { arrows }
    
    // We need to fetch current session to merge correctly deep?
    // updateSession does a shallow merge of top-level keys usually, or we implement deep update.
    // My sessionService.updateSession does `{ ...session, ...updates }`.
    // So I need to read, modify diagrams, and save.
    
    // Better: let's use a callback or read-modify-write pattern inside sessionService if we want atomic?
    // For this prototype, I'll read-modify-write here using the service methods.
    
    const { getSession } = require('../services/sessionService');
    const session = getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const updatedDiagrams = {
      ...session.diagrams,
      [microworldId]: { arrows }
    };

    updateSession(sessionId, { diagrams: updatedDiagrams });

    res.json({ success: true });
  } catch (err) {
    console.error('Error saving diagram:', err);
    res.status(500).json({ error: 'Failed to save diagram' });
  }
});

module.exports = router;



