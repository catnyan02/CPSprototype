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
const HOST = process.env.HOST || '0.0.0.0';

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

// Serve built client assets; works in dev (__dirname at src/server) and prod (__dirname at dist/server)
const clientDist = path.join(__dirname, '../client');
if (require('fs').existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // Final GET handler to support client-side routing without relying on path patterns
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api') || req.path.startsWith('/admin') || req.path.startsWith('/health')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});

