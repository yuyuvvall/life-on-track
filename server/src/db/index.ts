import Database, { Database as DatabaseType } from 'better-sqlite3';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname, isAbsolute } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Get database path from environment or use default
const DATABASE_URL = process.env.DATABASE_URL || './data/auditor.db';

// Resolve the database path
function resolveDatabasePath(dbUrl: string): string {
  // If it's an absolute path, use it directly
  if (isAbsolute(dbUrl)) {
    return dbUrl;
  }
  
  // If it's a relative path, resolve from server root (parent of src)
  const serverRoot = join(__dirname, '../..');
  return join(serverRoot, dbUrl);
}

const dbPath = resolveDatabasePath(DATABASE_URL);

// Ensure the directory exists for local SQLite files
const dbDir = dirname(dbPath);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

// Create database connection
const db: DatabaseType = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize schema
const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);

// Log database location on startup
console.log(`[Database] Connected to: ${dbPath}`);

export default db;

// Helper to get current date in YYYY-MM-DD format
export function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

// Helper to get start of current week (Sunday)
export function getWeekStart(date?: Date): string {
  const d = date || new Date();
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const diff = d.getDate() - day; // Go back to Sunday
  const sunday = new Date(d.setDate(diff));
  return sunday.toISOString().split('T')[0];
}

// Helper to get end of week (Saturday)
export function getWeekEnd(weekStart: string): string {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 6);
  return d.toISOString().split('T')[0];
}
