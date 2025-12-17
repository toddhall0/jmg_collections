import bcrypt from 'bcryptjs';
import { db, initializeDatabase, generateCaseNumber } from './database.js';

// Initialize database schema
initializeDatabase();

console.log('Seeding database...');

// Create default users
const users = [
  {
    username: 'admin',
    email: 'admin@lawfirm.com',
    password: bcrypt.hashSync('admin123', 10),
    full_name: 'John Administrator',
    role: 'admin'
  },
  {
    username: 'client',
    email: 'client@realestateco.com',
    password: bcrypt.hashSync('client123', 10),
    full_name: 'Sarah Client',
    role: 'client'
  },
  {
    username: 'counsel1',
    email: 'counsel1@lawfirm.com',
    password: bcrypt.hashSync('counsel123', 10),
    full_name: 'Michael Attorney',
    role: 'local_counsel'
  },
  {
    username: 'counsel2',
    email: 'counsel2@lawfirm.com',
    password: bcrypt.hashSync('counsel123', 10),
    full_name: 'Jennifer Lawyer',
    role: 'local_counsel'
  }
];

// Insert users
const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (username, email, password, full_name, role)
  VALUES (?, ?, ?, ?, ?)
`);

for (const user of users) {
  insertUser.run(user.username, user.email, user.password, user.full_name, user.role);
}

console.log('Users created');

// Get admin user id for created_by
const adminUser = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');

// Create sample cases
const sampleCases = [
  {
    case_name: 'ABC Properties LLC Collection',
    defendant_name: 'ABC Properties LLC',
    defendant_entity_type: 'LLC',
    defendant_contact_name: 'Robert Smith',
    defendant_email: 'rsmith@abcproperties.com',
    defendant_phone: '(555) 123-4567',
    defendant_mailing_address: '123 Main Street, Suite 100\nNew York, NY 10001',
    defendant_state: 'NY',
    amount_claimed: 45000.00,
    date_claim_arose: '2024-08-15',
    statute_of_limitations_date: '2028-08-15',
    claim_description: 'Unpaid commission for property sale at 456 Oak Avenue. Sale closed on August 15, 2024.',
    current_stage: 'Initial Notice - Awaiting Response',
    resolution_status: 'Open'
  },
  {
    case_name: 'Johnson Development Corp',
    defendant_name: 'Johnson Development Corporation',
    defendant_entity_type: 'Corporation',
    defendant_contact_name: 'William Johnson',
    defendant_email: 'wjohnson@johnsondev.com',
    defendant_phone: '(555) 234-5678',
    defendant_mailing_address: '789 Corporate Blvd\nLos Angeles, CA 90210',
    defendant_state: 'CA',
    amount_claimed: 125000.00,
    date_claim_arose: '2024-06-01',
    statute_of_limitations_date: '2028-06-01',
    claim_description: 'Commission dispute for commercial property transaction. Multiple properties involved.',
    current_stage: 'Active Litigation',
    resolution_status: 'Open'
  },
  {
    case_name: 'Martinez Individual Collection',
    defendant_name: 'Carlos Martinez',
    defendant_entity_type: 'Individual',
    defendant_contact_name: 'Carlos Martinez',
    defendant_email: 'cmartinez@email.com',
    defendant_phone: '(555) 345-6789',
    defendant_mailing_address: '321 Residential Lane\nMiami, FL 33101',
    defendant_state: 'FL',
    amount_claimed: 18500.00,
    date_claim_arose: '2024-10-01',
    statute_of_limitations_date: '2028-10-01',
    claim_description: 'Buyer failed to pay agreed commission after residential property purchase.',
    current_stage: 'Second Notice Sent',
    resolution_status: 'Open'
  },
  {
    case_name: 'Sunset Partners LLC',
    defendant_name: 'Sunset Partners LLC',
    defendant_entity_type: 'LLC',
    defendant_contact_name: 'Lisa Thompson',
    defendant_email: 'lisa@sunsetpartners.com',
    defendant_phone: '(555) 456-7890',
    defendant_mailing_address: '555 Beach Road\nSan Diego, CA 92101',
    defendant_state: 'CA',
    amount_claimed: 67500.00,
    date_claim_arose: '2024-03-15',
    statute_of_limitations_date: '2028-03-15',
    claim_description: 'Breach of exclusive listing agreement. Property sold through another broker.',
    current_stage: 'Settlement Negotiation',
    resolution_status: 'Open',
    amount_recovered: 45000.00
  },
  {
    case_name: 'Heritage Trust Collection',
    defendant_name: 'Heritage Family Trust',
    defendant_entity_type: 'Trust',
    defendant_contact_name: 'David Heritage',
    defendant_email: 'trustee@heritagetrust.org',
    defendant_phone: '(555) 567-8901',
    defendant_mailing_address: '1000 Trust Avenue\nDallas, TX 75201',
    defendant_state: 'TX',
    amount_claimed: 32000.00,
    date_claim_arose: '2024-01-20',
    statute_of_limitations_date: '2028-01-20',
    claim_description: 'Commission owed for estate property sale. Trust disputes amount.',
    current_stage: 'Closed - Resolved',
    resolution_status: 'Settled',
    amount_recovered: 28000.00,
    date_closed: '2024-11-15'
  },
  {
    case_name: 'Greenfield Partnership',
    defendant_name: 'Greenfield Investment Partnership',
    defendant_entity_type: 'Partnership',
    defendant_contact_name: 'Mark Green',
    defendant_email: 'mgreen@greenfield.com',
    defendant_phone: '(555) 678-9012',
    defendant_mailing_address: '2500 Investment Way\nChicago, IL 60601',
    defendant_state: 'IL',
    amount_claimed: 89000.00,
    date_claim_arose: '2024-09-10',
    statute_of_limitations_date: '2028-09-10',
    claim_description: 'Unpaid commission for multi-unit investment property sale.',
    current_stage: 'Intake',
    resolution_status: 'Open'
  }
];

// Insert cases
const insertCase = db.prepare(`
  INSERT INTO cases (
    case_number, case_name, defendant_name, defendant_entity_type,
    defendant_contact_name, defendant_email, defendant_phone,
    defendant_mailing_address, defendant_state, amount_claimed,
    date_claim_arose, statute_of_limitations_date, claim_description,
    current_stage, resolution_status, amount_recovered, date_closed, created_by
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const caseData of sampleCases) {
  const caseNumber = generateCaseNumber();
  insertCase.run(
    caseNumber,
    caseData.case_name,
    caseData.defendant_name,
    caseData.defendant_entity_type,
    caseData.defendant_contact_name,
    caseData.defendant_email,
    caseData.defendant_phone,
    caseData.defendant_mailing_address,
    caseData.defendant_state,
    caseData.amount_claimed,
    caseData.date_claim_arose,
    caseData.statute_of_limitations_date,
    caseData.claim_description,
    caseData.current_stage,
    caseData.resolution_status,
    caseData.amount_recovered || 0,
    caseData.date_closed || null,
    adminUser.id
  );
}

console.log('Sample cases created');

// Assign some cases to local counsel
const counsel1 = db.prepare('SELECT id FROM users WHERE username = ?').get('counsel1');
const counsel2 = db.prepare('SELECT id FROM users WHERE username = ?').get('counsel2');
const cases = db.prepare('SELECT id FROM cases').all();

// Assign first 3 cases to counsel1
if (cases.length >= 3) {
  const assignCase = db.prepare(`
    INSERT OR IGNORE INTO case_assignments (case_id, user_id, assigned_by)
    VALUES (?, ?, ?)
  `);

  assignCase.run(cases[0].id, counsel1.id, adminUser.id);
  assignCase.run(cases[1].id, counsel1.id, adminUser.id);
  assignCase.run(cases[2].id, counsel2.id, adminUser.id);
  assignCase.run(cases[3].id, counsel2.id, adminUser.id);
}

console.log('Case assignments created');
console.log('\nDatabase seeded successfully!');
console.log('\nDefault login credentials:');
console.log('  Admin:   admin / admin123');
console.log('  Client:  client / client123');
console.log('  Counsel: counsel1 / counsel123');
console.log('  Counsel: counsel2 / counsel123');
