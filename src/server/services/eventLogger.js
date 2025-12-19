const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(process.cwd(), 'data', 'logs');

// Ensure log directory exists (redundant if setup script ran, but good practice)
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function logEvent(sessionId, eventData) {
  const logFile = path.join(LOG_DIR, `${sessionId}.log.jsonl`);
  
  const record = {
    ...eventData,
    serverTimestamp: new Date().toISOString(),
    sessionId // Ensure sessionId is in the record
  };

  const line = JSON.stringify(record) + '\n';

  fs.appendFile(logFile, line, (err) => {
    if (err) {
      console.error(`Failed to write to log file ${logFile}:`, err);
    }
  });
}

function getLogs(sessionId) {
  const logFile = path.join(LOG_DIR, `${sessionId}.log.jsonl`);
  if (!fs.existsSync(logFile)) return [];
  
  try {
    const content = fs.readFileSync(logFile, 'utf-8');
    return content.trim().split('\n').map(line => JSON.parse(line));
  } catch (err) {
    console.error(`Failed to read log file ${logFile}:`, err);
    return [];
  }
}

module.exports = { logEvent, getLogs };

