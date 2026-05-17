const { app, BrowserWindow, ipcMain, clipboard: electronClipboard, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { initDB, query, run, closeDB, getDbInstance } = require('./db-service');
const { initFileService, saveImage, getImagePath, deleteImage } = require('./file-service');

let mainWindow = null;
let clipboardWatching = false;
let clipboardIntervalId = null;
let lastClipboardText = '';
let lastClipboardImageHash = '';
let lastClipboardSaveTime = 0;

const ALLOWED_TASK_FIELDS = ['title', 'repeat_type', 'repeat_meta', 'start_date', 'end_date', 'time_start', 'time_end'];
const ALLOWED_IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];

function getDataDir() {
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  if (portableDir) {
    return path.join(portableDir, 'data');
  }
  return path.join(process.cwd(), 'data');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 600,
    minHeight: 400,
    resizable: true,
    frame: false,
    backgroundColor: '#F2ECE0',
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  Menu.setApplicationMenu(null);
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
    stopClipboardWatch();
  });
}

app.whenReady().then(async () => {
  const dataDir = getDataDir();
  await initDB(dataDir);
  initFileService(dataDir);
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopClipboardWatch();
  closeDB();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function safeHandler(fn) {
  return (...args) => {
    try {
      return fn(...args);
    } catch (e) {
      console.error('IPC handler error:', e);
      return { error: e.message, success: false };
    }
  };
}

function registerIpcHandlers() {
  registerSettingsHandlers();
  registerClipboardHandlers();
  registerTaskHandlers();
  registerNoteHandlers();
  registerPomodoroHandlers();
  registerWindowHandlers();
}

function registerSettingsHandlers() {
  ipcMain.handle('settings:get', safeHandler((_event, key) => {
    const rows = query('SELECT value FROM settings WHERE key = ?', [key]);
    return rows.length > 0 ? rows[0].value : null;
  }));

  ipcMain.handle('settings:set', safeHandler((_event, key, value) => {
    run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
    return { success: true };
  }));

  ipcMain.handle('app:get-data-dir', safeHandler(() => {
    return getDataDir();
  }));
}

function registerClipboardHandlers() {
  ipcMain.handle('clipboard:start', safeHandler(() => {
    startClipboardWatch();
    return { success: true };
  }));

  ipcMain.handle('clipboard:stop', safeHandler(() => {
    stopClipboardWatch();
    return { success: true };
  }));

  ipcMain.handle('clipboard:get-all', safeHandler(() => {
    const rows = query('SELECT * FROM clipboard_records ORDER BY pinned DESC, created_at DESC');
    return rows.map((row) => {
      if (row.type === 'image') {
        const imagePath = getImagePath('clipboard', row.content);
        if (fs.existsSync(imagePath)) {
          const imageData = fs.readFileSync(imagePath);
          const base64 = imageData.toString('base64');
          const ext = row.content.split('.').pop();
          const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
          return { ...row, content: `data:${mime};base64,${base64}` };
        }
      }
      return row;
    });
  }));

  ipcMain.handle('clipboard:delete', safeHandler((_event, id) => {
    const rows = query('SELECT * FROM clipboard_records WHERE id = ?', [id]);
    run('DELETE FROM clipboard_records WHERE id = ?', [id]);
    if (rows.length > 0 && rows[0].type === 'image') {
      deleteImage('clipboard', rows[0].content);
    }
    return { success: true };
  }));

  ipcMain.handle('clipboard:clear', safeHandler(() => {
    const images = query("SELECT content FROM clipboard_records WHERE type = 'image'");
    run('DELETE FROM clipboard_records');
    images.forEach((row) => {
      try { deleteImage('clipboard', row.content); } catch {}
    });
    return { success: true };
  }));
}

function startClipboardWatch() {
  if (clipboardWatching) return;
  clipboardWatching = true;
  lastClipboardText = electronClipboard.readText() || '';
  const img = electronClipboard.readImage();
  lastClipboardImageHash = img.isEmpty() ? '' : hashImage(img);

  clipboardIntervalId = setInterval(() => {
    if (!clipboardWatching) return;
    if (!mainWindow || mainWindow.isDestroyed()) { stopClipboardWatch(); return; }

    try {
      const currentText = electronClipboard.readText() || '';
      const currentImage = electronClipboard.readImage();

      if (currentText !== lastClipboardText && currentText.trim()) {
        lastClipboardText = currentText;
        const now = Date.now();
        if (now - lastClipboardSaveTime > 1000) {
          lastClipboardSaveTime = now;
          const result = run('INSERT INTO clipboard_records (type, content) VALUES (?, ?)', ['text', currentText]);
          const record = {
            id: result.lastInsertRowid,
            type: 'text',
            content: currentText,
            created_at: new Date().toISOString(),
            pinned: 0,
          };
          sendToRenderer('clipboard:new-record', record);
        }
      }

      if (!currentImage.isEmpty()) {
        const hash = hashImage(currentImage);
        if (hash !== lastClipboardImageHash) {
          lastClipboardImageHash = hash;
          const pngBuffer = currentImage.toPNG();
          const filename = saveImage('clipboard', pngBuffer, 'png');
          const result = run('INSERT INTO clipboard_records (type, content) VALUES (?, ?)', ['image', filename]);
          const base64 = pngBuffer.toString('base64');
          const record = {
            id: result.lastInsertRowid,
            type: 'image',
            content: `data:image/png;base64,${base64}`,
            created_at: new Date().toISOString(),
            pinned: 0,
          };
          sendToRenderer('clipboard:new-record', record);
        }
      }
    } catch (e) {
      console.error('Clipboard watch error:', e);
    }
  }, 500);
}

function hashImage(image) {
  const png = image.toPNG();
  return crypto.createHash('md5').update(png).digest('hex');
}

function stopClipboardWatch() {
  clipboardWatching = false;
  if (clipboardIntervalId) {
    clearInterval(clipboardIntervalId);
    clipboardIntervalId = null;
  }
}

function registerTaskHandlers() {
  ipcMain.handle('task:create', safeHandler((_event, task) => {
    const result = run(
      'INSERT INTO tasks (title, repeat_type, repeat_meta, start_date, end_date, time_start, time_end) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [task.title, task.repeat_type, task.repeat_meta || null, task.start_date, task.end_date || null, task.time_start || null, task.time_end || null]
    );
    return { id: result.lastInsertRowid };
  }));

  ipcMain.handle('task:update', safeHandler((_event, id, fields) => {
    const sets = [];
    const values = [];
    Object.entries(fields).forEach(([key, value]) => {
      if (!ALLOWED_TASK_FIELDS.includes(key)) return;
      sets.push(`${key} = ?`);
      values.push(value);
    });
    if (sets.length === 0) return { success: false };
    values.push(id);
    run(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, values);
    return { success: true };
  }));

  ipcMain.handle('task:delete', safeHandler((_event, id) => {
    const _db = getDbInstance();
    _db.run('BEGIN TRANSACTION');
    try {
      _db.run('DELETE FROM task_completions WHERE task_id = ?', [id]);
      _db.run('DELETE FROM tasks WHERE id = ?', [id]);
      _db.run('COMMIT');
      require('./db-service').scheduleSave();
    } catch (e) {
      _db.run('ROLLBACK');
      throw e;
    }
    return { success: true };
  }));

  ipcMain.handle('task:get-by-date', safeHandler((_event, date) => {
    const allTasks = query('SELECT * FROM tasks ORDER BY created_at DESC');
    return allTasks
      .filter((task) => isTaskActiveOnDate(task, date))
      .map((task) => {
        const completions = query('SELECT * FROM task_completions WHERE task_id = ? AND completed_date = ?', [task.id, date]);
        return { ...task, completed: completions.length > 0 ? 1 : 0 };
      });
  }));

  ipcMain.handle('task:get-by-month', safeHandler((_event, year, month) => {
    const allTasks = query('SELECT * FROM tasks ORDER BY created_at DESC');
    const daysInMonth = new Date(year, month, 0).getDate();
    const datesWithTasks = new Set();

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      allTasks.forEach((task) => {
        if (isTaskActiveOnDate(task, dateStr)) {
          datesWithTasks.add(dateStr);
        }
      });
    }

    return Array.from(datesWithTasks);
  }));

  ipcMain.handle('task:toggle-complete', safeHandler((_event, id, date) => {
    const existing = query('SELECT * FROM task_completions WHERE task_id = ? AND completed_date = ?', [id, date]);
    if (existing.length > 0) {
      run('DELETE FROM task_completions WHERE task_id = ? AND completed_date = ?', [id, date]);
    } else {
      run('INSERT INTO task_completions (task_id, completed_date) VALUES (?, ?)', [id, date]);
    }
    return { success: true };
  }));
}

function isTaskActiveOnDate(task, dateStr) {
  const taskDate = new Date(task.start_date + 'T00:00:00');
  const checkDate = new Date(dateStr + 'T00:00:00');

  if (checkDate < taskDate) return false;
  if (task.end_date && new Date(task.end_date + 'T00:00:00') < checkDate) return false;

  switch (task.repeat_type) {
    case 'once':
      return task.start_date === dateStr;

    case 'days': {
      let meta;
      try { meta = JSON.parse(task.repeat_meta || '{}'); } catch { return false; }
      const diffDays = Math.floor((checkDate - taskDate) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays < (meta.count || 1);
    }

    case 'weekdays': {
      let meta;
      try { meta = JSON.parse(task.repeat_meta || '{}'); } catch { return false; }
      const dayOfWeek = checkDate.getDay();
      const adjustedDay = dayOfWeek === 0 ? 7 : dayOfWeek;
      return (meta.days || []).includes(adjustedDay);
    }

    case 'daily':
      return true;

    default:
      return task.start_date === dateStr;
  }
}

function registerNoteHandlers() {
  ipcMain.handle('note:create', safeHandler((_event, title) => {
    const result = run('INSERT INTO notes (title, content) VALUES (?, ?)', [title || '未命名笔记', '']);
    return { id: result.lastInsertRowid };
  }));

  ipcMain.handle('note:get', safeHandler((_event, id) => {
    const rows = query('SELECT * FROM notes WHERE id = ?', [id]);
    return rows.length > 0 ? rows[0] : null;
  }));

  ipcMain.handle('note:get-all', safeHandler(() => {
    return query('SELECT id, title, created_at, updated_at FROM notes ORDER BY id DESC');
  }));

  ipcMain.handle('note:update', safeHandler((_event, id, fields) => {
    const allowedFields = ['title', 'content'];
    const sets = [];
    const values = [];
    Object.entries(fields).forEach(([key, value]) => {
      if (!allowedFields.includes(key)) return;
      sets.push(`${key} = ?`);
      values.push(value);
    });
    if (sets.length === 0) return { success: false };
    sets.push("updated_at = datetime('now', 'localtime')");
    values.push(id);
    run(`UPDATE notes SET ${sets.join(', ')} WHERE id = ?`, values);
    return { success: true };
  }));

  ipcMain.handle('note:delete', safeHandler((_event, id) => {
    run('DELETE FROM notes WHERE id = ?', [id]);
    return { success: true };
  }));

  ipcMain.handle('note:upload-image', safeHandler((_event, data, ext) => {
    const safeExt = ALLOWED_IMAGE_EXTS.includes(ext) ? ext : 'png';
    const buffer = Buffer.from(data, 'base64');
    const filename = saveImage('diary', buffer, safeExt);
    return filename;
  }));
}

function registerPomodoroHandlers() {
  ipcMain.handle('pomodoro:save-record', safeHandler((_event, duration, type) => {
    const result = run('INSERT INTO pomodoro_records (duration, type) VALUES (?, ?)', [duration, type]);
    return { id: result.lastInsertRowid };
  }));

  ipcMain.handle('pomodoro:get-today', safeHandler(() => {
    const rows = query(
      "SELECT COUNT(*) as count FROM pomodoro_records WHERE type = 'work' AND date(completed_at) = date('now', 'localtime')"
    );
    return rows.length > 0 ? rows[0] : { count: 0 };
  }));
}

function registerWindowHandlers() {
  ipcMain.handle('window:minimize', safeHandler(() => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
    return { success: true };
  }));

  ipcMain.handle('window:maximize', safeHandler(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
    return { success: true };
  }));

  ipcMain.handle('window:close', safeHandler(() => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
    return { success: true };
  }));

  ipcMain.handle('window:is-maximized', safeHandler(() => {
    return mainWindow && !mainWindow.isDestroyed() ? mainWindow.isMaximized() : false;
  }));
}

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}
