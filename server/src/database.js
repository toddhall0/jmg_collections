import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'data', 'collections.db');

// Ensure data directory exists
import fs from 'fs';
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Initialize database schema
function initializeDatabase() {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'client', 'local_counsel')),
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Cases table
  db.exec(`
    CREATE TABLE IF NOT EXISTS cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_number TEXT UNIQUE NOT NULL,
      case_name TEXT NOT NULL,
      client_matter_reference TEXT,
      date_opened TEXT DEFAULT (date('now')),
      defendant_name TEXT NOT NULL,
      defendant_entity_type TEXT NOT NULL CHECK(defendant_entity_type IN ('Individual', 'LLC', 'Corporation', 'Partnership', 'Trust', 'Other')),
      defendant_contact_name TEXT,
      defendant_email TEXT,
      defendant_phone TEXT,
      defendant_mailing_address TEXT,
      defendant_state TEXT,
      amount_claimed REAL NOT NULL,
      date_claim_arose TEXT,
      statute_of_limitations_date TEXT,
      claim_description TEXT,
      current_stage TEXT NOT NULL DEFAULT 'Intake',
      resolution_status TEXT NOT NULL DEFAULT 'Open' CHECK(resolution_status IN ('Open', 'Settled', 'Judgment Obtained', 'Dismissed', 'Abandoned')),
      amount_recovered REAL DEFAULT 0,
      date_closed TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Case assignments (for local counsel)
  db.exec(`
    CREATE TABLE IF NOT EXISTS case_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assigned_at TEXT DEFAULT (datetime('now')),
      assigned_by INTEGER REFERENCES users(id),
      UNIQUE(case_id, user_id)
    )
  `);

  // Case counter for auto-generating case numbers
  db.exec(`
    CREATE TABLE IF NOT EXISTS case_counter (
      year INTEGER PRIMARY KEY,
      counter INTEGER DEFAULT 0
    )
  `);

  // Case notes table
  db.exec(`
    CREATE TABLE IF NOT EXISTS case_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Communication log table
  db.exec(`
    CREATE TABLE IF NOT EXISTS communications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      communication_date TEXT NOT NULL,
      type TEXT NOT NULL,
      contact_person TEXT,
      summary TEXT,
      follow_up_required INTEGER DEFAULT 0,
      follow_up_date TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Documents table
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      mime_type TEXT,
      category TEXT NOT NULL,
      uploaded_by INTEGER NOT NULL REFERENCES users(id),
      uploaded_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Tasks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      assigned_to INTEGER NOT NULL REFERENCES users(id),
      due_date TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'Medium' CHECK(priority IN ('High', 'Medium', 'Low')),
      status TEXT NOT NULL DEFAULT 'Not Started' CHECK(status IN ('Not Started', 'In Progress', 'Complete')),
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Local Counsel Contacts table (directory of external counsel)
  db.exec(`
    CREATE TABLE IF NOT EXISTS local_counsel_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      firm_name TEXT NOT NULL,
      attorney_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      states_covered TEXT,
      hourly_rate REAL,
      retainer_required REAL,
      fee_arrangement_notes TEXT,
      performance_rating TEXT DEFAULT 'Not Yet Rated' CHECK(performance_rating IN ('Excellent', 'Good', 'Satisfactory', 'Below Expectations', 'Not Yet Rated')),
      notes TEXT,
      status TEXT DEFAULT 'Active' CHECK(status IN ('Active', 'Inactive', 'Do Not Use')),
      created_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Case share links table (for external read-only access)
  db.exec(`
    CREATE TABLE IF NOT EXISTS case_share_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      share_token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      view_count INTEGER DEFAULT 0,
      last_viewed_at TEXT
    )
  `);

  // Add deadline tracking columns to cases table if they don't exist
  const caseColumns = db.prepare("PRAGMA table_info(cases)").all();
  const columnNames = caseColumns.map(c => c.name);

  if (!columnNames.includes('initial_notice_sent_date')) {
    db.exec(`ALTER TABLE cases ADD COLUMN initial_notice_sent_date TEXT`);
  }
  if (!columnNames.includes('initial_notice_response_deadline')) {
    db.exec(`ALTER TABLE cases ADD COLUMN initial_notice_response_deadline TEXT`);
  }
  if (!columnNames.includes('second_notice_sent_date')) {
    db.exec(`ALTER TABLE cases ADD COLUMN second_notice_sent_date TEXT`);
  }
  if (!columnNames.includes('second_notice_response_deadline')) {
    db.exec(`ALTER TABLE cases ADD COLUMN second_notice_response_deadline TEXT`);
  }
  if (!columnNames.includes('stage_changed_at')) {
    db.exec(`ALTER TABLE cases ADD COLUMN stage_changed_at TEXT`);
  }

  // Add local counsel assignment columns to cases table
  if (!columnNames.includes('assigned_local_counsel_id')) {
    db.exec(`ALTER TABLE cases ADD COLUMN assigned_local_counsel_id INTEGER REFERENCES local_counsel_contacts(id)`);
  }
  if (!columnNames.includes('local_counsel_engagement_date')) {
    db.exec(`ALTER TABLE cases ADD COLUMN local_counsel_engagement_date TEXT`);
  }
  if (!columnNames.includes('local_counsel_fee_arrangement')) {
    db.exec(`ALTER TABLE cases ADD COLUMN local_counsel_fee_arrangement TEXT`);
  }
  if (!columnNames.includes('local_counsel_user_id')) {
    db.exec(`ALTER TABLE cases ADD COLUMN local_counsel_user_id INTEGER REFERENCES users(id)`);
  }

  console.log('Database initialized successfully');
}

// Generate next case number
function generateCaseNumber() {
  const currentYear = new Date().getFullYear();

  // Get or create counter for current year
  let row = db.prepare('SELECT counter FROM case_counter WHERE year = ?').get(currentYear);

  if (!row) {
    db.prepare('INSERT INTO case_counter (year, counter) VALUES (?, 0)').run(currentYear);
    row = { counter: 0 };
  }

  const newCounter = row.counter + 1;
  db.prepare('UPDATE case_counter SET counter = ? WHERE year = ?').run(newCounter, currentYear);

  return `COLL-${currentYear}-${String(newCounter).padStart(4, '0')}`;
}

export { db, initializeDatabase, generateCaseNumber };
