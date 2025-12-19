import React from 'react';

const OutputPanel = ({ outputs, values, targets, targetComparison }) => {
  return (
    <div className="output-panel">
      <h3>Outputs</h3>
      <div className="outputs-container">
        {outputs.map((output, index) => {
          const val = values[index];
          const target = targets ? targets[output.id] : null;
          const op = targetComparison ? targetComparison[output.id] : null;
          
          let met = false;
          if (target !== null) {
            if (op === '>=') met = val >= target;
            else if (op === '<=') met = val <= target;
            else met = val === target;
          }

          return (
            <div key={output.id} className="output-group">
              <label>{output.label}</label>
              <div className="bar-container">
                <div 
                  className="bar-fill" 
                  style={{ height: `${Math.min(100, Math.max(0, val))}%` }}
                />
                {target !== null && (
                  <div 
                    className={`target-line ${met ? 'met' : 'unmet'}`}
                    style={{ bottom: `${target}%` }}
                    title={`Target: ${op} ${target}`}
                  />
                )}
              </div>
              <span className="output-value">{Math.round(val)}</span>
              {target !== null && (
                <div className={`target-badge ${met ? 'success' : 'pending'}`}>
                  Target: {op} {target}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default OutputPanel;



