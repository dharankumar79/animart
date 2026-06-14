// ============================================================
//  routes/auth.js - Register, login, and mobile verification
// ============================================================

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDB } = require('../db/database');
const { authenticate, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();
const pendingMobileCodes = new Map();

function normalizeMobile(mobile) {
  return String(mobile || '').replace(/\s+/g, '').trim();
}

function createCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// POST /api/auth/request-sms-code
// Body: { mobile }
router.post(['/request-sms-code', '/request-whatsapp-code'], (req, res) => {
  const mobile = normalizeMobile(req.body.mobile);

  if (!/^\+\d{8,15}$/.test(mobile)) {
    return res.status(400).json({ error: 'Enter a mobile number with country code, like +919876543210.' });
  }

  const code = createCode();
  pendingMobileCodes.set(mobile, {
    code,
    expiresAt: Date.now() + 10 * 60 * 1000
  });

  res.json({
    message: 'Verification code created.',
    devCode: code
  });
});

// POST /api/auth/verify-sms-code
// Body: { mobile, code }
router.post(['/verify-sms-code', '/verify-whatsapp-code'], (req, res) => {
  const mobile = normalizeMobile(req.body.mobile);
  const code = String(req.body.code || '').trim();
  const pending = pendingMobileCodes.get(mobile);

  if (!pending || pending.expiresAt < Date.now()) {
    pendingMobileCodes.delete(mobile);
    return res.status(400).json({ error: 'Verification code expired. Please request a new one.' });
  }

  if (pending.code !== code) {
    return res.status(400).json({ error: 'Incorrect verification code.' });
  }

  pendingMobileCodes.delete(mobile);
  const verificationToken = jwt.sign({ mobile, mobileVerified: true }, JWT_SECRET, { expiresIn: '15m' });
  res.json({ message: 'Mobile number verified.', verificationToken });
});

// POST /api/auth/register
// Body: { name, email, password, mobile, verificationToken }
router.post('/register', (req, res) => {
  const { name, email, password, verificationToken } = req.body;
  const mobile = normalizeMobile(req.body.mobile);

  if (!name || !email || !password || !mobile || !verificationToken) {
    return res.status(400).json({ error: 'name, email, password, and verified mobile are required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  try {
    const verified = jwt.verify(verificationToken, JWT_SECRET);
    if (!verified.mobileVerified || verified.mobile !== mobile) {
      return res.status(400).json({ error: 'Mobile verification does not match this number.' });
    }
  } catch (err) {
    return res.status(400).json({ error: 'Please verify your mobile number again.' });
  }

  const db = getDB();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  const result = db
    .prepare('INSERT INTO users (name, email, mobile, mobile_verified, password) VALUES (?, ?, ?, ?, ?)')
    .run(name, email.toLowerCase().trim(), mobile, 1, hashedPassword);

  const token = generateToken({ id: result.lastInsertRowid, name, email, mobile, role: 'user' });

  res.status(201).json({
    message: 'Account created successfully!',
    token,
    user: { id: result.lastInsertRowid, name, email, mobile, mobile_verified: 1, role: 'user' }
  });
});

// POST /api/auth/login
// Body: { email, password }
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const db = getDB();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = generateToken({
    id: user.id,
    name: user.name,
    email: user.email,
    mobile: user.mobile,
    role: user.role
  });

  res.json({
    message: 'Login successful!',
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      mobile_verified: user.mobile_verified,
      role: user.role
    }
  });
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  const db = getDB();
  const user = db
    .prepare('SELECT id, name, email, mobile, mobile_verified, role, created_at FROM users WHERE id = ?')
    .get(req.user.id);

  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user });
});

function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

module.exports = router;
