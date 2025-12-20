import React, { useState, useEffect, useRef } from 'react';
import SliderPanel from './components/SliderPanel';
import OutputPanel from './components/OutputPanel';
import SessionTimer from './components/Timer';
import DiagramBuilder from './components/DiagramBuilder';
import MCQModal from './components/MCQModal';
import ProgressBar from './components/ProgressBar';
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

const SCENARIO_TEXT = {
  semesterManager: 'Scenario: You are managing your academic semester. Your goal is to balance performance, progress, and stress.',
  presentationPrep: 'Scenario: You are preparing an important academic presentation.',
  tutoringSideGig: 'Scenario: You are tutoring students while preparing for your own exams.'
};

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
  const [showInstructions, setShowInstructions] = useState(false);
  const [practiceInputs, setPracticeInputs] = useState([0, 0, 0]);
  const [practiceOutputs, setPracticeOutputs] = useState([0, 0]);

  const { log, flush } = useEventBuffer(session?.sessionId);

  // Helper: Clamp
  const clamp = (val, min = 0, max = 100) => Math.max(min, Math.min(max, val));

  // Compute outputs locally for responsiveness: outputs = clamp(outputs + B * inputs)
  const computeOutputs = (currentIn, currentOut, effectMatrix) => {
    const nextOut = [...currentOut];

    for (let i = 0; i < nextOut.length; i++) {
      let change = 0;
      for (let j = 0; j < currentIn.length; j++) {
        change += effectMatrix[i][j] * currentIn[j];
      }
      nextOut[i] = clamp(nextOut[i] + change);
    }
    return nextOut;
  };

  // Practice mini-sim
  const PRACTICE_BASE = 0;
  const PRACTICE_MIN = 0;
  const PRACTICE_MAX = 100;
  const PRACTICE_SCALE = 10; // scale 0-5 inputs into 0-100 outputs
  const PRACTICE_WEIGHTS = [
    [1, -1, 1],
    [1, 1, -1]
  ];

  const resetPractice = () => {
    setPracticeInputs([PRACTICE_BASE, PRACTICE_BASE, PRACTICE_BASE]);
    setPracticeOutputs([PRACTICE_BASE, PRACTICE_BASE]);
  };

  const applyPractice = () => {
    const deltas = PRACTICE_WEIGHTS.map((weights) => {
      const weighted = weights.reduce((acc, w, idx) => acc + w * practiceInputs[idx], 0);
      return weighted * PRACTICE_SCALE;
    });

    setPracticeOutputs((current) =>
      deltas.map((delta, idx) =>
        clamp(Math.round(current[idx] + delta), PRACTICE_MIN, PRACTICE_MAX)
      )
    );
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
    setShowInstructions(nextPhase === PHASE.EXPLORE || nextPhase === PHASE.DIAGRAM || nextPhase === PHASE.CONTROL);

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

  useEffect(() => {
    // Show the instruction modal whenever we enter explore, diagram, or control phases
    if (phase === PHASE.EXPLORE || phase === PHASE.DIAGRAM || phase === PHASE.CONTROL) {
      setShowInstructions(true);
    } else {
      setShowInstructions(false);
    }
  }, [phase]);

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
    setOutputs(initOutputs);
  };

  const onApply = () => {
    if (sessionExpired || isEndingSession) return;
    if (phase === PHASE.CONTROL && controlSteps >= 6) return;

    const newOutputs = computeOutputs(inputs, outputs, currentMicroworld.effectMatrixB);
    setOutputs(newOutputs);
    
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

  const getPhaseInstructionContent = () => {
    if (!currentMicroworld) return null;
    const scenario = SCENARIO_TEXT[currentMicroworld.id];
    const lines = [];
    if (scenario) {
      lines.push(scenario);
    }

    if (phase === PHASE.EXPLORE) {
      return {
        subtitle: '| Phase 1: Exploration',
        lines: [
          ...lines,
          'Adjust the sliders to see how outputs respond, then click Apply to view the changes.',
          'Try different combinations - there are no penalties for exploration.',
          'Use Reset to return inputs and outputs to their starting values.'
        ]
      };
    }

    if (phase === PHASE.DIAGRAM) {
      return {
        subtitle: '| Phase 2: Understanding the system',
        lines: [
          ...lines,
          'Task 1: Draw arrows from each input to the outputs it affects.',
          'Task 2: Mark each effect as positive (+) or negative (-).',
          'Task 3: Rate the strength: 1 = Weak, 2 = Moderate, 3 = Strong.'
        ]
      };
    }

    if (phase === PHASE.CONTROL) {
      const targetLines = currentMicroworld.targets
        ? Object.entries(currentMicroworld.targets).map(([outId, targetVal]) => {
            const outputLabel = currentMicroworld.outputs.find((o) => o.id === outId)?.label || outId;
            const op = currentMicroworld.targetComparison?.[outId] || '>=';
            return `${outputLabel} ${op} ${targetVal}`;
          })
        : [];

      return {
        subtitle: '| Phase 3: Managing the system',
        lines: [
          ...lines,
          'Adjust inputs to reach the target goals shown below.',
          ...targetLines,
          'You have up to 6 Apply steps in this phase; changes only count when you click Apply.'
        ]
      };
    }

    return null;
  };

  const renderInstructionPanels = () => {
    if (!currentMicroworld || phase === PHASE.START || phase === PHASE.FEEDBACK) return null;

    // Hide inline instructions; instructions now live in modal for explore, diagram, control, and MCQ
    if (phase === PHASE.EXPLORE || phase === PHASE.DIAGRAM || phase === PHASE.CONTROL || phase === PHASE.MCQ) return null;

    const blocks = [];
    const scenario = SCENARIO_TEXT[currentMicroworld.id];
    if (scenario) {
      blocks.push({
        title: 'Scenario',
        items: [scenario]
      });
    }

    if (phase === PHASE.EXPLORE) {
      blocks.push({
        title: 'Phase 1: Exploration',
        items: [
          'Adjust the sliders to see how outputs respond, then click Apply to view the changes.',
          'Try different combinations—there are no penalties for exploration.',
          'Use Reset to return inputs and outputs to their starting values.'
        ]
      });
    } else if (phase === PHASE.CONTROL) {
      const targetLines = currentMicroworld.targets
        ? Object.entries(currentMicroworld.targets).map(([outId, targetVal]) => {
            const outputLabel = currentMicroworld.outputs.find((o) => o.id === outId)?.label || outId;
            const op = currentMicroworld.targetComparison?.[outId] || '>=';
            return `${outputLabel} ${op} ${targetVal}`;
          })
        : [];

      blocks.push({
        title: 'Phase 3: Managing the system',
        items: [
          'Adjust inputs to reach the target goals shown below.',
          ...targetLines,
          'You have up to 6 Apply steps in this phase; changes only count when you click Apply.'
        ]
      });
    } else if (phase === PHASE.MCQ) {
      blocks.push({
        title: 'Phase 4: Multiple choice',
        items: [
          'Answer two questions based on the causal model you discovered.',
          'Each option represents a single combined slider adjustment; changes happen simultaneously.',
          'Choose the option that best meets the stated goal without causing unwanted changes.'
        ]
      });
    } else if (phase === PHASE.SCORING) {
      blocks.push({
        title: 'Scoring',
        items: ['Please wait while your responses are saved and scored.']
      });
    }

    if (blocks.length === 0) return null;

    return (
      <div className="instruction-panels">
        {blocks.map((block, idx) => (
          <div className="instruction-card" key={`${block.title}-${idx}`}>
            <h3>{block.title}</h3>
            <ul>
              {block.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  };

  if (!session) {
    return (
      <div className="start-screen">
        <div className="start-wrapper">
          <div className="start-card start-grid">
            <div className="start-hero">
              <div className="start-header">
                <h1 className="start-title">Complex Problem-Solving Assessment</h1>
                <p className="start-subtitle">Estimated time: about 60 minutes. You will work at your own pace.</p>
              </div>

              <div className="start-hero-note">
                <p>In this assessment, you will work with three independent interactive tasks.</p>
                <p>Each task represents a small dynamic system related to academic life.</p>
                <p>There are no penalties for exploration.</p>
                <p>You are encouraged to try different input combinations to understand how the system works.</p>
                <p>Please read all instructions carefully and work at your own pace.</p>
              </div>

              <div className="start-timeline">
                <div className="start-step">
                  <span className="start-step-number">1</span>
                  <p>Explore how the system works by adjusting the input variables.</p>
                </div>
                <div className="start-step">
                  <span className="start-step-number">2</span>
                  <p>Answer questions based on what you discovered.</p>
                </div>
                <div className="start-step">
                  <span className="start-step-number">3</span>
                  <p>Use your understanding to reach specific goals.</p>
                </div>
              </div>

              <div className="start-primary-action">
                <button className="start-btn" onClick={startSession}>Begin Assessment</button>
              </div>
            </div>

            <div className="practice-module elevated">
              <div className="practice-header">
                <h3>Practice Area</h3>
              </div>

              <div className="practice-note">
                <p className="practice-note-title">Before the main tasks, practise on this short example to familiarize yourself with:</p>
                <ul>
                  <li>Adjusting the sliders</li>
                  <li>Observing output changes</li>
                  <li>Confirming your actions</li>
                </ul>
                <p className="practice-note-foot">This example is not scored.</p>
              </div>

              <div className="practice-layout">
                <div className="practice-sliders">
                  {['Input A', 'Input B', 'Input C'].map((label, idx) => (
                    <div className="practice-slider-group" key={label}>
                      <label className="practice-label">{label}</label>
                      <input
                        type="range"
                        min="0"
                        max="5"
                        step="1"
                        value={practiceInputs[idx]}
                        className="slider-vertical practice-slider"
                        onChange={(e) => {
                          const next = [...practiceInputs];
                          next[idx] = Number(e.target.value);
                          setPracticeInputs(next);
                        }}
                      />
                      <span className="practice-value">{practiceInputs[idx]}</span>
                    </div>
                  ))}
                </div>

                <div className="practice-outputs">
                  {['Output X', 'Output Y'].map((label, idx) => (
                      <div className="practice-output" key={label}>
                        <span className="practice-label">{label}</span>
                        <div className="bar-container practice-bar">
                          <div
                            className="bar-fill"
                            style={{ height: `${(practiceOutputs[idx] / PRACTICE_MAX) * 100}%` }}
                          />
                        </div>
                        <span className="practice-value">{practiceOutputs[idx]}</span>
                      </div>
                    ))}
                </div>
              </div>

              <div className="practice-actions">
                <button className="apply-btn" onClick={applyPractice}>Apply</button>
                <button className="reset-btn" onClick={resetPractice}>Reset</button>
              </div>
            </div>
          </div>
        </div>
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
            showHelpButton={phase === PHASE.DIAGRAM}
            onHelpClick={() => setShowInstructions(true)}
          />
        </div>
      );
    } else if (phase === PHASE.MCQ) {
      const question = !mcqAnswer5 ? currentMicroworld.mcq.item5.question : currentMicroworld.mcq.item6.question;
      const options = !mcqAnswer5 ? currentMicroworld.mcq.item5.options : currentMicroworld.mcq.item6.options;
      const mcqTitle = !mcqAnswer5 ? 'Question 1 of 2' : 'Question 2 of 2';

      return (
        <div className="mcq-single">
          <div className="mcq-question-card mcq-single-card">
            <div className="mcq-question-header">
              <span className="badge">{mcqTitle}</span>
            </div>
            <MCQModal 
              question={question}
              options={options}
              onAnswer={handleMCQSubmit}
              disabled={isInteractionLocked}
              inline
            />
          </div>
        </div>
      );
    } else if (phase === PHASE.SCORING) {
      return <div className="loading-state">Scoring assessment...</div>;
    } else if (phase === PHASE.FEEDBACK) {
      return (
        <div className="feedback-message loading-state">
          <h3>You have completed the assessment.</h3>
          <p>Thank you for your participation.</p>
        </div>
      );
    }

    return (
      <div className="microworld-interface">
        {(phase === PHASE.CONTROL) && (
          <div className="phase-top-row">
            <div className="control-status">
              Steps: {controlSteps} / 6
            </div>
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
            {(phase === PHASE.EXPLORE || phase === PHASE.CONTROL) && (
              <button
                className="help-btn"
                title="View instructions"
                onClick={() => setShowInstructions(true)}
              >
                ?
              </button>
            )}
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

      {renderInstructionPanels()}

      <div className={`content-shell ${showBlocker ? 'blocked' : ''}`}>
        {showBlocker && (
          <div className="session-blocker" role="alert">
            <strong>Time is up.</strong> Finalizing and saving your assessment...
          </div>
        )}
        {renderContent()}
      </div>

      {showInstructions && currentMicroworld && [PHASE.EXPLORE, PHASE.DIAGRAM, PHASE.CONTROL].includes(phase) && (() => {
        const content = getPhaseInstructionContent();
        const scenarioLine = content?.lines?.[0];
        const taskLines = content?.lines?.slice(1) || [];

        return (
          <div className="modal-overlay instruction-overlay">
            <div className="instruction-modal">
              <div className="instruction-modal-header">
                <h3 className="modal-title">{currentMicroworld.name}</h3>
                <span className="modal-subtitle">{content?.subtitle}</span>
              </div>
              {scenarioLine && <p className="modal-text">{scenarioLine}</p>}
              {taskLines.length > 0 && <hr />}
              {taskLines.map((line, idx) => (
                <p className="modal-text" key={idx}>{line}</p>
              ))}
              <button className="apply-btn" onClick={() => setShowInstructions(false)}>Continue</button>
            </div>
          </div>
        );
      })()}

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
