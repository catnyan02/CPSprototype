const { max, min } = Math;

function clamp(value, minVal = 0, maxVal = 100) {
  return max(minVal, min(maxVal, value));
}

/**
 * Computes new outputs based on current outputs and change in inputs.
 * Y_new = Clamp(Y_old + B * (X_new - X_old))
 * @param {number[]} currentOutputs - Array of current output values
 * @param {number[]} deltaInputs - Array of changes in input values (X_new - X_old)
 * @param {number[][]} effectMatrixB - 3x3 Matrix
 * @returns {number[]} New output values
 */
function computeOutputs(currentOutputs, deltaInputs, effectMatrixB) {
  const newOutputs = [...currentOutputs];

  for (let i = 0; i < newOutputs.length; i++) {
    let change = 0;
    for (let j = 0; j < deltaInputs.length; j++) {
      change += effectMatrixB[i][j] * deltaInputs[j];
    }
    // Spec doesn't strictly specify rounding here, but usually values are integers in UI.
    // Spec says "with rounding rules per spec". I'll allow decimals internally but maybe UI rounds?
    // "outputs = clamp(outputs + B * deltaInputs)".
    // If I use integers, I should round. Let's keep precision then round at end?
    // Or just let it be float. Sliders usually are steps of 1.
    // If B has 1.5, then output will have .5.
    // I'll keep it float for now.
    newOutputs[i] = clamp(newOutputs[i] + change);
  }
  return newOutputs;
}

module.exports = { computeOutputs, clamp };

