const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { getLogs } = require('../services/eventLogger');

const SESSION_DIR = path.join(process.cwd(), 'data', 'sessions');

router.get('/export', (req, res) => {
  const { format, secret } = req.query;

  // Simple auth check
  if (secret !== 'cps-admin-secret') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const files = fs.readdirSync(SESSION_DIR).filter(f => f.endsWith('.json'));
    const sessions = files.map(f => {
      try {
        return JSON.parse(fs.readFileSync(path.join(SESSION_DIR, f), 'utf-8'));
      } catch {
        return null;
      }
    }).filter(Boolean);

    if (format === 'csv') {
      // Flatten data for CSV
      // Headers: sessionId, KA_total, KApp_total, SU_total, ...
      const headers = ['sessionId', 'timestamp', 'KA_total', 'KApp_total', 'SU_total'];
      
      const rows = sessions.map(s => {
        const scores = s.scores || { aggregates: { ka: 0, kapp: 0, su: 0 } };
        return [
          s.sessionId,
          s.createdAt,
          scores.aggregates?.ka || 0,
          scores.aggregates?.kapp || 0,
          scores.aggregates?.su || 0
        ].join(',');
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=sessions.csv');
      return res.send([headers.join(','), ...rows].join('\n'));
    }
    
    // Default JSON with logs included?
    // Spec says "returns sessions, logs, scores".
    // Including full logs in one JSON might be huge.
    // Let's attach logs to each session.
    
    const fullData = sessions.map(s => {
      return {
        ...s,
        logs: getLogs(s.sessionId)
      };
    });

    res.json(fullData);
    
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'Export failed' });
  }
});

module.exports = router;



