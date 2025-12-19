const express = require('express');
const router = express.Router();
const configPath = (() => {
  const distPath = path.join(__dirname, '..', '..', 'config', 'microworlds.json');
  if (require('fs').existsSync(distPath)) return distPath;
  return path.join(process.cwd(), 'config', 'microworlds.json');
})();
const microworldsConfig = require(configPath);

router.get('/:id', (req, res) => {
  const { id } = req.params;
  const config = microworldsConfig[id];
  
  if (!config) {
    return res.status(404).json({ error: 'Microworld not found' });
  }

  // Create a safe copy of the config to send to client
  // We need effectMatrixB for client-side simulation (responsiveness)
  // We strip correct answers from MCQs
  const safeConfig = JSON.parse(JSON.stringify(config));
  
  if (safeConfig.mcq) {
    Object.keys(safeConfig.mcq).forEach(key => {
      delete safeConfig.mcq[key].correct;
    });
  }

  res.json(safeConfig);
});

module.exports = router;



