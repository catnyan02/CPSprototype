import React from 'react';

const ProgressBar = ({ currentMicroworldIndex, totalMicroworlds, currentPhase }) => {
  // progress across 3 microworlds
  const percent = ((currentMicroworldIndex) / totalMicroworlds) * 100;
  
  return (
    <div className="progress-bar-container">
      <div className="phase-info">
        <span>Microworld {currentMicroworldIndex + 1} of {totalMicroworlds}</span>
        <span className="phase-badge">{currentPhase.toUpperCase()}</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${percent}%` }}></div>
      </div>
    </div>
  );
};

export default ProgressBar;



