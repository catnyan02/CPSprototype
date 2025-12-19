import React, { useState, useEffect, useRef } from 'react';
import SliderPanel from './components/SliderPanel';
import OutputPanel from './components/OutputPanel';
import SessionTimer from './components/Timer';
import DiagramBuilder from './components/DiagramBuilder';
import MCQModal from './components/MCQModal';
import ProgressBar from './components/ProgressBar';
import SummaryProfile from './components/SummaryProfile';
import ConfirmDialog from './components/ConfirmDialog';
import { useEventBuffer } from './hooks/useEventBuffer';

const PHASE = {
  START: 'start',
  EXPLORE: 'explore',
  DIAGRAM: 'diagram',
  CONTROL: 'control',
  MCQ: 'mcq',
  SCORING: 'scoring',
  FEEDBACK: 'feedback'
};

const SESSION_DURATION_MS = 60 * 60 * 1000;
const SESSION_STORAGE_KEY = 'cps-session';

const App = () => {
  const [session, setSession] = useState(null);
  const [sessionEndsAt, setSessionEndsAt] = useState(null);
  const [serverClockOffset, setServerClockOffset] = useState(0);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [isEndingSession, setIsEndingSession] = useState(false);
  const [confirmState, setConfirmState] = useState({
    open: false,
    title: '',
    message: '',
    confirmText: 'Continue',
    cancelText: 'Stay'
  });
  const confirmResolver = useRef(null);
  const [currentMicroworldIndex, setCurrentMicroworldIndex] = useState(0);
  const [currentMicroworld, setCurrentMicroworld] = useState(null);
  const [phase, setPhase] = useState(PHASE.START);
  const [inputs, setInputs] = useState([]); // Array of values
  const [outputs, setOutputs] = useState([]); // Array of values
  const [controlSteps, setControlSteps] = useState(0);
  const [scores, setScores] = useState(null);

  const { log, flush } = useEventBuffer(session?.sessionId);

  // Helper: Clamp
  const clamp = (val, min = 0, max = 100) => Math.max(min, Math.min(max, val));

  // Compute outputs locally for responsiveness
  const computeOutputs = (currentIn, prevIn, currentOut, effectMatrix) => {
    // Delta inputs
    // The spec says: outputs = clamp(outputs + B * deltaInputs)
    // If this is the FIRST step, prevIn might be same as currentIn (no delta)?
    // Or initial outputs are fixed.
    
    if (!prevIn) return currentOut;

    const delta = currentIn.map((v, i) => v - prevIn[i]);
    const nextOut = [...currentOut];

    for (let i = 0; i < nextOut.length; i++) {
      let change = 0;
      for (let j = 0; j < delta.length; j++) {
        change += effectMatrix[i][j] * delta[j];
      }
      nextOut[i] = clamp(nextOut[i] + change);
    }
    return nextOut;
  };

  const startSession = async () => {
    const res = await fetch('/api/session', { method: 'POST' });
    const data = await res.json();
    const clientNow = Date.now();
    const serverNow = data.serverTime || clientNow;
    const clockOffset = serverNow - clientNow;
    const computedEndsAt = data.sessionEndsAt || (serverNow + SESSION_DURATION_MS);
    const normalizedSession = { ...data, sessionEndsAt: computedEndsAt };

    setSession(normalizedSession);
    setSessionEndsAt(computedEndsAt);
    setServerClockOffset(clockOffset);
    setSessionExpired(false);
    setIsEndingSession(false);
    setCurrentMicroworldIndex(0);
    setPhase(PHASE.EXPLORE);
    loadMicroworld(normalizedSession.microworldOrder[0], { phaseOverride: PHASE.EXPLORE });
  };

  const loadMicroworld = async (id, options = {}) => {
    const res = await fetch(`/api/microworld/${id}`);
    const mw = await res.json();
    const nextPhase = options.phaseOverride || PHASE.EXPLORE;

    setCurrentMicroworld(mw);
    setInputs(mw.inputs.map(i => i.initial));
    setOutputs(mw.outputs.map(o => o.initial));
    setControlSteps(0);
    setPhase(nextPhase);

    if (!options.skipLog) {
      log('START_ITEM', { microworldId: mw.id }, mw.id, nextPhase);
    }
  };

  // Rehydrate an in-progress session (timer included) if it exists locally
  useEffect(() => {
    const saved = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved);
      const offset = parsed.serverClockOffset || 0;
      const stillValid = parsed.session && parsed.sessionEndsAt && (parsed.sessionEndsAt - (Date.now() + offset) > 0);

      const isCompleted = parsed.phase === PHASE.FEEDBACK;

      if (stillValid && !isCompleted) {
        setSession(parsed.session);
        setSessionEndsAt(parsed.sessionEndsAt);
        setServerClockOffset(offset);
        setSessionExpired(false);
        setIsEndingSession(false);
        setCurrentMicroworldIndex(parsed.currentMicroworldIndex || 0);
        setPhase(parsed.phase || PHASE.EXPLORE);

        if (parsed.session.microworldOrder?.length) {
          const mwId = parsed.session.microworldOrder[parsed.currentMicroworldIndex || 0];
          loadMicroworld(mwId, { phaseOverride: parsed.phase, skipLog: true });
        }
      } else {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch (err) {
      console.error('Failed to restore session from storage', err);
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }, []);

  // Persist minimal session/timer state so refreshes keep countdown intact
  useEffect(() => {
    if (!session || !sessionEndsAt) return;

    // Do not persist once feedback is reached; drop stored state so a reload starts fresh.
    if (phase === PHASE.FEEDBACK) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    }

    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        session,
        sessionEndsAt,
        serverClockOffset,
        currentMicroworldIndex,
        phase
      })
    );
  }, [session, sessionEndsAt, serverClockOffset, currentMicroworldIndex, phase]);

  // Add beforeunload warning to prevent accidental tab close during assessment
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (session && !sessionExpired && phase !== PHASE.START && phase !== PHASE.FEEDBACK) {
        e.preventDefault();
        e.returnValue = 'You have an assessment in progress. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [session, phase, sessionExpired]);

  const handleSliderChange = (index, value) => {
    if (sessionExpired || isEndingSession) return;

    // Only allow changes in explore or control
    if (phase !== PHASE.EXPLORE && phase !== PHASE.CONTROL) return;
    
    // Spec: "Phase 2... up to 6 steps"
    if (phase === PHASE.CONTROL && controlSteps >= 6) return;

    // Update inputs
    const newInputs = [...inputs];
    newInputs[index] = value;
    setInputs(newInputs);
    
    // Log every slider move per spec
    log('MOVE_SLIDER', { inputId: currentMicroworld.inputs[index].id, oldValue: inputs[index], newValue: value }, currentMicroworld.id, phase);
  };

  const handleReset = () => {
    if (sessionExpired || isEndingSession) return;
    if (!currentMicroworld) return;
    const initInputs = currentMicroworld.inputs.map((i) => i.initial);
    const initOutputs = currentMicroworld.outputs.map((o) => o.initial);
    setInputs(initInputs);
    setAppliedInputs(initInputs);
    setOutputs(initOutputs);
  };

  // Actually, to support both "Live" perception and "Discrete" logic:
  // We'll track `appliedInputs`.
  const [appliedInputs, setAppliedInputs] = useState([]);

  useEffect(() => {
    if (currentMicroworld) {
      setAppliedInputs(currentMicroworld.inputs.map(i => i.initial));
    }
  }, [currentMicroworld]);

  const onApply = () => {
    if (sessionExpired || isEndingSession) return;
    if (phase === PHASE.CONTROL && controlSteps >= 6) return;

    const newOutputs = computeOutputs(inputs, appliedInputs, outputs, currentMicroworld.effectMatrixB);
    setOutputs(newOutputs);
    setAppliedInputs(inputs);
    
    if (phase === PHASE.CONTROL) {
      setControlSteps(s => s + 1);
    }

    log('CLICK_APPLY', { inputs, outputs: newOutputs }, currentMicroworld.id, phase);
  };

  const handlePhaseComplete = async () => {
    if (sessionExpired || isEndingSession) return;

    if (phase === PHASE.EXPLORE) {
      setPhase(PHASE.DIAGRAM);
    } else if (phase === PHASE.DIAGRAM) {
      // Transition to control: Reset state?
      // Spec: "Phase 2... target values shown; user adjusts inputs..."
      // Should we reset inputs/outputs to initial? Usually yes.
      setInputs(currentMicroworld.inputs.map(i => i.initial));
      setAppliedInputs(currentMicroworld.inputs.map(i => i.initial));
      setOutputs(currentMicroworld.outputs.map(o => o.initial));
      setControlSteps(0);
      setPhase(PHASE.CONTROL);
    } else if (phase === PHASE.CONTROL) {
      // Save final control state
      setPhase(PHASE.MCQ);
    } else if (phase === PHASE.MCQ) {
      // Done with this microworld
      if (currentMicroworldIndex < session.microworldOrder.length - 1) {
        setCurrentMicroworldIndex(idx => idx + 1);
        loadMicroworld(session.microworldOrder[currentMicroworldIndex + 1]);
      } else {
        // Finish session early if last task completes before timer
        await finalizeAssessment('completed', { skipControlSave: true });
      }
    }
  };

  const handleDiagramSave = async (arrows) => {
    if (sessionExpired || isEndingSession) return;
    await fetch('/api/diagram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: session.sessionId,
        microworldId: currentMicroworld.id,
        arrows
      })
    });
    handlePhaseComplete();
  };

  const handleControlFinish = async () => {
    if (sessionExpired || isEndingSession) return;
    // Save final outputs even if steps remain?
    // "final confirm".
    // We save in the transition or separate API?
    // We need to save BEFORE MCQ maybe?
    // Let's do it in handlePhaseComplete or handleMCQSubmit
    // But we need to switch to MCQ now.
    handlePhaseComplete();
  };

  const [mcqAnswer5, setMcqAnswer5] = useState(null);
  const isDiagramPhase = phase === PHASE.DIAGRAM;

  const handleMCQSubmit = async (answer) => {
    if (sessionExpired || isEndingSession) return;
    if (!mcqAnswer5) {
      setMcqAnswer5(answer);
      // Show next question? We have item5 and item6.
      // Let's store locally and wait for second answer.
      // Hack: we'll use local state to track which question we are on.
      return; 
    }
    
    // Both answered (item5 was set, now answer is item6)
    const payload = {
      sessionId: session.sessionId,
      microworldId: currentMicroworld.id,
      finalOutputs: currentMicroworld.outputs.reduce((acc, o, i) => ({ ...acc, [o.id]: outputs[i] }), {}),
      mcq: { item5: mcqAnswer5, item6: answer }
    };

    await fetch('/api/control-final', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    setMcqAnswer5(null); // Reset for next MW
    handlePhaseComplete();
  };

  const finalizeAssessment = async (reason = 'timeout', options = {}) => {
    const { skipControlSave = false } = options;
    if (!session || isEndingSession) return;
    setIsEndingSession(true);

    try {
      if (!skipControlSave && currentMicroworld && phase !== PHASE.FEEDBACK && phase !== PHASE.SCORING) {
        const payload = {
          sessionId: session.sessionId,
          microworldId: currentMicroworld.id,
          finalOutputs: currentMicroworld.outputs.reduce(
            (acc, o, i) => ({ ...acc, [o.id]: outputs[i] }),
            {}
          )
        };

        if (mcqAnswer5) {
          payload.mcq = { item5: mcqAnswer5 };
        }

        await fetch('/api/control-final', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      if (phase !== PHASE.FEEDBACK) {
        setPhase(PHASE.SCORING);
        const res = await fetch('/api/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.sessionId })
        });
        if (res.ok) {
          const scoreData = await res.json();
          setScores(scoreData);
        }
      }
    } catch (err) {
      console.error('Failed to finalize assessment', err);
    } finally {
      log('END_SESSION', { reason, microworldId: currentMicroworld?.id });
      await flush();
      setPhase(PHASE.FEEDBACK);
      localStorage.removeItem(SESSION_STORAGE_KEY);
      setIsEndingSession(false);
    }
  };

  const handleSessionTimeout = async () => {
    if (sessionExpired || phase === PHASE.FEEDBACK) return;
    setSessionExpired(true);
    log('SESSION_TIMEOUT', { phase, microworldId: currentMicroworld?.id });
    await flush();
    await finalizeAssessment('timeout');
  };

  const timerEndTime = sessionEndsAt || session?.sessionEndsAt;
  const isInteractionLocked = sessionExpired || isEndingSession;
  const showBlocker = isInteractionLocked && phase !== PHASE.FEEDBACK;

  const requestConfirm = (config) =>
    new Promise((resolve) => {
      confirmResolver.current = resolve;
      setConfirmState({
        open: true,
        title: config?.title || 'Are you sure?',
        message: config?.message || 'You will not be able to go back. Continue?',
        confirmText: config?.confirmText || 'Continue',
        cancelText: config?.cancelText || 'Stay'
      });
    });

  const handleConfirmClose = (result) => {
    confirmResolver.current?.(result);
    confirmResolver.current = null;
    setConfirmState((prev) => ({ ...prev, open: false }));
  };

  const confirmForwardNavigation = async (message) => {
    return requestConfirm({
      title: 'Continue to next step?',
      message: message || 'You will not be able to go back. Continue?',
      confirmText: 'Continue',
      cancelText: 'Stay here'
    });
  };

  if (!session) {
    return (
      <div className="start-screen">
        <h1>MicroDYN Problem Solving Assessment</h1>
        <p>You will encounter 3 dynamic systems. Explore them, draw their structure, and control them.</p>
        <button onClick={startSession}>Start Assessment</button>
      </div>
    );
  }

  const renderContent = () => {
    if (!currentMicroworld && phase !== PHASE.FEEDBACK) {
      return <div className="loading-state">Loading Microworld...</div>;
    }

    if (phase === PHASE.DIAGRAM) {
      return (
        <div className="diagram-stage">
          <DiagramBuilder 
            inputs={currentMicroworld.inputs} 
            outputs={currentMicroworld.outputs} 
            onSave={handleDiagramSave}
            requestConfirm={requestConfirm}
          />
        </div>
      );
    } else if (phase === PHASE.MCQ) {
      return (
        <MCQModal 
          question={!mcqAnswer5 ? currentMicroworld.mcq.item5.question : currentMicroworld.mcq.item6.question}
          options={!mcqAnswer5 ? currentMicroworld.mcq.item5.options : currentMicroworld.mcq.item6.options}
          onAnswer={handleMCQSubmit}
          disabled={isInteractionLocked}
        />
      );
    } else if (phase === PHASE.SCORING) {
      return <div className="loading-state">Scoring assessment...</div>;
    } else if (phase === PHASE.FEEDBACK) {
      return <SummaryProfile scores={scores} bands={scores?.bands} />;
    }

    return (
      <div className="microworld-interface">
        {phase === PHASE.CONTROL && (
          <div className="control-status">
            Steps: {controlSteps} / 6
            {timerEndTime && (
              <div className="inline-timer">
                <SessionTimer 
                  endTime={timerEndTime} 
                  label="Session" 
                  compact 
                  clockOffsetMs={serverClockOffset}
                />
              </div>
            )}
          </div>
        )}
        
        <div className="panels-row">
          <SliderPanel 
            inputs={currentMicroworld.inputs} 
            values={inputs} 
            onChange={handleSliderChange}
            disabled={isInteractionLocked || (phase === PHASE.CONTROL && controlSteps >= 6)}
          />
          
          <div className="center-controls">
            <button 
              className="apply-btn" 
              onClick={onApply}
              disabled={isInteractionLocked || (phase === PHASE.CONTROL && controlSteps >= 6)}
            >
              Apply
            </button>
            <button
              className="reset-btn"
              onClick={handleReset}
              disabled={isInteractionLocked}
            >
              Reset
            </button>
            {(phase === PHASE.EXPLORE) && (
               <button
                 className="next-btn"
                 onClick={async () => {
                   const ok = await confirmForwardNavigation('You will not be able to return to Explore. Continue?');
                   if (ok) {
                     handlePhaseComplete();
                   }
                 }}
                 disabled={isInteractionLocked}
               >
                 Done Exploring
               </button>
            )}
            {(phase === PHASE.CONTROL) && (
               <button
                 className="next-btn"
                 onClick={async () => {
                   const ok = await confirmForwardNavigation('You will not be able to return to Control. Continue?');
                   if (ok) {
                     handleControlFinish();
                   }
                 }}
                 disabled={isInteractionLocked}
               >
                 Finish Control
               </button>
            )}
          </div>

          <OutputPanel 
            outputs={currentMicroworld.outputs} 
            values={outputs}
            targets={phase === PHASE.CONTROL ? currentMicroworld.targets : null}
            targetComparison={currentMicroworld.targetComparison}
          />
        </div>
      </div>
    );
  };

  return (
    <div className={`app-container ${isDiagramPhase ? 'diagram-fullscreen' : ''}`}>
      <ProgressBar 
        currentMicroworldIndex={currentMicroworldIndex} 
        totalMicroworlds={session.microworldOrder.length}
        currentPhase={phase} 
      />
      
      <header>
        <div>
          <h2>{currentMicroworld ? currentMicroworld.name : 'Assessment'}</h2>
          {sessionExpired && <div className="timeup-banner">Time is up</div>}
        </div>
        {phase !== PHASE.FEEDBACK && (
          <div className="header-timer">
            <SessionTimer 
              endTime={timerEndTime}
              onExpire={handleSessionTimeout}
              clockOffsetMs={serverClockOffset}
            />
          </div>
        )}
      </header>

      <div className={`content-shell ${showBlocker ? 'blocked' : ''}`}>
        {showBlocker && (
          <div className="session-blocker" role="alert">
            <strong>Time is up.</strong> Finalizing and saving your assessment...
          </div>
        )}
        {renderContent()}
      </div>

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        cancelText={confirmState.cancelText}
        onConfirm={() => handleConfirmClose(true)}
        onCancel={() => handleConfirmClose(false)}
      />
    </div>
  );
};

export default App;



