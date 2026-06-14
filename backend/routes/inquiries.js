// ============================================================
//  routes/inquiries.js  — Buy/Inquire functionality
// ============================================================

const express = require('express');
const { getDB }        = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();


// ── POST /api/inquiries ───────────────────────────────────────
//  Protected — buyer sends a purchase inquiry for a pet
//  Body: { pet_id, message? }
router.post('/', authenticate, (req, res) => {
  const { pet_id, message } = req.body;

  if (!pet_id) return res.status(400).json({ error: 'pet_id is required.' });

  const db  = getDB();
  const pet = db.prepare('SELECT * FROM pets WHERE id = ?').get(pet_id);

  if (!pet)        return res.status(404).json({ error: 'Pet listing not found.' });
  if (pet.is_sold) return res.status(409).json({ error: 'This pet has already been sold.' });

  // Prevent seller from inquiring about their own pet
  if (pet.seller_id === req.user.id) {
    return res.status(400).json({ error: 'You cannot inquire about your own listing.' });
  }

  // Prevent duplicate inquiries
  const duplicate = db.prepare(
    'SELECT id FROM inquiries WHERE pet_id = ? AND buyer_id = ?'
  ).get(pet_id, req.user.id);
  if (duplicate) {
    return res.status(409).json({ error: 'You have already sent an inquiry for this pet.' });
  }

  const result = db.prepare(
    'INSERT INTO inquiries (pet_id, buyer_id, message) VALUES (?, ?, ?)'
  ).run(pet_id, req.user.id, message || null);

  // Fetch enriched inquiry details for response
  const inquiry = db.prepare(`
    SELECT i.*, p.name AS pet_name, p.price, u.name AS buyer_name
    FROM inquiries i
    JOIN pets  p ON i.pet_id   = p.id
    JOIN users u ON i.buyer_id = u.id
    WHERE i.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json({
    message: `Inquiry sent! The seller will contact you at ${req.user.email}.`,
    inquiry
  });
});


// ── GET /api/inquiries/my ─────────────────────────────────────
//  Protected — buyer sees their own sent inquiries
router.get('/my', authenticate, (req, res) => {
  const db = getDB();
  const inquiries = db.prepare(`
    SELECT i.*, p.name AS pet_name, p.price, p.category,
           u.name AS seller_name, u.email AS seller_email
    FROM inquiries i
    JOIN pets  p ON i.pet_id    = p.id
    JOIN users u ON p.seller_id = u.id
    WHERE i.buyer_id = ?
    ORDER BY i.created_at DESC
  `).all(req.user.id);

  res.json({ inquiries, total: inquiries.length });
});


// ── GET /api/inquiries/received ───────────────────────────────
//  Protected — seller sees inquiries received on their listings
router.get('/received', authenticate, (req, res) => {
  const db = getDB();
  const inquiries = db.prepare(`
    SELECT i.*, p.name AS pet_name, p.price,
           u.name AS buyer_name, u.email AS buyer_email
    FROM inquiries i
    JOIN pets  p ON i.pet_id   = p.id
    JOIN users u ON i.buyer_id = u.id
    WHERE p.seller_id = ?
    ORDER BY i.created_at DESC
  `).all(req.user.id);

  res.json({ inquiries, total: inquiries.length });
});


// ── PATCH /api/inquiries/:id/status ──────────────────────────
//  Protected — seller accepts or rejects an inquiry
//  Body: { status: 'accepted' | 'rejected' }
router.patch('/:id/status', authenticate, (req, res) => {
  const { status } = req.body;

  if (!['accepted', 'rejected'].includes(status)) {
    return res.status(400).json({ error: "status must be 'accepted' or 'rejected'." });
  }

  const db      = getDB();
  const inquiry = db.prepare(`
    SELECT i.*, p.seller_id FROM inquiries i
    JOIN pets p ON i.pet_id = p.id
    WHERE i.id = ?
  `).get(req.params.id);

  if (!inquiry) return res.status(404).json({ error: 'Inquiry not found.' });

  // Only the seller of the related pet can change status
  if (inquiry.seller_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the seller can update this inquiry.' });
  }

  db.prepare('UPDATE inquiries SET status = ? WHERE id = ?').run(status, req.params.id);

  // If accepted, mark the pet as sold
  if (status === 'accepted') {
    db.prepare('UPDATE pets SET is_sold = 1 WHERE id = ?').run(inquiry.pet_id);
  }

  res.json({ message: `Inquiry ${status}.` });
});

module.exports = router;
