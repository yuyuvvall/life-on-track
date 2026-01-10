import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Client, ResultSet, InStatement } from '@libsql/client';

// Log directory and file path
const LOG_DIR = join(process.cwd(), 'logs');
const LOG_FILE = join(LOG_DIR, 'queries.jsonl');

// Ensure logs directory exists
function ensureLogDir() {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

// Query log entry interface
export interface QueryLogEntry {
  timestamp: string;
  table: string | null;
  queryType: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'CREATE' | 'OTHER';
  rowCount: number;
  durationMs: number;
  purpose: string;
  endpoint?: string;
}

// Parse table name from SQL query
function parseTableName(sql: string): string | null {
  const normalizedSql = sql.toUpperCase().replace(/\s+/g, ' ').trim();
  
  // Common patterns for extracting table names
  const patterns = [
    /FROM\s+(\w+)/i,           // SELECT ... FROM table
    /INTO\s+(\w+)/i,           // INSERT INTO table
    /UPDATE\s+(\w+)/i,         // UPDATE table
    /DELETE\s+FROM\s+(\w+)/i,  // DELETE FROM table
    /TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i,  // CREATE TABLE table
  ];
  
  for (const pattern of patterns) {
    const match = sql.match(pattern);
    if (match && match[1]) {
      return match[1].toLowerCase();
    }
  }
  
  return null;
}

// Detect query type from SQL
function parseQueryType(sql: string): QueryLogEntry['queryType'] {
  const trimmed = sql.trim().toUpperCase();
  if (trimmed.startsWith('SELECT')) return 'SELECT';
  if (trimmed.startsWith('INSERT')) return 'INSERT';
  if (trimmed.startsWith('UPDATE')) return 'UPDATE';
  if (trimmed.startsWith('DELETE')) return 'DELETE';
  if (trimmed.startsWith('CREATE')) return 'CREATE';
  return 'OTHER';
}

// Log a query to the JSON Lines file
export function logQuery(entry: QueryLogEntry): void {
  try {
    ensureLogDir();
    const line = JSON.stringify(entry) + '\n';
    appendFileSync(LOG_FILE, line, 'utf8');
  } catch (err) {
    // Don't let logging errors crash the app
    console.error('[QueryLogger] Failed to write log:', (err as Error).message);
  }
}

// Get the log file path
export function getLogFilePath(): string {
  return LOG_FILE;
}

// Read all logs from file
export function readLogs(): string {
  ensureLogDir();
  if (!existsSync(LOG_FILE)) {
    return '';
  }
  return readFileSync(LOG_FILE, 'utf8');
}

// Clear all logs (truncate file)
export function clearLogs(): void {
  ensureLogDir();
  writeFileSync(LOG_FILE, '', 'utf8');
}

// Current request context (set by middleware)
let currentEndpoint: string | undefined;
let currentUiPurpose: string | undefined;

export function setCurrentEndpoint(endpoint: string) {
  currentEndpoint = endpoint;
}

export function setCurrentUiPurpose(purpose: string | undefined) {
  currentUiPurpose = purpose;
}

export function getCurrentUiPurpose(): string | undefined {
  return currentUiPurpose;
}

export function clearCurrentEndpoint() {
  currentEndpoint = undefined;
  currentUiPurpose = undefined;
}

// Create a tracked execute function that wraps db.execute
export function createTrackedExecute(db: Client) {
  return async function trackedExecute(
    sql: string | InStatement,
    technicalPurpose: string
  ): Promise<ResultSet> {
    const sqlString = typeof sql === 'string' ? sql : sql.sql;
    const startTime = performance.now();
    
    // Use UI purpose if available, otherwise fall back to technical purpose
    const purpose = currentUiPurpose || technicalPurpose;
    
    try {
      // Execute the actual query
      const result = await db.execute(sql);
      
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
      
      // Log the query
      logQuery({
        timestamp: new Date().toISOString(),
        table: parseTableName(sqlString),
        queryType: parseQueryType(sqlString),
        rowCount: result.rows.length,
        durationMs,
        purpose,
        endpoint: currentEndpoint,
      });
      
      return result;
    } catch (err) {
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
      
      // Log failed queries too (with 0 rows)
      logQuery({
        timestamp: new Date().toISOString(),
        table: parseTableName(sqlString),
        queryType: parseQueryType(sqlString),
        rowCount: 0,
        durationMs,
        purpose: `${purpose} [ERROR: ${(err as Error).message}]`,
        endpoint: currentEndpoint,
      });
      
      throw err;
    }
  };
}

// Express request type with headers
interface ExpressRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
}

// Export a middleware for Express to track endpoints and UI purpose
export function queryLoggerMiddleware() {
  return (req: ExpressRequest, _res: unknown, next: () => void) => {
    setCurrentEndpoint(`${req.method} ${req.path}`);
    
    // Extract X-Purpose header from UI
    const purposeHeader = req.headers['x-purpose'];
    const uiPurpose = Array.isArray(purposeHeader) ? purposeHeader[0] : purposeHeader;
    setCurrentUiPurpose(uiPurpose);
    
    next();
  };
}

