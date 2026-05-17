const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

let _db = null;
let _dbPath = null;
let _saveTimer = null;

const SCHEMA_VERSION = 1;

const INITIAL_SCHEMA = `
  CREATE TABLE IF NOT EXISTS clipboard_records (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    type        TEXT NOT NULL CHECK(type IN ('text', 'image')),
    content     TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    pinned      INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    repeat_type TEXT NOT NULL CHECK(repeat_type IN ('once', 'days', 'weekdays', 'daily')),
    repeat_meta TEXT DEFAULT NULL,
    start_date  TEXT NOT NULL,
    end_date    TEXT,
    time_start  TEXT,
    time_end    TEXT,
    completed   INTEGER DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS task_completions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id        INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    completed_date TEXT NOT NULL,
    completed_at   TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    UNIQUE(task_id, completed_date)
  );

  CREATE TABLE IF NOT EXISTS diaries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    date        TEXT NOT NULL UNIQUE,
    content     TEXT NOT NULL DEFAULT '',
    updated_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS pomodoro_records (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    duration     INTEGER NOT NULL,
    type         TEXT NOT NULL CHECK(type IN ('work', 'break')),
    completed_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY
  );

  INSERT INTO schema_version (version) VALUES (1);
`;

async function initDB(dataDir) {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  _dbPath = path.join(dataDir, 'toolbox.db');

  const SQL = await initSqlJs();

  if (fs.existsSync(_dbPath)) {
    const fileBuffer = fs.readFileSync(_dbPath);
    _db = new SQL.Database(fileBuffer);
  } else {
    _db = new SQL.Database();
  }

  const currentVersion = getCurrentVersion();
  if (currentVersion === 0) {
    _db.run(INITIAL_SCHEMA);
    saveToFile();
  }
}

function getCurrentVersion() {
  try {
    const result = query('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1');
    if (result.length > 0) return result[0].version;
    return 0;
  } catch {
    return 0;
  }
}

function db() {
  if (!_db) throw new Error('Database not initialized. Call initDB() first.');
  return _db;
}

function query(sql, params = []) {
  const stmt = _db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function run(sql, params = []) {
  _db.run(sql, params);
  scheduleSave();
  return { lastInsertRowid: getlastInsertRowId(), changes: getChanges() };
}

function getlastInsertRowId() {
  const result = query('SELECT last_insert_rowid() as id');
  return result.length > 0 ? result[0].id : 0;
}

function getChanges() {
  const result = query('SELECT changes() as count');
  return result.length > 0 ? result[0].count : 0;
}

function scheduleSave() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    saveToFile();
  }, 500);
}

function saveToFile() {
  if (!_db || !_dbPath) return;
  try {
    const data = _db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(_dbPath, buffer);
  } catch (e) {
    console.error('Failed to save database:', e);
  }
}

function closeDB() {
  if (_db) {
    saveToFile();
    _db.close();
    _db = null;
  }
}

module.exports = { initDB, db, query, run, closeDB, saveToFile };
