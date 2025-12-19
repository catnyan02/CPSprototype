const express = require('express');
const cors = require('cors');
const path = require('path');
const sessionRoutes = require('./routes/session');
const microworldRoutes = require('./routes/microworld');
const eventRoutes = require('./routes/event');
const diagramRoutes = require('./routes/diagram');
const controlRoutes = require('./routes/control');
const scoreRoutes = require('./routes/score');
const adminRoutes = require('./routes/admin');
const healthRoutes = require('./routes/health');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/session', sessionRoutes);
app.use('/api/microworld', microworldRoutes);
app.use('/api/event', eventRoutes);
app.use('/api/diagram', diagramRoutes);
app.use('/api/control-final', controlRoutes);
app.use('/api/score', scoreRoutes);
app.use('/admin', adminRoutes);
app.use('/health', healthRoutes);

// Serve static files from dist/client if it exists
const clientDist = path.join(__dirname, '../../client');
if (require('fs').existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

