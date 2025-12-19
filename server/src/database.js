import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Use DATABASE_PATH env var for persistent storage, or fall back to local data directory
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'collections.db');

// Ensure data directory exists
import fs from 'fs';
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

console.log(`Using database at: ${dbPath}`);

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
      role TEXT NOT NULL CHECK(role IN ('admin', 'internal_counsel', 'client', 'local_counsel')),
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
      status TEXT NOT NULL DEFAULT 'Not Started' CHECK(status IN ('Not Started', 'In Progress', 'Stuck', 'Complete')),
      notes TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Task Documents table
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      mime_type TEXT,
      uploaded_by INTEGER NOT NULL REFERENCES users(id),
      uploaded_at TEXT DEFAULT (datetime('now'))
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

  // User invites table (for invite-based registration)
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'internal_counsel', 'client', 'local_counsel')),
      invite_token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      invited_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      used_at TEXT,
      used_by_user_id INTEGER REFERENCES users(id)
    )
  `);

  // Document templates table
  db.exec(`
    CREATE TABLE IF NOT EXISTS document_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      template_type TEXT NOT NULL CHECK(template_type IN ('Initial Notice', 'Second Notice', 'Demand Letter', 'Other')),
      content TEXT NOT NULL,
      description TEXT,
      is_active INTEGER DEFAULT 1,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Notifications table
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      case_id INTEGER REFERENCES cases(id) ON DELETE CASCADE,
      is_read INTEGER DEFAULT 0,
      email_sent INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // User notification preferences table
  db.exec(`
    CREATE TABLE IF NOT EXISTS notification_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email_task_assigned INTEGER DEFAULT 1,
      email_task_reminder INTEGER DEFAULT 1,
      email_task_overdue INTEGER DEFAULT 1,
      email_stage_change INTEGER DEFAULT 1,
      email_document_upload INTEGER DEFAULT 0,
      email_case_assigned INTEGER DEFAULT 1,
      email_deadline_reminder INTEGER DEFAULT 1,
      in_app_enabled INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Audit log table
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      entity_name TEXT,
      details TEXT,
      ip_address TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Case categories table
  db.exec(`
    CREATE TABLE IF NOT EXISTS case_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      code TEXT UNIQUE NOT NULL,
      description TEXT,
      default_claim_language TEXT,
      display_order INTEGER DEFAULT 0,
      status TEXT DEFAULT 'Active' CHECK(status IN ('Active', 'Inactive')),
      created_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
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

  // Add assigned (internal) counsel column to cases table
  if (!columnNames.includes('assigned_counsel_id')) {
    db.exec(`ALTER TABLE cases ADD COLUMN assigned_counsel_id INTEGER REFERENCES users(id)`);
  }

  // Add defendant's attorney columns to cases table
  if (!columnNames.includes('defendant_attorney_name')) {
    db.exec(`ALTER TABLE cases ADD COLUMN defendant_attorney_name TEXT`);
  }
  if (!columnNames.includes('defendant_attorney_firm')) {
    db.exec(`ALTER TABLE cases ADD COLUMN defendant_attorney_firm TEXT`);
  }
  if (!columnNames.includes('defendant_attorney_address')) {
    db.exec(`ALTER TABLE cases ADD COLUMN defendant_attorney_address TEXT`);
  }
  if (!columnNames.includes('defendant_attorney_email')) {
    db.exec(`ALTER TABLE cases ADD COLUMN defendant_attorney_email TEXT`);
  }
  if (!columnNames.includes('defendant_attorney_phone')) {
    db.exec(`ALTER TABLE cases ADD COLUMN defendant_attorney_phone TEXT`);
  }

  // Add category column to cases table
  if (!columnNames.includes('category_id')) {
    db.exec(`ALTER TABLE cases ADD COLUMN category_id INTEGER REFERENCES case_categories(id)`);
  }

  // Add category column to document_templates table
  const templateColumns = db.prepare("PRAGMA table_info(document_templates)").all();
  const templateColumnNames = templateColumns.map(c => c.name);
  if (!templateColumnNames.includes('category_id')) {
    db.exec(`ALTER TABLE document_templates ADD COLUMN category_id INTEGER REFERENCES case_categories(id)`);
  }

  // Pre-populate default case categories if none exist
  const categoryCount = db.prepare('SELECT COUNT(*) as count FROM case_categories').get();
  if (categoryCount.count === 0) {
    const defaultCategories = [
      {
        name: 'Partner Violation',
        code: 'PV',
        description: 'Defendant working with JMG partner in violation of ICA',
        default_claim_language: 'This claim arises from a violation of the partnership agreement between the parties. The defendant has breached their obligations under the agreement by failing to comply with the terms and conditions set forth therein.',
        display_order: 1
      },
      {
        name: 'Company Referral Violation',
        code: 'CRV',
        description: 'Defendant working with Company referrals without Company consent in violation of ICA',
        default_claim_language: 'This claim arises from a violation of the referral fee agreement between the parties. The defendant has failed to pay the agreed-upon referral fees as required under the terms of the agreement.',
        display_order: 2
      },
      {
        name: 'Early Termination Fee',
        code: 'ETF',
        description: 'Defendant failed to pay early termination fee under ICA',
        default_claim_language: 'This claim is for early termination fees owed pursuant to the contract between the parties. The defendant terminated the agreement prior to the end of the contract term without paying the required early termination fee.',
        display_order: 3
      },
      {
        name: 'Other Breach of Contract',
        code: 'OBC',
        description: 'General breach of contract claims not falling into other categories',
        default_claim_language: 'This claim arises from a breach of contract by the defendant. The defendant has failed to perform their obligations under the agreement, causing damages to the claimant.',
        display_order: 4
      }
    ];

    const insertCategory = db.prepare(`
      INSERT INTO case_categories (name, code, description, default_claim_language, display_order)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const cat of defaultCategories) {
      insertCategory.run(cat.name, cat.code, cat.description, cat.default_claim_language, cat.display_order);
    }
    console.log('Default case categories created');
  }

  // Migration: Update category descriptions to new ICA-focused descriptions
  const pvCategory = db.prepare("SELECT description FROM case_categories WHERE code = 'PV'").get();
  if (pvCategory && pvCategory.description === 'Claims arising from violations of partner agreements') {
    console.log('Updating category descriptions...');
    db.prepare("UPDATE case_categories SET description = 'Defendant working with JMG partner in violation of ICA' WHERE code = 'PV'").run();
    db.prepare("UPDATE case_categories SET description = 'Defendant working with Company referrals without Company consent in violation of ICA' WHERE code = 'CRV'").run();
    db.prepare("UPDATE case_categories SET description = 'Defendant failed to pay early termination fee under ICA' WHERE code = 'ETF'").run();
    console.log('Category descriptions updated');
  }

  // Migration: Fix users table CHECK constraint to include 'internal_counsel'
  // SQLite doesn't allow ALTER of CHECK constraints, so we need to recreate the table
  const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
  if (tableInfo && tableInfo.sql && !tableInfo.sql.includes('internal_counsel')) {
    console.log('Migrating users table to add internal_counsel role...');

    // Disable foreign keys temporarily for the migration
    db.pragma('foreign_keys = OFF');

    db.exec(`
      -- Drop users_new if it exists from a previous failed migration
      DROP TABLE IF EXISTS users_new;

      -- Create new table with correct constraint
      CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin', 'internal_counsel', 'client', 'local_counsel')),
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Copy existing data
      INSERT INTO users_new (id, username, email, password, full_name, role, active, created_at, updated_at)
      SELECT id, username, email, password, full_name, role, active, created_at, updated_at FROM users;

      -- Drop old table
      DROP TABLE users;

      -- Rename new table
      ALTER TABLE users_new RENAME TO users;
    `);

    // Re-enable foreign keys
    db.pragma('foreign_keys = ON');

    console.log('Users table migration complete');
  }

  // Migration: Add notes column to tasks table
  const taskColumns = db.prepare("PRAGMA table_info(tasks)").all();
  const taskColumnNames = taskColumns.map(c => c.name);
  if (!taskColumnNames.includes('notes')) {
    db.exec(`ALTER TABLE tasks ADD COLUMN notes TEXT`);
    console.log('Added notes column to tasks table');
  }

  // Migration: Fix tasks table CHECK constraint to include 'Stuck' status
  const tasksTableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'").get();
  if (tasksTableInfo && tasksTableInfo.sql && !tasksTableInfo.sql.includes('Stuck')) {
    console.log('Migrating tasks table to add Stuck status...');

    db.pragma('foreign_keys = OFF');

    db.exec(`
      DROP TABLE IF EXISTS tasks_new;

      CREATE TABLE tasks_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
        description TEXT NOT NULL,
        assigned_to INTEGER NOT NULL REFERENCES users(id),
        due_date TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'Medium' CHECK(priority IN ('High', 'Medium', 'Low')),
        status TEXT NOT NULL DEFAULT 'Not Started' CHECK(status IN ('Not Started', 'In Progress', 'Stuck', 'Complete')),
        notes TEXT,
        created_by INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      INSERT INTO tasks_new (id, case_id, description, assigned_to, due_date, priority, status, notes, created_by, created_at, updated_at)
      SELECT id, case_id, description, assigned_to, due_date, priority, status, notes, created_by, created_at, updated_at FROM tasks;

      DROP TABLE tasks;

      ALTER TABLE tasks_new RENAME TO tasks;
    `);

    db.pragma('foreign_keys = ON');

    console.log('Tasks table migration complete');
  }

  // Create default admin user if no users exist
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count === 0) {
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.prepare(`
      INSERT INTO users (username, email, password, full_name, role, active)
      VALUES ('admin', 'admin@example.com', ?, 'System Administrator', 'admin', 1)
    `).run(hashedPassword);
    console.log('Default admin user created (username: admin, password: admin123)');
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
