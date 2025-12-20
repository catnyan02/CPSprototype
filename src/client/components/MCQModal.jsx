import React, { useState, useEffect } from 'react';

const MCQModal = ({ question, options, onAnswer, disabled = false, inline = false }) => {
  const [selected, setSelected] = useState(null);

  // Reset selection when question changes (e.g., moving from item5 to item6)
  useEffect(() => {
    setSelected(null);
  }, [question]);

  // Options are strings like "A. ...", "B. ..."
  // We can just send the index 0..3 or the letter if we parse it.
  // Server expects A, B, C, D?
  // Spec: "S5,m=1 if the student selects option B".
  // Let's assume onAnswer sends 'A', 'B', 'C', or 'D'.
  
  const handleSubmit = () => {
    if (selected !== null && !disabled) {
      const letter = ['A', 'B', 'C', 'D'][selected];
      onAnswer(letter);
    }
  };

  const card = (
    <div className={inline ? 'mcq-card' : 'mcq-modal'}>
      <p className="question-text" style={{ whiteSpace: 'pre-line' }}>{question}</p>
      
      <div className="options-list">
        {options.map((opt, i) => (
          <label key={i} className={`option-label ${selected === i ? 'selected' : ''}`}>
            <input 
              type="radio" 
              name="mcq" 
              checked={selected === i} 
              onChange={() => !disabled && setSelected(i)}
              disabled={disabled}
            />
            <span className="option-text" style={{ whiteSpace: 'pre-line' }}>{opt}</span>
          </label>
        ))}
      </div>

      <button 
        className="submit-btn" 
        disabled={selected === null || disabled}
        onClick={handleSubmit}
      >
        Submit Answer
      </button>
      {disabled && <p className="subdued small">Session has ended. Responses are locked.</p>}
    </div>
  );

  if (inline) return card;

  return (
    <div className="modal-overlay">
      {card}
    </div>
  );
};

export default MCQModal;



