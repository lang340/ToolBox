var TB = window.TB || {};

TB.Notebook = {
  noteList: [],
  currentNoteId: null,
  autoSaveTimer: null,
  _isLoading: false,
  _isDirty: false,
  _activeImg: null,
  _resizeOverlay: null,
  _resizeDocClickHandler: null,

  render() {
    return `
      <h1>记事本</h1>
      <div style="display:flex;gap:16px;height:calc(100vh - 80px);">
        <div style="width:160px;flex-shrink:0;display:flex;flex-direction:column;border-right:0.5px solid var(--border-light);padding-right:12px;">
          <button class="btn-primary" id="notebook-add" style="width:100%;margin-bottom:8px;font-size:12px;padding:5px 0;">+ 添加记事</button>
          <div id="notebook-list" style="flex:1;overflow-y:auto;"></div>
        </div>
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;">
          <div id="notebook-header" style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <input type="text" id="notebook-title" placeholder="标题" style="flex:1;font-size:14px;font-weight:500;border:none;background:transparent;padding:4px 0;">
            <button class="btn-text" id="notebook-delete" style="font-size:11px;color:var(--color-danger);display:none;">删除</button>
          </div>
          <div id="notebook-toolbar" style="display:flex;gap:4px;margin-bottom:8px;padding:6px 8px;background:var(--bg-secondary);border-radius:var(--radius-md);border:0.5px solid var(--border-light);"></div>
          <div id="notebook-editor" style="flex:1;overflow-y:auto;padding:12px;background:var(--bg-secondary);border-radius:var(--radius-md);border:0.5px solid var(--border-light);font-size:13px;line-height:1.8;min-height:300px;" contenteditable="true"></div>
        </div>
      </div>
    `;
  },

  init() {
    this._renderToolbar();
    this._bindEvents();
    this._initImageResize();
    this._loadNoteList();
  },

  _bindEvents() {
    document.getElementById('notebook-add').addEventListener('click', () => {
      this._createNote();
    });

    document.getElementById('notebook-delete').addEventListener('click', () => {
      this._deleteNote();
    });

    const titleInput = document.getElementById('notebook-title');
    let titleTimer = null;
    titleInput.addEventListener('input', () => {
      clearTimeout(titleTimer);
      titleTimer = setTimeout(() => {
        this._saveTitle();
      }, 500);
    });

    const editor = document.getElementById('notebook-editor');
    editor.addEventListener('input', () => {
      this._triggerAutoSave();
    });
  },

  _renderToolbar() {
    const toolbar = document.getElementById('notebook-toolbar');
    const buttons = [
      { cmd: 'bold', icon: 'B', style: 'font-weight:700;' },
      { cmd: 'italic', icon: 'I', style: 'font-style:italic;' },
      { cmd: 'underline', icon: 'U', style: 'text-decoration:underline;' },
      { cmd: 'strikeThrough', icon: 'S', style: 'text-decoration:line-through;' },
      { sep: true },
      { cmd: 'foreColor', icon: '色', type: 'color' },
      { cmd: 'fontSize', icon: '号', type: 'select' },
      { sep: true },
      { cmd: 'insertImage', icon: '图', type: 'image' },
    ];

    let html = '';
    buttons.forEach((btn) => {
      if (btn.sep) {
        html += '<div style="width:0.5px;height:20px;background:var(--border-light);margin:0 4px;"></div>';
        return;
      }

      if (btn.type === 'color') {
        html += `<label style="display:flex;align-items:center;gap:2px;cursor:pointer;font-size:12px;color:var(--text-muted);position:relative;">
          ${btn.icon}
          <input type="color" id="notebook-color" value="#4A3D2A" style="position:absolute;opacity:0;width:0;height:0;">
        </label>`;
      } else if (btn.type === 'select') {
        html += `<select id="notebook-fontsize" style="height:26px;font-size:11px;padding:0 4px;">
          <option value="2">小</option>
          <option value="3" selected>中</option>
          <option value="4">大</option>
          <option value="5">特大</option>
        </select>`;
      } else if (btn.type === 'image') {
        html += `<button class="btn-text" id="notebook-insert-image" style="font-size:12px;">${btn.icon}</button>`;
      } else {
        html += `<button class="btn-text" data-cmd="${btn.cmd}" style="font-size:13px;${btn.style || ''}">${btn.icon}</button>`;
      }
    });

    toolbar.innerHTML = html;

    toolbar.querySelectorAll('[data-cmd]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.execCommand(btn.dataset.cmd, false, null);
        this._triggerAutoSave();
      });
    });

    document.getElementById('notebook-color').addEventListener('input', (e) => {
      document.execCommand('foreColor', false, e.target.value);
      this._triggerAutoSave();
    });

    document.getElementById('notebook-fontsize').addEventListener('change', (e) => {
      document.execCommand('fontSize', false, e.target.value);
      this._triggerAutoSave();
    });

    document.getElementById('notebook-insert-image').addEventListener('click', () => {
      this._insertImage();
    });
  },

  async _insertImage() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target.result.split(',')[1];
        const ext = file.name.split('.').pop() || 'png';
        try {
          const filename = await window.api.note.uploadImage(base64, ext);
          const dataDir = await window.api.app.getDataDir();
          const imgPath = `file://${dataDir.replace(/\\/g, '/')}/images/diary/${filename}`;
          document.execCommand('insertImage', false, imgPath);
          this._triggerAutoSave();
        } catch (err) {
          console.warn('Insert image failed:', err);
        }
      };
      reader.readAsDataURL(file);
    });
    input.click();
  },

  async _createNote() {
    try {
      const result = await window.api.note.create('');
      await this._loadNoteList();
      this._selectNote(result.id);
    } catch (e) {
      console.warn('Create note failed:', e);
    }
  },

  async _deleteNote() {
    if (!this.currentNoteId) return;
    try {
      await window.api.note.delete(this.currentNoteId);
      this.currentNoteId = null;
      await this._loadNoteList();
      if (this.noteList.length > 0) {
        this._selectNote(this.noteList[0].id);
      } else {
        this._clearEditor();
      }
    } catch (e) {
      console.warn('Delete note failed:', e);
    }
  },

  async _loadNoteList() {
    try {
      this.noteList = await window.api.note.getAll() || [];
      this._renderNoteList();
    } catch (e) {
      console.warn('Load note list failed:', e);
    }
  },

  _renderNoteList() {
    const list = document.getElementById('notebook-list');

    if (this.noteList.length === 0) {
      list.innerHTML = '<div style="text-align:center;color:var(--text-hint);font-size:12px;padding:16px 0;">暂无笔记</div>';
      return;
    }

    list.innerHTML = this.noteList.map((note) => {
      const isSelected = note.id === this.currentNoteId;
      const title = this._escapeHtml(note.title || '未命名笔记');
      const time = this._formatTime(note.updated_at || note.created_at);
      return `
        <div class="notebook-item" data-id="${note.id}" style="
          padding:8px 10px;cursor:pointer;border-radius:var(--radius-sm);margin-bottom:4px;
          ${isSelected ? 'background:var(--khaki-800);color:#fff;' : ''}
        ">
          <div style="font-size:12px;${isSelected ? 'color:#fff;' : 'color:var(--text-primary);'}white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${title}</div>
          <div style="font-size:10px;margin-top:2px;${isSelected ? 'color:var(--khaki-300);' : 'color:var(--text-hint);'}">${time}</div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.notebook-item').forEach((el) => {
      el.addEventListener('click', () => {
        const id = parseInt(el.dataset.id);
        this._selectNote(id);
      });
    });
  },

  async _selectNote(id) {
    if (this.currentNoteId === id) return;

    this._hideImageHandles();
    await this._saveCurrentNote();

    this.currentNoteId = id;
    this._isLoading = true;

    try {
      const note = await window.api.note.get(id);
      if (this.currentNoteId === id && note) {
        const titleInput = document.getElementById('notebook-title');
        const editor = document.getElementById('notebook-editor');
        const deleteBtn = document.getElementById('notebook-delete');
        if (titleInput) titleInput.value = note.title || '';
        if (editor) editor.innerHTML = note.content || '<p><br></p>';
        if (deleteBtn) deleteBtn.style.display = '';
      }
    } catch (e) {
      console.warn('Load note failed:', e);
    } finally {
      this._isLoading = false;
    }

    this._renderNoteList();
  },

  _clearEditor() {
    const titleInput = document.getElementById('notebook-title');
    const editor = document.getElementById('notebook-editor');
    const deleteBtn = document.getElementById('notebook-delete');
    if (titleInput) titleInput.value = '';
    if (editor) editor.innerHTML = '<p><br></p>';
    if (deleteBtn) deleteBtn.style.display = 'none';
  },

  _triggerAutoSave() {
    if (this._isLoading) return;
    this._isDirty = true;
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => {
      this._saveCurrentNote();
    }, 1000);
  },

  async _saveCurrentNote() {
    if (!this._isDirty) return;
    const id = this.currentNoteId;
    if (!id) return;
    const editor = document.getElementById('notebook-editor');
    const titleInput = document.getElementById('notebook-title');
    if (!editor) return;

    const content = editor.innerHTML;
    const title = titleInput ? titleInput.value.trim() : '';

    try {
      await window.api.note.update(id, { title, content });
      this._syncNoteData(id, title);
      this._updateListItem(id, title);
      this._isDirty = false;
    } catch (e) {
      console.warn('Save note failed:', e);
    }
  },

  async _saveTitle() {
    const id = this.currentNoteId;
    if (!id) return;
    const titleInput = document.getElementById('notebook-title');
    if (!titleInput) return;
    const title = titleInput.value.trim();
    this._isDirty = true;

    try {
      await window.api.note.update(id, { title });
      this._syncNoteData(id, title);
      this._updateListItem(id, title);
      this._isDirty = false;
    } catch (e) {
      console.warn('Save title failed:', e);
    }
  },

  _syncNoteData(id, title) {
    const note = this.noteList.find((n) => n.id === id);
    if (note) {
      note.title = title || '';
    }
  },

  _updateListItem(id, title) {
    const list = document.getElementById('notebook-list');
    if (!list) return;
    const item = list.querySelector(`[data-id="${id}"]`);
    if (item) {
      const titleEl = item.querySelector('div:first-child');
      if (titleEl) titleEl.textContent = title || '未命名笔记';
    }
  },

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  _formatTime(timeStr) {
    if (!timeStr) return '';
    const parts = timeStr.split(' ');
    if (parts.length >= 2) {
      const datePart = parts[0].substring(5);
      const timePart = parts[1].substring(0, 5);
      return `${datePart} ${timePart}`;
    }
    return timeStr;
  },

  _initImageResize() {
    const editor = document.getElementById('notebook-editor');

    // 禁用 Chromium 原生图片缩放手柄
    try { document.execCommand('enableObjectResizing', false, 'false'); } catch (e) { /* ignore */ }

    // 点击图片 → 显示自定义缩放手柄
    editor.addEventListener('click', (e) => {
      if (e.target.tagName === 'IMG') {
        e.preventDefault();
        this._showImageHandles(e.target);
      } else if (this._activeImg) {
        this._hideImageHandles();
      }
    });

    // 阻止原生图片拖拽/缩放
    editor.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'IMG') {
        e.preventDefault();
      }
    });

    // 编辑器滚动时更新手柄位置
    editor.addEventListener('scroll', () => {
      if (this._activeImg && this._resizeOverlay) {
        this._positionOverlay(this._resizeOverlay, this._activeImg);
      }
    });

    // 点击编辑器外区域 → 隐藏手柄
    this._resizeDocClickHandler = (e) => {
      if (this._activeImg && !e.target.closest('#notebook-editor') && !e.target.closest('#notebook-img-overlay')) {
        this._hideImageHandles();
      }
    };
    document.addEventListener('click', this._resizeDocClickHandler);
  },

  _showImageHandles(img) {
    this._hideImageHandles();
    this._activeImg = img;

    // 图片选中高亮
    img.style.outline = '2px solid var(--khaki-800)';
    img.style.outlineOffset = '2px';

    // 创建手柄覆盖层
    const overlay = document.createElement('div');
    overlay.id = 'notebook-img-overlay';
    overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:50;';

    // 4 个角的拖拽手柄
    const corners = [
      { name: 'nw', cursor: 'nwse-resize', pos: { top: '-5px', left: '-5px' } },
      { name: 'ne', cursor: 'nesw-resize', pos: { top: '-5px', right: '-5px' } },
      { name: 'sw', cursor: 'nesw-resize', pos: { bottom: '-5px', left: '-5px' } },
      { name: 'se', cursor: 'nwse-resize', pos: { bottom: '-5px', right: '-5px' } },
    ];

    corners.forEach(({ name, cursor, pos }) => {
      const handle = document.createElement('div');
      handle.style.cssText =
        'position:absolute;width:10px;height:10px;' +
        'background:var(--khaki-800);border:1.5px solid #fff;border-radius:2px;' +
        'pointer-events:auto;cursor:' + cursor + ';';
      Object.entries(pos).forEach(([k, v]) => { handle.style[k] = v; });

      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._startResize(e, name);
      });

      overlay.appendChild(handle);
    });

    this._positionOverlay(overlay, img);
    document.body.appendChild(overlay);
    this._resizeOverlay = overlay;
  },

  _positionOverlay(overlay, img) {
    // 图片已从 DOM 中移除（如被删除）
    if (!img.isConnected) {
      this._hideImageHandles();
      return;
    }
    const rect = img.getBoundingClientRect();
    overlay.style.left = rect.left + 'px';
    overlay.style.top = rect.top + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
  },

  _hideImageHandles() {
    if (this._activeImg) {
      this._activeImg.style.outline = '';
      this._activeImg.style.outlineOffset = '';
      this._activeImg = null;
    }
    if (this._resizeOverlay) {
      this._resizeOverlay.remove();
      this._resizeOverlay = null;
    }
  },

  _startResize(e, corner) {
    const img = this._activeImg;
    if (!img) return;

    const startX = e.clientX;
    const startWidth = img.offsetWidth;
    const startHeight = img.offsetHeight;
    const aspectRatio = startWidth / startHeight;
    const editor = document.getElementById('notebook-editor');
    const maxWidth = editor.clientWidth - 24; // 减去 padding

    const onMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      let newWidth;
      if (corner === 'se' || corner === 'ne') {
        newWidth = startWidth + dx;
      } else {
        newWidth = startWidth - dx;
      }
      newWidth = Math.max(80, Math.min(maxWidth, newWidth));
      const newHeight = newWidth / aspectRatio;

      img.style.width = newWidth + 'px';
      img.style.height = newHeight + 'px';

      if (this._resizeOverlay) {
        this._positionOverlay(this._resizeOverlay, img);
      }
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      this._triggerAutoSave();
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  },

  destroy() {
    this._hideImageHandles();
    if (this._resizeDocClickHandler) {
      document.removeEventListener('click', this._resizeDocClickHandler);
      this._resizeDocClickHandler = null;
    }
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
    this._saveCurrentNote();
  },
};

window.TB = TB;
