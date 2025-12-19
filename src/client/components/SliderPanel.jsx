import React from 'react';

const SliderPanel = ({ inputs, values, onChange, disabled }) => {
  return (
    <div className="slider-panel">
      <h3>Inputs</h3>
      <div className="sliders-container">
        {inputs.map((input, index) => (
          <div key={input.id} className="slider-group">
            <label htmlFor={`slider-${input.id}`}>{input.label}</label>
            <input
              id={`slider-${input.id}`}
              type="range"
              min={input.min}
              max={input.max}
              value={values[index]}
              onChange={(e) => onChange(index, parseInt(e.target.value, 10))}
              disabled={disabled}
              className="slider-vertical"
              orient="vertical" /* Firefox specific */
            />
            <span className="slider-value">{values[index]}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SliderPanel;



