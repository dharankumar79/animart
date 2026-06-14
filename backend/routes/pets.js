// ============================================================
//  routes/pets.js  — Full CRUD for pet listings
// ============================================================

const express = require('express');
const { getDB }               = require('../db/database');
const { authenticate, authorizeAdmin } = require('../middleware/auth');

const router = express.Router();

const VALID_CATEGORIES = ['dog', 'cat', 'bird', 'hamster', 'reptile', 'fish'];
const VALID_SOURCES    = ['Home Breed', 'Commercial'];


// ── GET /api/pets ─────────────────────────────────────────────
//  Public — get all available (unsold) listings
//  Query params: ?category=dog  |  ?source=Home+Breed  |  ?minPrice=100&maxPrice=500
router.get('/', (req, res) => {
  const { category, source, minPrice, maxPrice } = req.query;
  const db = getDB();

  let sql    = `SELECT p.*, u.name AS seller_name FROM pets p
                JOIN users u ON p.seller_id = u.id
                WHERE p.is_sold = 0`;
  const params = [];

  if (category && VALID_CATEGORIES.includes(category)) {
    sql += ' AND p.category = ?';
    params.push(category);
  }
  if (source && VALID_SOURCES.includes(source)) {
    sql += ' AND p.source = ?';
    params.push(source);
  }
  if (minPrice !== undefined) {
    sql += ' AND p.price >= ?';
    params.push(parseFloat(minPrice));
  }
  if (maxPrice !== undefined) {
    sql += ' AND p.price <= ?';
    params.push(parseFloat(maxPrice));
  }

  sql += ' ORDER BY p.created_at DESC';

  const pets = db.prepare(sql).all(...params);
  res.json({ pets, total: pets.length });
});


// ── GET /api/pets/:id ─────────────────────────────────────────
//  Public — get single pet by ID

router.get('/my/listings', authenticate, (req, res) => {
  const db   = getDB();
  const pets = db.prepare(
    'SELECT * FROM pets WHERE seller_id = ? ORDER BY created_at DESC'
  ).all(req.user.id);

  res.json({ pets, total: pets.length });
});

router.get('/:id', (req, res) => {
  const db  = getDB();
  const pet = db.prepare(`
    SELECT p.*, u.name AS seller_name, u.email AS seller_email
    FROM pets p
    JOIN users u ON p.seller_id = u.id
    WHERE p.id = ?
  `).get(req.params.id);

  if (!pet) return res.status(404).json({ error: 'Pet listing not found.' });
  res.json({ pet });
});


// ── POST /api/pets ────────────────────────────────────────────
//  Protected — create a new pet listing (logged-in users only)
//  Body: { name, category, source, price, age, description, image_url? }
router.post('/', authenticate, (req, res) => {
  const { name, category, source, price, age, description, image_url } = req.body;

  // Validation
  if (!name || !category || !source || price == null || !age || !description) {
    return res.status(400).json({ error: 'name, category, source, price, age, and description are required.' });
  }
  if (!VALID_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` });
  }
  if (!VALID_SOURCES.includes(source)) {
    return res.status(400).json({ error: `source must be one of: ${VALID_SOURCES.join(', ')}` });
  }
  if (isNaN(price) || price < 0) {
    return res.status(400).json({ error: 'price must be a non-negative number.' });
  }

  const db     = getDB();
  const result = db.prepare(`
    INSERT INTO pets (name, category, source, price, age, description, image_url, seller_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, category, source, parseFloat(price), age, description, image_url || null, req.user.id);

  const newPet = db.prepare('SELECT * FROM pets WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ message: 'Pet listing created!', pet: newPet });
});


// ── PUT /api/pets/:id ─────────────────────────────────────────
//  Protected — update own listing (or admin can update any)
router.put('/:id', authenticate, (req, res) => {
  const db  = getDB();
  const pet = db.prepare('SELECT * FROM pets WHERE id = ?').get(req.params.id);

  if (!pet) return res.status(404).json({ error: 'Pet listing not found.' });

  // Only the seller or an admin can edit
  if (pet.seller_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'You can only edit your own listings.' });
  }

  const { name, category, source, price, age, description, image_url, is_sold } = req.body;

  // Build dynamic update
  const fields  = [];
  const values  = [];

  if (name        !== undefined) { fields.push('name = ?');        values.push(name); }
  if (category    !== undefined) {
    if (!VALID_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Invalid category.' });
    fields.push('category = ?');  values.push(category);
  }
  if (source      !== undefined) {
    if (!VALID_SOURCES.includes(source))    return res.status(400).json({ error: 'Invalid source.' });
    fields.push('source = ?');    values.push(source);
  }
  if (price       !== undefined) { fields.push('price = ?');        values.push(parseFloat(price)); }
  if (age         !== undefined) { fields.push('age = ?');          values.push(age); }
  if (description !== undefined) { fields.push('description = ?');  values.push(description); }
  if (image_url   !== undefined) { fields.push('image_url = ?');    values.push(image_url); }
  if (is_sold     !== undefined) { fields.push('is_sold = ?');      values.push(is_sold ? 1 : 0); }

  if (fields.length === 0) {
    return res.status(400).json({ error: 'No fields to update.' });
  }

  values.push(req.params.id);
  db.prepare(`UPDATE pets SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM pets WHERE id = ?').get(req.params.id);
  res.json({ message: 'Listing updated.', pet: updated });
});


// ── DELETE /api/pets/:id ──────────────────────────────────────
//  Protected — delete own listing (or admin can delete any)
router.delete('/:id', authenticate, (req, res) => {
  const db  = getDB();
  const pet = db.prepare('SELECT * FROM pets WHERE id = ?').get(req.params.id);

  if (!pet) return res.status(404).json({ error: 'Pet listing not found.' });

  if (pet.seller_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'You can only delete your own listings.' });
  }

  db.prepare('DELETE FROM pets WHERE id = ?').run(req.params.id);
  res.json({ message: 'Listing deleted successfully.' });
});


// ── GET /api/pets/my/listings ─────────────────────────────────
//  Protected — get all listings by the logged-in seller

module.exports = router;
