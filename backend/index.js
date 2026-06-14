// ============================================================
//  Animart Backend Server (server.js)
//  Stack: Node.js + Express + SQLite (better-sqlite3)
//  Run:   node server.js
// ============================================================

const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const { initDB } = require('./db/database');

// Route handlers
const authRoutes    = require('./routes/auth');
const petRoutes     = require('./routes/pets');
const inquiryRoutes = require('./routes/inquiries');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ───────────────────────────────────────────────
app.use(cors());                          // Allow frontend requests
app.use(express.json());                  // Parse JSON bodies
app.use(express.urlencoded({ extended: true }));

// Serve the frontend HTML file statically
app.use(express.static(path.join(__dirname, 'public')));

// ── API Routes ───────────────────────────────────────────────
app.use('/api/auth',      authRoutes);    // POST /register, POST /login
app.use('/api/pets',      petRoutes);     // CRUD for pet listings
app.use('/api/inquiries', inquiryRoutes); // POST inquiry / GET my-inquiries

// ── Health check ─────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Animart API is running!' });
});

// ── 404 handler ──────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Global error handler ─────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Boot ─────────────────────────────────────────────────────
initDB();   // Create tables + seed data if they don't exist
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
  console.log(`   API docs: http://localhost:${PORT}/api/health`);
});

module.exports = app;
