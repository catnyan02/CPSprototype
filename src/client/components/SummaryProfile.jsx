import React from 'react';

const SummaryProfile = ({ scores, bands }) => {
  if (!scores) return <div>Loading scores...</div>;

  const dimensions = [
    { id: 'ka', label: 'Knowledge Acquisition', score: scores.aggregates.ka, band: bands.ka, max: 27 }, // Max depends on items (3*9=27)
    { id: 'kapp', label: 'Knowledge Application', score: scores.aggregates.kapp, band: bands.kapp, max: 12 }, // 3*4=12
    { id: 'su', label: 'Strategy Use', score: scores.aggregates.su, band: bands.su, max: 6 } // 3*2=6
  ];

  const getNarrative = (dim) => {
    // Simple placeholder narratives based on band
    if (dim.band === 'Advanced') return "Excellent performance.";
    if (dim.band === 'Proficient') return "Good understanding.";
    if (dim.band === 'Developing') return "Some understanding, room for improvement.";
    return "Initial stages of skill development.";
  };

  return (
    <div className="summary-profile">
      <h2>Assessment Results</h2>
      <div className="profile-grid">
        {dimensions.map(dim => (
          <div key={dim.id} className="profile-card">
            <h3>{dim.label}</h3>
            <div className="score-bar-container">
              <div 
                className={`score-bar-fill ${dim.band.toLowerCase()}`} 
                style={{ width: `${(dim.score / dim.max) * 100}%` }}
              >
                <span className="score-text">{dim.score} / {dim.max}</span>
              </div>
            </div>
            <div className="band-badge">{dim.band}</div>
            <p className="narrative">{getNarrative(dim)}</p>
          </div>
        ))}
      </div>
      <div className="export-note">
        <p>This profile is for diagnostic purposes only.</p>
      </div>
    </div>
  );
};

export default SummaryProfile;



