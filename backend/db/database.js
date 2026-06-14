// ============================================================
//  db/database.js  — SQLite setup using better-sqlite3
// ============================================================

const Database = require('better-sqlite3');
const path     = require('path');

const DB_PATH = path.join(__dirname, 'pawsclaws.db');

// Singleton connection
let db;

function getDB() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');  // Better concurrent reads
    db.pragma('foreign_keys = ON');
  }
  return db;
}

// ── Create Tables ────────────────────────────────────────────
function initDB() {
  const db = getDB();

  db.exec(`
    -- Users table (breeders / buyers)
    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      email      TEXT    NOT NULL UNIQUE,
      mobile     TEXT,
      mobile_verified INTEGER NOT NULL DEFAULT 0,
      password   TEXT    NOT NULL,           -- bcrypt hash stored here
      role       TEXT    NOT NULL DEFAULT 'user',  -- 'user' | 'admin'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Pet listings table
    CREATE TABLE IF NOT EXISTS pets (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      category    TEXT    NOT NULL CHECK(category IN ('dog','cat','bird','hamster','reptile','fish')),
      source      TEXT    NOT NULL CHECK(source IN ('Home Breed','Commercial')),
      price       REAL    NOT NULL CHECK(price >= 0),
      age         TEXT    NOT NULL,
      description TEXT    NOT NULL,
      image_url   TEXT,
      is_sold     INTEGER NOT NULL DEFAULT 0,   -- 0 = available, 1 = sold
      seller_id   INTEGER NOT NULL,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Purchase inquiries table
    CREATE TABLE IF NOT EXISTS inquiries (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      pet_id     INTEGER NOT NULL,
      buyer_id   INTEGER NOT NULL,
      message    TEXT,
      status     TEXT    NOT NULL DEFAULT 'pending',  -- pending | accepted | rejected
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (pet_id)   REFERENCES pets(id)  ON DELETE CASCADE,
      FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  migratePetCategories(db);
  migrateUserMobileFields(db);
  seedData(db);
  console.log('✅ Database initialised at', DB_PATH);
}

function migratePetCategories(db) {
  const petsTable = db.prepare(`
    SELECT sql FROM sqlite_master
    WHERE type = 'table' AND name = 'pets'
  `).get();

  if (!petsTable || petsTable.sql.includes("'fish'")) return;

  db.transaction(() => {
    db.exec(`
      CREATE TABLE pets_new (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT    NOT NULL,
        category    TEXT    NOT NULL CHECK(category IN ('dog','cat','bird','hamster','reptile','fish')),
        source      TEXT    NOT NULL CHECK(source IN ('Home Breed','Commercial')),
        price       REAL    NOT NULL CHECK(price >= 0),
        age         TEXT    NOT NULL,
        description TEXT    NOT NULL,
        image_url   TEXT,
        is_sold     INTEGER NOT NULL DEFAULT 0,
        seller_id   INTEGER NOT NULL,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
      );

      INSERT INTO pets_new (
        id, name, category, source, price, age, description, image_url,
        is_sold, seller_id, created_at
      )
      SELECT
        id, name, category, source, price, age, description, image_url,
        is_sold, seller_id, created_at
      FROM pets;

      DROP TABLE pets;
      ALTER TABLE pets_new RENAME TO pets;
    `);
  })();
}

function migrateUserMobileFields(db) {
  const columns = db.prepare('PRAGMA table_info(users)').all();
  const columnNames = columns.map((column) => column.name);

  if (!columnNames.includes('mobile')) {
    db.exec('ALTER TABLE users ADD COLUMN mobile TEXT');
  }

  if (!columnNames.includes('mobile_verified')) {
    db.exec('ALTER TABLE users ADD COLUMN mobile_verified INTEGER NOT NULL DEFAULT 0');
  }
}

// ── Seed initial demo data ───────────────────────────────────
function seedData(db) {
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount > 0) return; // Already seeded

  const bcrypt = require('bcryptjs');
  const hash   = (pw) => bcrypt.hashSync(pw, 10);

  // Demo users
  const insertUser = db.prepare(
    'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)'
  );
  const adminId  = insertUser.run('Admin',         'admin@pawsclaws.com',  hash('admin123'),  'admin').lastInsertRowid;
  const seller1  = insertUser.run('Sarah Mitchell', 'sarah@example.com',   hash('pass1234'),  'user').lastInsertRowid;
  const seller2  = insertUser.run('Tom Nguyen',     'tom@example.com',     hash('pass1234'),  'user').lastInsertRowid;

  // Demo pets
  const insertPet = db.prepare(`
    INSERT INTO pets (name, category, source, price, age, description, seller_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertPet.run('Golden Retriever',     'dog',     'Home Breed', 850,  '8 weeks',  'Very friendly, first vaccination complete.',           seller1);
  insertPet.run('Siamese Kitten',       'cat',     'Home Breed', 400,  '3 months', 'Playful, litter-box trained, great with children.',    seller1);
  insertPet.run('Blue & Gold Macaw',    'bird',    'Commercial', 1200, '1 year',   'Healthy plumage, beautifully socialised bird.',        seller2);
  insertPet.run('Roborovski Hamster',   'hamster', 'Home Breed', 25,   '4 weeks',  'Active and tiny dwarf hamsters.',                      seller2);
  insertPet.run('Bearded Dragon',       'reptile', 'Commercial', 150,  '6 months', 'Eating well on greens and crickets. Docile.',          seller2);

  console.log('✅ Seed data inserted.');
}

module.exports = { getDB, initDB };
