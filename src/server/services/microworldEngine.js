const { max, min } = Math;

function clamp(value, minVal = 0, maxVal = 100) {
  return max(minVal, min(maxVal, value));
}

/**
 * Computes new outputs based on current outputs and current inputs.
 * Y_new = clamp(Y_old + B * X_current)
 * @param {number[]} currentOutputs - Array of current output values
 * @param {number[]} inputs - Array of current input values
 * @param {number[][]} effectMatrixB - 3x3 Matrix
 * @returns {number[]} New output values
 */
function computeOutputs(currentOutputs, inputs, effectMatrixB) {
  const newOutputs = [...currentOutputs];

  for (let i = 0; i < newOutputs.length; i++) {
    let change = 0;
    for (let j = 0; j < inputs.length; j++) {
      change += effectMatrixB[i][j] * inputs[j];
    }
    newOutputs[i] = clamp(newOutputs[i] + change);
  }
  return newOutputs;
}

module.exports = { computeOutputs, clamp };
