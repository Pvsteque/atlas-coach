require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Routes API
app.use('/api/auth', require('./routes/auth'));
app.use('/api/athlete', require('./routes/athlete'));
app.use('/api', require('./routes/api'));

// Landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

// Coach portal
app.get('/coach', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Athlete portal
app.get('/athlete', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'athlete.html'));
});

// SPA fallback for coach portal sub-paths
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Atlas Coach running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('DB init failed:', err);
  process.exit(1);
});
