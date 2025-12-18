import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeDatabase } from './database.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import caseRoutes from './routes/cases.js';
import notesRoutes from './routes/notes.js';
import communicationsRoutes from './routes/communications.js';
import documentsRoutes from './routes/documents.js';
import tasksRoutes from './routes/tasks.js';
import localCounselRoutes from './routes/localCounsel.js';
import shareLinksRoutes from './routes/shareLinks.js';
import inviteRoutes from './routes/invites.js';
import dashboardRoutes from './routes/dashboard.js';
import reportsRoutes from './routes/reports.js';
import templatesRoutes from './routes/templates.js';
import notificationsRoutes from './routes/notifications.js';
import auditRoutes from './routes/audit.js';
import categoriesRoutes from './routes/categories.js';
import searchRoutes from './routes/search.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// Initialize database
initializeDatabase();

// Middleware
app.use(cors());
app.use(express.json());

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Serve static frontend files in production
const clientDistPath = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDistPath));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/cases', caseRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/communications', communicationsRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/local-counsel', localCounselRoutes);
app.use('/api/share-links', shareLinksRoutes);
app.use('/api/invites', inviteRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/search', searchRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend for all non-API routes (SPA catch-all)
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Collections Manager API running on port ${PORT}`);
  console.log(`Server started at: ${new Date().toISOString()}`);
  console.log(`Build: v1.0.2`);
});
