var TB = window.TB || {};

TB.Diary = {
  currentMonth: null,
  currentDiaryDate: null,
  diaryList: [],
  autoSaveTimer: null,
  quill: null,

  render() {
    return `
      <h1>日记本</h1>
      <div style="display:flex;gap:16px;height:calc(100vh - 80px);">
        <div id="diary-sidebar" style="width:130px;flex-shrink:0;overflow-y:auto;border-right:0.5px solid var(--border-light);padding-right:12px;"></div>
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;">
          <div id="diary-toolbar" style="display:flex;gap:4px;margin-bottom:8px;padding:6px 8px;background:var(--bg-secondary);border-radius:var(--radius-md);border:0.5px solid var(--border-light);"></div>
          <div id="diary-editor" style="flex:1;overflow-y:auto;padding:12px;background:var(--bg-secondary);border-radius:var(--radius-md);border:0.5px solid var(--border-light);font-size:13px;line-height:1.8;min-height:300px;" contenteditable="true"></div>
        </div>
      </div>
    `;
  },

  init() {
    const now = new Date();
    this.currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    this.currentDiaryDate = this._formatDate(now);

    this._renderToolbar();
    this._loadDiaryList();
    this._loadDiary(this.currentDiaryDate);
    this._setupAutoSave();
  },

  _renderToolbar() {
    const toolbar = document.getElementById('diary-toolbar');
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
          <input type="color" id="diary-color" value="#4A3D2A" style="position:absolute;opacity:0;width:0;height:0;">
        </label>`;
      } else if (btn.type === 'select') {
        html += `<select id="diary-fontsize" style="height:26px;font-size:11px;padding:0 4px;">
          <option value="2">小</option>
          <option value="3" selected>中</option>
          <option value="4">大</option>
          <option value="5">特大</option>
        </select>`;
      } else if (btn.type === 'image') {
        html += `<button class="btn-text" id="diary-insert-image" style="font-size:12px;">${btn.icon}</button>`;
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

    document.getElementById('diary-color').addEventListener('input', (e) => {
      document.execCommand('foreColor', false, e.target.value);
      this._triggerAutoSave();
    });

    document.getElementById('diary-fontsize').addEventListener('change', (e) => {
      document.execCommand('fontSize', false, e.target.value);
      this._triggerAutoSave();
    });

    document.getElementById('diary-insert-image').addEventListener('click', () => {
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
          const filename = await window.api.diary.uploadImage(base64, ext);
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

  async _loadDiaryList() {
    try {
      this.diaryList = await window.api.diary.getList(this.currentMonth) || [];
      this._renderDiarySidebar();
    } catch (e) {
      console.warn('Load diary list failed:', e);
    }
  },

  _renderDiarySidebar() {
    const sidebar = document.getElementById('diary-sidebar');
    const now = new Date();
    const todayStr = this._formatDate(now);

    let dates = [];
    const year = parseInt(this.currentMonth.split('-')[0]);
    const month = parseInt(this.currentMonth.split('-')[1]);
    const daysInMonth = new Date(year, month, 0).getDate();

    for (let d = daysInMonth; d >= 1; d--) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const hasDiary = this.diaryList.some((item) => item.date === dateStr);
      if (hasDiary || dateStr === todayStr) {
        dates.push(dateStr);
      }
    }

    if (dates.length === 0) {
      dates = [todayStr];
    }

    sidebar.innerHTML = `
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">${year}年${month}月</div>
      ${dates.map((dateStr) => {
        const day = parseInt(dateStr.split('-')[2]);
        const isToday = dateStr === todayStr;
        const isSelected = dateStr === this.currentDiaryDate;
        return `<div class="diary-date-item" data-date="${dateStr}" style="
          padding:6px 8px;font-size:12px;cursor:pointer;border-radius:var(--radius-sm);margin-bottom:2px;
          ${isSelected ? 'background:var(--khaki-800);color:#fff;' : isToday ? 'font-weight:500;color:var(--text-primary);' : 'color:var(--text-muted);'}
        ">${day}日${isToday ? ' (今天)' : ''}</div>`;
      }).join('')}
    `;

    sidebar.querySelectorAll('.diary-date-item').forEach((el) => {
      el.addEventListener('click', () => {
        this.currentDiaryDate = el.dataset.date;
        this._loadDiary(this.currentDiaryDate);
        this._renderDiarySidebar();
      });
    });
  },

  async _loadDiary(date) {
    try {
      const diary = await window.api.diary.get(date);
      const editor = document.getElementById('diary-editor');
      if (diary && diary.content) {
        editor.innerHTML = diary.content;
      } else {
        editor.innerHTML = '<p><br></p>';
      }
    } catch (e) {
      console.warn('Load diary failed:', e);
    }
  },

  _setupAutoSave() {
    const editor = document.getElementById('diary-editor');
    editor.addEventListener('input', () => {
      this._triggerAutoSave();
    });
  },

  _triggerAutoSave() {
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => {
      this._saveDiary();
    }, 1000);
  },

  async _saveDiary() {
    const editor = document.getElementById('diary-editor');
    if (!editor || !this.currentDiaryDate) return;

    const content = editor.innerHTML;
    try {
      await window.api.diary.save(this.currentDiaryDate, content);
      this._loadDiaryList();
    } catch (e) {
      console.warn('Save diary failed:', e);
    }
  },

  _formatDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  },

  destroy() {
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
    this._saveDiary();
  },
};

window.TB = TB;
