import { open, type DB } from '@op-engineering/op-sqlite';
import { EBIKE_SCHEMA } from './schema';

let _db: DB | null = null;

export function getDb(): DB {
  if (!_db) throw new Error('[DB] Not initialised. Call initDb() first.');
  return _db;
}

export function initDb(): DB {
  if (_db) return _db;
  _db = open({ name: 'ebike.db' });
  _db.execute('PRAGMA journal_mode = WAL;');
  _db.execute('PRAGMA foreign_keys = ON;');
  _db.execute('PRAGMA synchronous = NORMAL;');
  applySchema(_db);
  console.log('[DB] Initialised: ebike.db');
  return _db;
}

function applySchema(db: DB): void {
  db.execute(`CREATE TABLE IF NOT EXISTS _schema_version (version INTEGER PRIMARY KEY, applied_at TEXT DEFAULT (datetime('now')), description TEXT)`);
  const migrations = [{ version: 1, description: 'Initial schema', sql: EBIKE_SCHEMA }];
  const current = dbGetFirst<{ v: number }>(db, 'SELECT MAX(version) AS v FROM _schema_version');
  const currentVersion = current?.v ?? 0;
  for (const m of migrations.filter(m => m.version > currentVersion)) {
    console.log(`[DB] Applying migration v${m.version}`);
    db.transaction(tx => {
      const statements = m.sql.split(';').map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith('--'));
      for (const stmt of statements) { tx.execute(stmt); }
      tx.execute('INSERT INTO _schema_version (version, description) VALUES (?, ?)', [m.version, m.description]);
    });
  }
}

export function dbGetFirst<T = Record<string, any>>(db: DB, sql: string, params: any[] = []): T | null {
  try {
    const result = db.execute(sql, params);
    const arr = result.rows?._array ?? [];
    return arr.length > 0 ? (arr[0] as T) : null;
  } catch (err: any) {
    console.error('[DB] dbGetFirst error:', err.message);
    throw err;
  }
}

export function dbAll<T = Record<string, any>>(sql: string, params: any[] = [], db: DB = getDb()): T[] {
  try {
    return (db.execute(sql, params).rows?._array ?? []) as T[];
  } catch (err: any) {
    console.error('[DB] dbAll error:', err.message);
    throw err;
  }
}

export function dbRun(sql: string, params: any[] = [], db: DB = getDb()): number {
  try {
    return db.execute(sql, params).rowsAffected ?? 0;
  } catch (err: any) {
    console.error('[DB] dbRun error:', err.message);
    throw err;
  }
}

export function dbTransaction(fn: () => void, db: DB = getDb()): void {
  try { db.transaction(() => { fn(); }); }
  catch (err: any) { console.error('[DB] Transaction error:', err.message); throw err; }
}

export function isMigrationDone(version: number, db: DB = getDb()): boolean {
  const row = dbGetFirst<{ version: number }>(db, 'SELECT version FROM _schema_version WHERE version = ?', [version]);
  return !!row;
}

export async function dbAllAsync<T = Record<string, any>>(sql: string, params: any[] = [], db: DB = getDb()): Promise<T[]> {
  return (await db.executeAsync(sql, params)).rows?._array ?? [] as T[];
}

export async function dbRunAsync(sql: string, params: any[] = [], db: DB = getDb()): Promise<number> {
  return (await db.executeAsync(sql, params)).rowsAffected ?? 0;
}
