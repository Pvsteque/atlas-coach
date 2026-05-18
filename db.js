const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'atlas.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDB() {
  return new Promise((resolve, reject) => {
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS coaches (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          created_at INTEGER DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS athletes (
          id TEXT PRIMARY KEY,
          coach_id TEXT NOT NULL,
          name TEXT NOT NULL,
          age INTEGER,
          weight REAL,
          height REAL,
          bf REAL,
          color TEXT,
          obj TEXT,
          level TEXT,
          sport TEXT,
          notes TEXT,
          created_at INTEGER DEFAULT (unixepoch()),
          FOREIGN KEY (coach_id) REFERENCES coaches(id)
        );

        CREATE TABLE IF NOT EXISTS coach_sessions (
          id TEXT PRIMARY KEY,
          coach_id TEXT NOT NULL,
          name TEXT NOT NULL,
          exercises TEXT NOT NULL DEFAULT '[]',
          tags TEXT,
          created_at INTEGER DEFAULT (unixepoch()),
          FOREIGN KEY (coach_id) REFERENCES coaches(id)
        );

        CREATE TABLE IF NOT EXISTS assignments (
          id TEXT PRIMARY KEY,
          coach_id TEXT NOT NULL,
          athlete_id TEXT NOT NULL,
          session_id TEXT NOT NULL,
          session_name TEXT,
          athlete_name TEXT,
          scheduled_for TEXT,
          status TEXT DEFAULT 'assigned',
          created_at INTEGER DEFAULT (unixepoch()),
          FOREIGN KEY (coach_id) REFERENCES coaches(id)
        );

        CREATE TABLE IF NOT EXISTS logs (
          id TEXT PRIMARY KEY,
          coach_id TEXT NOT NULL,
          athlete_id TEXT NOT NULL,
          session_id TEXT NOT NULL,
          assign_id TEXT,
          date TEXT NOT NULL,
          rpe INTEGER,
          mood TEXT,
          notes TEXT,
          seen INTEGER DEFAULT 0,
          created_at INTEGER DEFAULT (unixepoch()),
          FOREIGN KEY (coach_id) REFERENCES coaches(id)
        );

        CREATE TABLE IF NOT EXISTS nutri_plans (
          id TEXT PRIMARY KEY,
          coach_id TEXT NOT NULL,
          athlete_id TEXT NOT NULL UNIQUE,
          prot REAL DEFAULT 0,
          carb REAL DEFAULT 0,
          fat REAL DEFAULT 0,
          FOREIGN KEY (coach_id) REFERENCES coaches(id)
        );

        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          coach_id TEXT NOT NULL,
          athlete_id TEXT NOT NULL,
          sender TEXT NOT NULL,
          text TEXT NOT NULL,
          ts INTEGER DEFAULT (unixepoch()),
          read INTEGER DEFAULT 0,
          FOREIGN KEY (coach_id) REFERENCES coaches(id)
        );
      `);
      // Migrations — ADD COLUMN silently fails if column already exists
      ['email TEXT', 'password TEXT'].forEach(col => {
        try { db.exec(`ALTER TABLE athletes ADD COLUMN ${col}`); } catch {}
      });
      try { db.exec('ALTER TABLE logs ADD COLUMN sets_data TEXT'); } catch {}
      try { db.exec('ALTER TABLE logs ADD COLUMN photos TEXT'); } catch {}
      try { db.exec('ALTER TABLE coaches ADD COLUMN coach_code TEXT'); } catch {}
      // Génère un code pour les coaches qui n'en ont pas encore
      const charset = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
      const genCode = () => Array.from({ length: 6 }, () => charset[Math.floor(Math.random() * charset.length)]).join('');
      const coachesWithoutCode = db.prepare('SELECT id FROM coaches WHERE coach_code IS NULL').all();
      for (const c of coachesWithoutCode) {
        let code;
        do { code = genCode(); } while (db.prepare('SELECT id FROM coaches WHERE coach_code = ?').get(code));
        db.prepare('UPDATE coaches SET coach_code = ? WHERE id = ?').run(code, c.id);
      }
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { db, initDB };
