const express = require('express');
const router = express.Router();
const { createSession } = require('../services/sessionService');

router.post('/', (req, res) => {
  try {
    const session = createSession();
    res.json(session);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

module.exports = router;

