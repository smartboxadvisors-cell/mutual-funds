// server-simple.js - Simplified version to test
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDb = require('./config/db');

const app = express();

// Simple CORS
app.use(cors());
app.use(express.json());

// Connect to DB
connectDb();

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/instruments', require('./routes/instruments'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api', require('./routes/list'));

// Health check
app.get('/', (req, res) => res.json({ ok: true }));
app.get('/api/health', (req, res) => res.json({ status: 'ok', db: 'connected' }));

// 404 handler
app.use((req, res) => res.status(404).json({ error: 'Not found', path: req.originalUrl }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`server is listening on port ${PORT}`));
