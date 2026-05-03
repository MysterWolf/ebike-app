import SQLite, { SQLiteDatabase, Transaction } from 'react-native-sqlite-storage';
import { EBIKE_SCHEMA } from './schema';

SQLite.enablePromise(true);
SQLite.DEBUG(false);

let _db: SQLiteDatabase | null = null;
let _initPromise: Promise<SQLiteDatabase> | null = null;

export type DB = SQLiteDatabase;

export function getDb(): SQLiteDatabase {
  if (!_db) throw new Error('[DB] Not initialised. Call initDb() first.');
  return _db;
}

export function initDb(): Promise<SQLiteDatabase> {
  if (_db) return Promise.resolve(_db);
  if (!_initPromise) {
    _initPromise = (async () => {
      const db = await SQLite.openDatabase({ name: 'ebike.db', location: 'default' });
      await db.executeSql('PRAGMA journal_mode = WAL;');
      await db.executeSql('PRAGMA foreign_keys = ON;');
      await db.executeSql('PRAGMA synchronous = NORMAL;');
      await applySchema(db);
      _db = db;
      console.log('[DB] Initialised: ebike.db');
      return db;
    })();
  }
  return _initPromise;
}

async function applySchema(db: SQLiteDatabase): Promise<void> {
  await db.executeSql(`CREATE TABLE IF NOT EXISTS _schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT DEFAULT (datetime('now')),
    description TEXT
  )`);
  const migrations = [{ version: 1, description: 'Initial schema', sql: EBIKE_SCHEMA }];
  const [res] = await db.executeSql('SELECT MAX(version) AS v FROM _schema_version');
  const currentVersion = res.rows.item(0)?.v ?? 0;
  for (const m of migrations.filter(m => m.version > currentVersion)) {
    console.log(`[DB] Applying migration v${m.version}`);
    await new Promise<void>((resolve, reject) => {
      db.transaction(
        (tx: Transaction) => {
          const statements = m.sql
            .split(';')
            .map((s: string) => s.trim())
            .filter((s: string) => s.length > 0 && !s.startsWith('--'));
          for (const stmt of statements) { tx.executeSql(stmt); }
          tx.executeSql('INSERT INTO _schema_version (version, description) VALUES (?, ?)',
            [m.version, m.description]);
        },
        reject,
        () => resolve()
      );
    });
  }
}

export async function isMigrationDone(version: number, db: SQLiteDatabase = getDb()): Promise<boolean> {
  try {
    const [res] = await db.executeSql('SELECT version FROM _schema_version WHERE version = ?', [version]);
    return res.rows.length > 0;
  } catch {
    return false;
  }
}

export async function dbAll<T = Record<string, any>>(sql: string, params: any[] = [], db: SQLiteDatabase = getDb()): Promise<T[]> {
  const [res] = await db.executeSql(sql, params);
  const arr: T[] = [];
  for (let i = 0; i < res.rows.length; i++) arr.push(res.rows.item(i));
  return arr;
}

export async function dbRun(sql: string, params: any[] = [], db: SQLiteDatabase = getDb()): Promise<number> {
  const [res] = await db.executeSql(sql, params);
  return res.rowsAffected;
}

export function dbTransaction(fn: (tx: Transaction) => void, db: SQLiteDatabase = getDb()): Promise<void> {
  return new Promise((resolve, reject) => {
    db.transaction(fn, reject, () => resolve());
  });
}
