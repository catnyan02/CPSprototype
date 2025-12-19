import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

const POSITIVE_COLOR = '#16a34a';
const NEGATIVE_COLOR = '#dc2626';
const NEUTRAL_COLOR = '#6b7280';
const SELECT_COLOR = '#3b82f6';
const DEFAULT_POLARITY = 1;
const DEFAULT_MAGNITUDE = 2;
const ARROW_TIP_OFFSET = 24; // shortens line so arrowhead sits flush on the output edge

const DiagramBuilder = ({ inputs, outputs, initialArrows = null, onSave, requestConfirm }) => {
  const canvasRef = useRef(null);
  const inputRefs = useRef({});
  const outputRefs = useRef({});
  const [viewport, setViewport] = useState({ width: 900, height: 520 });
  
  // Click-to-connect state: when set, a preview line follows the cursor
  const [connectingFrom, setConnectingFrom] = useState(null);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [hoveredOutput, setHoveredOutput] = useState(null);
  
  const [selectedArrowKey, setSelectedArrowKey] = useState(null);
  const [history, setHistory] = useState(() => [initialArrows || []]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | success | error
  const [saveMessage, setSaveMessage] = useState('');

  const arrows = history[historyIndex] || [];
  const [measuredLayout, setMeasuredLayout] = useState({
    inputs: {},
    outputs: {},
    height: viewport.height,
  });

  useEffect(() => {
    const initial = initialArrows || [];
    setHistory([initial]);
    setHistoryIndex(0);
    setSelectedArrowKey(null);
    setConnectingFrom(null);
  }, [initialArrows]);

  // Track canvas size for accurate coordinates
  useEffect(() => {
    const updateSize = () => {
      const rect = canvasRef.current?.getBoundingClientRect();
      setViewport({
        width: rect?.width || 900,
        height: rect?.height || 520,
      });
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Measure nodes so arrows originate from the node edges (center-right for inputs, center-left for outputs)
  useLayoutEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const canvasRect = canvasEl.getBoundingClientRect();

    const inputPositions = {};
    inputs.forEach((input) => {
      const el = inputRefs.current[input.id];
      if (!el) return;
      const rect = el.getBoundingClientRect();
      inputPositions[input.id] = {
        x: rect.right - canvasRect.left,
        y: rect.top - canvasRect.top + rect.height / 2,
      };
    });

    const outputPositions = {};
    outputs.forEach((output) => {
      const el = outputRefs.current[output.id];
      if (!el) return;
      const rect = el.getBoundingClientRect();
      outputPositions[output.id] = {
        x: rect.left - canvasRect.left,
        y: rect.top - canvasRect.top + rect.height / 2,
      };
    });

    setMeasuredLayout({
      inputs: inputPositions,
      outputs: outputPositions,
      height: canvasRect.height || viewport.height,
    });
  }, [inputs, outputs, viewport]);

  // Global mouse move tracking when connecting
  useEffect(() => {
    if (!connectingFrom) return;

    const handleGlobalMouseMove = (e) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      setCursorPos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    return () => window.removeEventListener('mousemove', handleGlobalMouseMove);
  }, [connectingFrom]);

  // Reset save hint when arrows change
  useEffect(() => {
    setSaveState('idle');
    setSaveMessage('');
  }, [arrows]);

  // Keyboard shortcuts: undo/redo and Escape to cancel
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        setConnectingFrom(null);
        setSelectedArrowKey(null);
        return;
      }
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'z') || (e.ctrlKey && e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });

  const layout = useMemo(() => {
    const padding = 36;
    const availableHeight = Math.max(viewport.height - padding * 2, 200);
    const inputPositions = {};
    const outputPositions = {};

    inputs.forEach((input, idx) => {
      const y = padding + ((2 * idx + 1) / (2 * inputs.length)) * availableHeight;
      inputPositions[input.id] = { x: 150, y };
    });

    outputs.forEach((output, idx) => {
      const y = padding + ((2 * idx + 1) / (2 * outputs.length)) * availableHeight;
      outputPositions[output.id] = { x: viewport.width - 150, y };
    });

    return {
      inputs: { ...inputPositions, ...(measuredLayout.inputs || {}) },
      outputs: { ...outputPositions, ...(measuredLayout.outputs || {}) },
      height: Math.max(
        measuredLayout.height || viewport.height,
        padding * 2 + availableHeight
      ),
    };
  }, [inputs, outputs, viewport, measuredLayout]);

  const calculateBezierPath = (startX, startY, endX, endY) => {
    const controlOffset = Math.min(120, Math.abs(endX - startX) * 0.35);
    const c1x = startX + controlOffset;
    const c2x = endX - controlOffset;
    return `M ${startX} ${startY} C ${c1x} ${startY}, ${c2x} ${endY}, ${endX} ${endY}`;
  };

  const pushHistory = (next) => {
    setHistory((prev) => {
      const trimmed = prev.slice(0, historyIndex + 1);
      const combined = [...trimmed, next];
      const limited = combined.slice(-50);
      const newIndex = limited.length - 1;
      setHistoryIndex(newIndex);
      return limited;
    });
  };

  const setSelection = (key) => {
    setSelectedArrowKey(key);
  };

  const createArrow = (fromInputId, toOutputId) => {
    const key = `${fromInputId}-${toOutputId}`;
    const existing = arrows.find((a) => `${a.fromInputId}-${a.toOutputId}` === key);
    if (existing) {
      // Arrow already exists - select it instead
      const start = layout.inputs[fromInputId];
      const end = layout.outputs[toOutputId];
      setSelection(key);
      return;
    }
    const next = [
      ...arrows,
      { fromInputId, toOutputId, polarity: DEFAULT_POLARITY, magnitude: DEFAULT_MAGNITUDE },
    ];
    pushHistory(next);
    // Select the new arrow
    setSelection(key);
  };

  const updateSelectedArrow = (updates, targetKey = selectedArrowKey) => {
    if (!targetKey) return;
    const next = arrows.map((a) =>
      `${a.fromInputId}-${a.toOutputId}` === targetKey ? { ...a, ...updates } : a
    );
    pushHistory(next);
  };

  const removeSelectedArrow = (targetKey = selectedArrowKey) => {
    if (!targetKey) return;
    const next = arrows.filter((a) => `${a.fromInputId}-${a.toOutputId}` !== targetKey);
    pushHistory(next);
    setSelection(null);
  };

  const undo = () => setHistoryIndex((idx) => Math.max(0, idx - 1));
  const redo = () => setHistoryIndex((idx) => Math.min(history.length - 1, idx + 1));

  // Click an input to start connecting
  const handleInputStart = (e, inputId) => {
    e.stopPropagation();
    setSelectedArrowKey(null);
    
    // If already connecting from this input, cancel
    if (connectingFrom === inputId) {
      setConnectingFrom(null);
      return;
    }
    
    // Start connecting from this input
    setConnectingFrom(inputId);
    
    // Initialize cursor position
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      setCursorPos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  // Click an output to complete connection
  const handleOutputActivate = (e, outputId) => {
    e.stopPropagation();
    if (connectingFrom) {
      createArrow(connectingFrom, outputId);
      setConnectingFrom(null);
    }
  };

  // Click on canvas background cancels connecting mode
  const handleCanvasClick = (e) => {
    // Only cancel if clicking directly on canvas (not on nodes/arrows)
    if (e.target === e.currentTarget || e.target.tagName === 'svg') {
      setConnectingFrom(null);
      setSelectedArrowKey(null);
    }
  };

  // Drag-to-connect support: mouseup outside outputs cancels
  useEffect(() => {
    const handleGlobalMouseUp = (e) => {
      if (!connectingFrom) return;
      const withinBuilder = e.target?.closest('.diagram-builder');
      if (!withinBuilder) {
        setConnectingFrom(null);
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [connectingFrom]);

  const magnitudeWidth = (magnitude) => {
    if (magnitude === 3) return 5;
    if (magnitude === 1) return 2;
    return 3.5;
  };

  const polarityColor = (polarity, fallbackSelected) => {
    if (polarity > 0) return POSITIVE_COLOR;
    if (polarity < 0) return NEGATIVE_COLOR;
    return fallbackSelected ? SELECT_COLOR : NEUTRAL_COLOR;
  };

  // Calculate preview end position (snap to hovered output or follow cursor)
  const previewEndPos = useMemo(() => {
    if (!connectingFrom) return null;
    if (hoveredOutput && layout.outputs[hoveredOutput]) {
      const target = layout.outputs[hoveredOutput];
      return { x: target.x - ARROW_TIP_OFFSET, y: target.y };
    }
    return cursorPos;
  }, [connectingFrom, hoveredOutput, layout.outputs, cursorPos]);

  const connectionList = useMemo(
    () =>
      arrows
        .map((arrow) => {
          const start = layout.inputs[arrow.fromInputId];
          const end = layout.outputs[arrow.toOutputId];
          if (!start || !end) return null;
          const adjustedEnd = { x: Math.max(start.x, end.x - ARROW_TIP_OFFSET), y: end.y };
          const midX = (start.x + adjustedEnd.x) / 2;
          const midY = (start.y + end.y) / 2 - 10;
          return {
            ...arrow,
            key: `${arrow.fromInputId}-${arrow.toOutputId}`,
            start,
            end: adjustedEnd,
            midX,
            midY,
            fromLabel: inputs.find((i) => i.id === arrow.fromInputId)?.label || arrow.fromInputId,
            toLabel: outputs.find((o) => o.id === arrow.toOutputId)?.label || arrow.toOutputId,
          };
        })
        .filter(Boolean),
    [arrows, inputs, outputs, layout.inputs, layout.outputs]
  );

  const handleSave = async () => {
    let confirmed = true;
    if (requestConfirm) {
      confirmed = await requestConfirm({
        title: 'Save and continue?',
        message: 'You will not be able to return to this diagram after continuing.',
        confirmText: 'Save & continue',
        cancelText: 'Stay here'
      });
    } else {
      confirmed = window.confirm('You will not be able to return to this diagram after continuing. Continue?');
    }

    if (!confirmed) return;

    setSaveState('saving');
    setSaveMessage('');
    try {
      await Promise.resolve(onSave(arrows));
      setSaveState('success');
      setSaveMessage('Diagram saved.');
    } catch (err) {
      console.error('Save failed', err);
      setSaveState('error');
      setSaveMessage('Save failed. Check your connection and try again.');
    }
  };

  return (
    <div className="diagram-builder">
      <div className="diagram-header">
        <div>
          <h3>Causal Diagram</h3>
          <div className="header-hints subdued">
            <span>Click an input then an output to connect. Select a line to edit polarity/strength.</span>
            <span>Undo/redo: Ctrl+Z / Ctrl+Shift+Z (or use the buttons).</span>
          </div>
        </div>
        <div className="diagram-toolbar">
          <button
            type="button"
            className="ghost-btn"
            onClick={undo}
            disabled={historyIndex === 0}
            aria-label="Undo (Ctrl+Z)"
          >
            Undo
          </button>
          <button
            type="button"
            className="ghost-btn"
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
            aria-label="Redo (Ctrl+Shift+Z)"
          >
            Redo
          </button>
          <button
            type="button"
            className="save-btn"
            onClick={handleSave}
            disabled={saveState === 'saving'}
            aria-label="Save and continue"
          >
            {saveState === 'saving' ? 'Saving...' : 'Save & Continue'}
          </button>
        </div>
      </div>

      <div className="diagram-body">
        <div className="diagram-left">
          <div
            className={`canvas-shell enhanced ${connectingFrom ? 'is-connecting' : ''}`}
            ref={canvasRef}
            onClick={handleCanvasClick}
            role="application"
            aria-label="Causal diagram canvas"
          >
            <div className="nodes-column inputs">
              {inputs.map((input) => (
                <div
                  key={input.id}
                  className={`diagram-node input-node ${connectingFrom === input.id ? 'is-active' : ''}`}
                  tabIndex={0}
                  ref={(el) => {
                    if (el) {
                      inputRefs.current[input.id] = el;
                    } else {
                      delete inputRefs.current[input.id];
                    }
                  }}
                  onClick={(e) => handleInputStart(e, input.id)}
                  onMouseDown={(e) => handleInputStart(e, input.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleInputStart(e, input.id);
                    }
                  }}
                  role="button"
                  aria-pressed={connectingFrom === input.id}
                  aria-label={`${input.label}${connectingFrom === input.id ? ' (selected - click an output to connect)' : ''}`}
                >
                  <div className="node-label">{input.label}</div>
                  <div className="node-port port-right" />
                </div>
              ))}
            </div>

            <svg
              className="arrows-layer enhanced"
              width={viewport.width}
              height={layout.height}
              viewBox={`0 0 ${viewport.width} ${layout.height}`}
            >
              <defs>
                <marker
                  id="arrowhead-positive"
                  markerWidth="42"
                  markerHeight="42"
                  refX="12"
                  refY="21"
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                  viewBox="0 0 42 42"
                >
                  <path d="M0 3 L36 21 L0 39 L11.4 21 Z" fill={POSITIVE_COLOR} stroke="none" />
                </marker>
                <marker
                  id="arrowhead-negative"
                  markerWidth="42"
                  markerHeight="42"
                  refX="12"
                  refY="21"
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                  viewBox="0 0 42 42"
                >
                  <path d="M0 3 L36 21 L0 39 L11.4 21 Z" fill={NEGATIVE_COLOR} stroke="none" />
                </marker>
                <marker
                  id="arrowhead-neutral"
                  markerWidth="42"
                  markerHeight="42"
                  refX="12"
                  refY="21"
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                  viewBox="0 0 42 42"
                >
                  <path d="M0 3 L36 21 L0 39 L11.4 21 Z" fill={NEUTRAL_COLOR} stroke="none" />
                </marker>
                <marker
                  id="arrowhead-preview"
                  markerWidth="42"
                  markerHeight="42"
                  refX="12"
                  refY="21"
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                  viewBox="0 0 42 42"
                >
                  <path d="M0 3 L36 21 L0 39 L11.4 21 Z" fill={SELECT_COLOR} stroke="none" />
                </marker>
              </defs>

              {/* Existing arrows */}
              {connectionList.map((arrow) => {
                const isSelected = arrow.key === selectedArrowKey;
                const color = polarityColor(arrow.polarity, isSelected);
                const path = calculateBezierPath(arrow.start.x, arrow.start.y, arrow.end.x, arrow.end.y);
                const pathId = `connection-path-${arrow.key}`;

                const markerEnd =
                  arrow.polarity > 0
                    ? 'url(#arrowhead-positive)'
                    : arrow.polarity < 0
                    ? 'url(#arrowhead-negative)'
                    : 'url(#arrowhead-neutral)';

                return (
                  <g key={arrow.key} className="connection-group">
                    <path
                      id={pathId}
                      d={path}
                      className={`connection-path ${isSelected ? 'is-selected' : ''}`}
                      stroke={color}
                      strokeWidth={magnitudeWidth(arrow.magnitude)}
                      fill="none"
                      markerEnd={markerEnd}
                      onClick={(e) => {
                        e.stopPropagation();
                        setConnectingFrom(null);
                        setSelection(arrow.key);
                      }}
                      role="button"
                      aria-label={`Connection ${arrow.polarity > 0 ? 'positive' : arrow.polarity < 0 ? 'negative' : 'neutral'} from ${arrow.fromLabel} to ${arrow.toLabel}`}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setConnectingFrom(null);
                          setSelection(arrow.key);
                        }
                      }}
                      style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                    />
                  </g>
                );
              })}

              {/* Preview line while connecting */}
              {connectingFrom && previewEndPos && layout.inputs[connectingFrom] && (
                <path
                  d={calculateBezierPath(
                    layout.inputs[connectingFrom].x,
                    layout.inputs[connectingFrom].y,
                    previewEndPos.x,
                    previewEndPos.y
                  )}
                  className="connection-path preview"
                  stroke={SELECT_COLOR}
                  strokeWidth={4}
                  fill="none"
                  markerEnd="url(#arrowhead-preview)"
                  style={{ pointerEvents: 'none' }}
                />
              )}
            </svg>

            <div className="nodes-column outputs">
              {outputs.map((output) => (
                <div
                  key={output.id}
                  className={`diagram-node output-node ${
                    connectingFrom && hoveredOutput === output.id ? 'is-hovered' : ''
                  } ${connectingFrom ? 'is-target' : ''}`}
                  tabIndex={0}
                  ref={(el) => {
                    if (el) {
                      outputRefs.current[output.id] = el;
                    } else {
                      delete outputRefs.current[output.id];
                    }
                  }}
                  onClick={(e) => handleOutputActivate(e, output.id)}
                  onMouseUp={(e) => handleOutputActivate(e, output.id)}
                  onMouseEnter={() => connectingFrom && setHoveredOutput(output.id)}
                  onMouseLeave={() => setHoveredOutput(null)}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && connectingFrom) {
                      e.preventDefault();
                      handleOutputActivate(e, output.id);
                    }
                  }}
                  role="button"
                  aria-label={`${output.label}${connectingFrom ? ' (click to connect)' : ''}`}
                >
                  <div className="node-port port-left" />
                  <div className="node-label">{output.label}</div>
                </div>
              ))}
            </div>

            {/* Arrow editing popover */}
            {/* Editing happens in the connection list below */}
          </div>

          <div className="rail-section legend-section inline-legend">
            <div className="rail-header">
              <h4>Legend</h4>
            </div>
            <div className="legend-row" aria-live="polite">
              <div className="legend-item">
                <span className="legend-swatch positive" /> Positive effect
              </div>
              <div className="legend-item">
                <span className="legend-swatch negative" /> Negative effect
              </div>
              <div className="legend-item">
                <span className="legend-line weak" /> Weak
              </div>
              <div className="legend-item">
                <span className="legend-line moderate" /> Moderate
              </div>
              <div className="legend-item">
                <span className="legend-line strong" /> Strong
              </div>
            </div>
          </div>
        </div>

        <aside className="utility-rail">
          <div className="rail-section connections-section">
            <div className="rail-header">
              <h4>Connections</h4>
              <span className="badge">{arrows.length}</span>
            </div>
            {connectionList.length === 0 ? (
              <p className="subdued small">No connections yet. Start by linking an input to an output.</p>
            ) : (
              <div className="connection-list">
                {connectionList.map((arrow) => (
                  <div
                    key={arrow.key}
                    className={`connection-card ${selectedArrowKey === arrow.key ? 'is-selected' : ''}`}
                  >
                    <button
                      type="button"
                      className="connection-main"
                      onClick={() => {
                        setConnectingFrom(null);
                    setSelection(arrow.key);
                      }}
                    >
                      <span className="connection-title">
                        {arrow.fromLabel} → {arrow.toLabel}
                      </span>
                      <span className="connection-meta">
                        {arrow.polarity > 0 ? 'Positive' : arrow.polarity < 0 ? 'Negative' : 'Neutral'} ·{' '}
                        {arrow.magnitude === 1 ? 'Weak' : arrow.magnitude === 2 ? 'Moderate' : 'Strong'}
                      </span>
                    </button>
                    <div className="chip-group compact">
                      <button
                        type="button"
                        className={`chip ${arrow.polarity === 1 ? 'is-active positive' : ''}`}
                        onClick={() => {
                      setSelection(arrow.key);
                      updateSelectedArrow({ polarity: 1 }, arrow.key);
                        }}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className={`chip ${arrow.polarity === -1 ? 'is-active negative' : ''}`}
                        onClick={() => {
                      setSelection(arrow.key);
                      updateSelectedArrow({ polarity: -1 }, arrow.key);
                        }}
                      >
                        −
                      </button>
                      {[1, 2, 3].map((m) => (
                        <button
                          type="button"
                          key={m}
                          className={`chip ${arrow.magnitude === m ? 'is-active' : ''}`}
                          onClick={() => {
                        setSelection(arrow.key);
                        updateSelectedArrow({ magnitude: m }, arrow.key);
                          }}
                        >
                          {m === 1 ? 'W' : m === 2 ? 'M' : 'S'}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="chip danger"
                        onClick={() => {
                          removeSelectedArrow(arrow.key);
                        }}
                        aria-label={`Delete connection from ${arrow.fromLabel} to ${arrow.toLabel}`}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </aside>
      </div>

      <div className="sr-only" aria-live="polite">
        {connectingFrom
          ? `Connecting from ${inputs.find((i) => i.id === connectingFrom)?.label || 'input'}. Click an output to complete.`
          : selectedArrowKey
          ? 'Connection selected. Use the connection list to edit.'
          : 'Ready. Click an input to start connecting.'}
      </div>
    </div>
  );
};

export default DiagramBuilder;
