import Database, { Database as DatabaseType } from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const db: DatabaseType = new Database(join(__dirname, '../../data/auditor.db'));

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize schema
const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);

export default db;

// Helper to get current date in YYYY-MM-DD format
export function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

// Helper to get start of current week (Monday)
export function getWeekStart(date?: Date): string {
  const d = date || new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split('T')[0];
}

// Helper to get end of week (Sunday)
export function getWeekEnd(weekStart: string): string {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 6);
  return d.toISOString().split('T')[0];
}

