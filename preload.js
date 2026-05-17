const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  },

  app: {
    getDataDir: () => ipcRenderer.invoke('app:get-data-dir'),
  },

  clipboard: {
    start: () => ipcRenderer.invoke('clipboard:start'),
    stop: () => ipcRenderer.invoke('clipboard:stop'),
    getAll: () => ipcRenderer.invoke('clipboard:get-all'),
    delete: (id) => ipcRenderer.invoke('clipboard:delete', id),
    clear: () => ipcRenderer.invoke('clipboard:clear'),
    onNewRecord: (callback) => {
      ipcRenderer.removeAllListeners('clipboard:new-record');
      ipcRenderer.on('clipboard:new-record', (_event, record) => callback(record));
    },
  },

  task: {
    create: (task) => ipcRenderer.invoke('task:create', task),
    update: (id, fields) => ipcRenderer.invoke('task:update', id, fields),
    delete: (id) => ipcRenderer.invoke('task:delete', id),
    getByDate: (date) => ipcRenderer.invoke('task:get-by-date', date),
    getByMonth: (year, month) => ipcRenderer.invoke('task:get-by-month', year, month),
    toggleComplete: (id, date) => ipcRenderer.invoke('task:toggle-complete', id, date),
  },

  note: {
    create: (title) => ipcRenderer.invoke('note:create', title),
    get: (id) => ipcRenderer.invoke('note:get', id),
    getAll: () => ipcRenderer.invoke('note:get-all'),
    update: (id, fields) => ipcRenderer.invoke('note:update', id, fields),
    delete: (id) => ipcRenderer.invoke('note:delete', id),
    uploadImage: (data, ext) => ipcRenderer.invoke('note:upload-image', data, ext),
  },

  pomodoro: {
    saveRecord: (duration, type) => ipcRenderer.invoke('pomodoro:save-record', duration, type),
    getToday: () => ipcRenderer.invoke('pomodoro:get-today'),
  },

  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  },
});
