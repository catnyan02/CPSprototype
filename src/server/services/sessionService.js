const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { shuffle } = require('../utils/shuffle');
const microworldsConfig = require(path.join(process.cwd(), 'config', 'microworlds.json'));

const SESSION_DIR = path.join(process.cwd(), 'data', 'sessions');
const SESSION_DURATION_MS = 60 * 60 * 1000;

if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

function createSession() {
  const sessionId = uuidv4();
  const microworldIds = Object.keys(microworldsConfig);
  // Randomize order
  const microworldOrder = shuffle([...microworldIds]);
  const serverNow = Date.now();
  const sessionEndsAt = serverNow + SESSION_DURATION_MS;
  
  const session = {
    sessionId,
    createdAt: new Date(serverNow).toISOString(),
    sessionEndsAt,
    microworldOrder,
    currentMicroworldIndex: 0,
    currentPhase: 'explore', // explore -> diagram -> control -> mcq -> next microworld
    diagrams: {}, // { mwId: { arrows: [] } }
    responses: {}, // { mwId: { mcq: {}, finalOutputs: {} } }
    scores: null
  };

  saveSession(session);
  
  // Return public session info (excluding full config if we want to fetch it incrementally, 
  // but for now we might just send the order and let client fetch configs)
  return {
    sessionId,
    microworldOrder,
    sessionEndsAt,
    serverTime: serverNow,
    // We can send the config for the first microworld immediately or let client fetch.
    // Spec says: POST /api/session -> { sessionId, microworldOrder, config }
    // config here might mean "global config" or "first mw config"?
    // "microworlds.json: three microworld definitions"
    // I'll return the config for the *current* microworld (first one) to save a roundtrip?
    // Or just the order. The plan says "return sessionId + microworld order".
  };
}

function getSession(sessionId) {
  const filePath = path.join(SESSION_DIR, `${sessionId}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    console.error(`Error reading session ${sessionId}:`, err);
    return null;
  }
}

function updateSession(sessionId, updates) {
  const session = getSession(sessionId);
  if (!session) return null;
  
  const updatedSession = { ...session, ...updates };
  saveSession(updatedSession);
  return updatedSession;
}

function saveSession(session) {
  const filePath = path.join(SESSION_DIR, `${session.sessionId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
}

module.exports = { createSession, getSession, updateSession };

