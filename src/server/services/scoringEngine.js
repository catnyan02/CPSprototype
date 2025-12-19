const { getLogs } = require('./eventLogger');
const scoringConfig = require('../../../config/scoring.json');

/**
 * Computes scores for a single microworld session
 */
function scoreMicroworld(sessionId, microworldId, microworldConfig, sessionData) {
  const mwLogs = getLogs(sessionId).filter(l => l.microworldId === microworldId);
  const responses = sessionData.responses[microworldId] || {};
  const diagram = sessionData.diagrams[microworldId] || { arrows: [] };
  
  // -- Knowledge Acquisition (KA) --
  // S1: Topology, S2: Polarity, S3: Magnitude
  const { s1, s2, s3 } = scoreKA(diagram, microworldConfig);
  
  // -- Knowledge Application (KApp) --
  // S4: Control, S5: MCQ1, S6: MCQ2
  const { s4, s5, s6 } = scoreKApp(responses, microworldConfig);

  // -- Strategy Use (SU) --
  // S7: VOTAT, S8: Systematic
  const { s7, s8 } = scoreSU(mwLogs, microworldConfig);

  return {
    s1, s2, s3, s4, s5, s6, s7, s8,
    ka: s1 + s2 + s3,
    kapp: s4 + s5 + s6,
    su: s7 + s8
  };
}

function scoreKA(diagram, config) {
  // Map IDs to indices
  const inputIds = config.inputs.map(i => i.id);
  const outputIds = config.outputs.map(o => o.id);
  
  const trueLinks = []; // { from, to, polarity, magnitude }
  
  config.effectMatrixB.forEach((row, outIdx) => {
    row.forEach((val, inIdx) => {
      if (val !== 0) {
        trueLinks.push({
          from: inputIds[inIdx],
          to: outputIds[outIdx],
          polarity: val > 0 ? 1 : -1,
          magnitude: Math.abs(val) // Assuming 1, 2, 3
        });
      }
    });
  });

  const drawnArrows = diagram.arrows || [];
  
  let tp = 0;
  let fp = 0;
  let correctPolarity = 0;
  let correctMagnitude = 0;

  // Check each drawn arrow
  drawnArrows.forEach(arrow => {
    // Find corresponding true link
    const match = trueLinks.find(l => l.from === arrow.fromInputId && l.to === arrow.toOutputId);
    
    if (match) {
      tp++;
      // Check polarity (arrow.polarity is +1 or -1?)
      // Frontend should send +1 or -1 or string? assuming numbers for now
      if (Number(arrow.polarity) === match.polarity) {
        correctPolarity++;
      }
      // Check magnitude
      if (Number(arrow.magnitude) === match.magnitude) {
        correctMagnitude++;
      }
    } else {
      fp++;
    }
  });

  const s1 = Math.max(0, tp - fp);
  const s2 = correctPolarity;
  const s3 = correctMagnitude;

  return { s1, s2, s3 };
}

function scoreKApp(responses, config) {
  // S4: Control targets
  // responses.finalOutputs: { outputId: value }
  const finalOutputs = responses.finalOutputs || {};
  let targetsMet = 0;
  const totalTargets = Object.keys(config.targets).length;
  
  if (Object.keys(finalOutputs).length > 0) {
    for (const [outId, targetVal] of Object.entries(config.targets)) {
      const actualVal = finalOutputs[outId];
      if (actualVal !== undefined) {
        const op = config.targetComparison[outId];
        let met = false;
        if (op === '>=') met = actualVal >= targetVal;
        else if (op === '<=') met = actualVal <= targetVal;
        else met = actualVal === targetVal; // default
        
        if (met) targetsMet++;
      }
    }
  }

  let s4 = 0;
  if (targetsMet === totalTargets) s4 = 2;
  else if (targetsMet > 0) s4 = 1;

  // S5, S6: MCQ
  const mcq = responses.mcq || {};
  const s5 = (mcq.item5 === config.mcq.item5.correct) ? 1 : 0;
  const s6 = (mcq.item6 === config.mcq.item6.correct) ? 1 : 0;

  return { s4, s5, s6 };
}

function scoreSU(logs, config) {
  // Extract trials (CLICK_APPLY events)
  // Payload of CLICK_APPLY has { inputs: [...] } ?
  // Or we reconstruct from MOVE_SLIDER?
  // Plan says: "Event types: ... CLICK_APPLY"
  // Log payload for apply: { inputs: [v1, v2, v3], outputs: [...] }
  
  const trials = logs.filter(l => l.type === 'CLICK_APPLY' && l.phase === 'explore')
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  // Determine initial inputs
  let currentInputs = config.inputs.map(i => i.initial);
  
  const validTrials = []; // { changedIndex: number | null } (null if multiple or zero)

  trials.forEach(trial => {
    const trialInputs = trial.payload.inputs; // Expect array matching input order
    let changes = 0;
    let changedIdx = -1;
    
    if (!trialInputs) return;

    for (let i = 0; i < trialInputs.length; i++) {
      if (trialInputs[i] !== currentInputs[i]) {
        changes++;
        changedIdx = i;
      }
    }

    if (changes === 1) {
      validTrials.push({ changedIndex: changedIdx });
    } else {
      validTrials.push({ changedIndex: null }); // Invalid VOTAT
    }
    
    currentInputs = trialInputs;
  });

  // S7: VOTAT count
  const votatCount = validTrials.filter(t => t.changedIndex !== null).length;
  const s7 = votatCount >= scoringConfig.votatMinTrials ? 1 : 0;

  // S8: Systematic sequence
  // "run of 3 consecutive valid single-input trials covering all three inputs"
  let s8 = 0;
  const inputCount = config.inputs.length; // 3
  
  for (let i = 0; i <= validTrials.length - inputCount; i++) {
    const subset = validTrials.slice(i, i + inputCount);
    
    // Check if all are valid VOTAT
    if (subset.some(t => t.changedIndex === null)) continue;
    
    // Check if all indices are unique
    const indices = new Set(subset.map(t => t.changedIndex));
    if (indices.size === inputCount) {
      s8 = 1;
      break;
    }
  }

  return { s7, s8 };
}

function computeAggregateScores(session, microworldsConfig) {
  let totalKA = 0, totalKApp = 0, totalSU = 0;
  const mwScores = {};

  session.microworldOrder.forEach(mwId => {
    const mwConfig = microworldsConfig[mwId];
    if (!mwConfig) return;

    const scores = scoreMicroworld(session.sessionId, mwId, mwConfig, session);
    mwScores[mwId] = scores;
    
    totalKA += scores.ka;
    totalKApp += scores.kapp;
    totalSU += scores.su;
  });

  // Determine bands
  const bands = scoringConfig.bands;
  const getBand = (score, dimension) => {
    const dimBands = bands[dimension];
    for (const [bandName, range] of Object.entries(dimBands)) {
      if (score >= range[0] && score <= range[1]) return bandName;
    }
    return 'Unknown';
  };

  return {
    microworldScores: mwScores,
    aggregates: {
      ka: totalKA,
      kapp: totalKApp,
      su: totalSU
    },
    bands: {
      ka: getBand(totalKA, 'KA'),
      kapp: getBand(totalKApp, 'KApp'),
      su: getBand(totalSU, 'SU')
    }
  };
}

module.exports = { scoreMicroworld, computeAggregateScores };

