const express = require('express');
const router = express.Router();
const { logEvent } = require('../services/eventLogger');

router.post('/', (req, res) => {
  try {
    const events = Array.isArray(req.body) ? req.body : [req.body];
    
    // We expect events to contain sessionId. 
    // If not, we might need to look it up or expect it in the body.
    // The spec says "POST /api/event -> log TrialEvent".
    // Payload should probably include sessionId or we rely on the body content.
    // My eventLogger.logEvent takes (sessionId, eventData).
    
    events.forEach(event => {
      const { sessionId, ...eventData } = event;
      if (sessionId) {
        logEvent(sessionId, eventData);
      } else {
        console.warn('Event received without sessionId:', event);
      }
    });

    res.json({ success: true, count: events.length });
  } catch (err) {
    console.error('Error logging events:', err);
    res.status(500).json({ error: 'Failed to log events' });
  }
});

module.exports = router;



