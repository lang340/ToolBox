var TB = window.TB || {};

TB.Clipboard = {
  render() {
    return `
      <h1>剪贴板记录</h1>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:12px;color:var(--text-muted);">监听</span>
          <div class="toggle" id="clipboard-toggle"></div>
        </div>
        <button class="btn-text" id="clipboard-clear">清空全部</button>
      </div>
      <div style="margin-bottom:12px;">
        <input type="text" id="clipboard-search" placeholder="搜索文字记录..." style="width:100%;padding:6px 10px;">
      </div>
      <div id="clipboard-list" style="display:flex;flex-direction:column;gap:8px;"></div>
      <div id="clipboard-empty" class="empty-state">
        <span>暂无记录</span>
        <span style="font-size:11px;margin-top:4px;">开启监听后，复制的内容会自动记录</span>
      </div>
      <div id="clipboard-modal" class="modal-overlay" style="display:none;">
        <div class="modal" style="text-align:center;">
          <img id="clipboard-modal-img" style="max-width:100%;max-height:70vh;border-radius:var(--radius-md);">
          <div style="margin-top:12px;">
            <button class="btn-secondary" id="clipboard-modal-close">关闭</button>
          </div>
        </div>
      </div>
    `;
  },

  init() {
    this.isWatching = false;
    this.records = [];
    this.searchKeyword = '';

    this._bindEvents();
    this._loadRecords();
    this._loadToggleState();
    this._listenForNewRecords();
  },

  _bindEvents() {
    const toggle = document.getElementById('clipboard-toggle');
    toggle.addEventListener('click', () => {
      this.isWatching = !this.isWatching;
      toggle.classList.toggle('active', this.isWatching);
      if (this.isWatching) {
        window.api.clipboard.start();
      } else {
        window.api.clipboard.stop();
      }
      window.api.settings.set('clipboard_watching', this.isWatching ? '1' : '0');
    });

    document.getElementById('clipboard-clear').addEventListener('click', () => {
      window.api.clipboard.clear();
      this.records = [];
      this._renderRecords();
    });

    const searchInput = document.getElementById('clipboard-search');
    let searchTimer = null;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        this.searchKeyword = e.target.value.trim().toLowerCase();
        this._renderRecords();
      }, 300);
    });

    document.getElementById('clipboard-modal-close').addEventListener('click', () => {
      document.getElementById('clipboard-modal').style.display = 'none';
    });

    document.getElementById('clipboard-modal').addEventListener('click', (e) => {
      if (e.target.id === 'clipboard-modal') {
        document.getElementById('clipboard-modal').style.display = 'none';
      }
    });
  },

  _getFilteredRecords() {
    if (!this.searchKeyword) return this.records;
    return this.records.filter((r) => {
      if (r.type === 'text') {
        return r.content.toLowerCase().includes(this.searchKeyword);
      }
      return false;
    });
  },

  _listenForNewRecords() {
    window.api.clipboard.onNewRecord((record) => {
      this.records.unshift(record);
      this._renderRecords();
    });
  },

  async _loadRecords() {
    try {
      this.records = await window.api.clipboard.getAll() || [];
      this._renderRecords();
    } catch (e) {
      console.warn('Load clipboard records failed:', e);
    }
  },

  async _loadToggleState() {
    try {
      const val = await window.api.settings.get('clipboard_watching');
      this.isWatching = val === '1';
      const toggle = document.getElementById('clipboard-toggle');
      toggle.classList.toggle('active', this.isWatching);
      if (this.isWatching) {
        window.api.clipboard.start();
      }
    } catch (e) {
      console.warn('Load clipboard toggle state failed:', e);
    }
  },

  _renderRecords() {
    const list = document.getElementById('clipboard-list');
    const empty = document.getElementById('clipboard-empty');
    const filtered = this._getFilteredRecords();

    if (!filtered || filtered.length === 0) {
      list.innerHTML = '';
      empty.style.display = 'flex';
      if (this.searchKeyword && this.records.length > 0) {
        empty.querySelector('span:first-child').textContent = '没有匹配的记录';
        empty.querySelector('span:last-child').textContent = '试试其他关键词';
      } else {
        empty.querySelector('span:first-child').textContent = '暂无记录';
        empty.querySelector('span:last-child').textContent = '开启监听后，复制的内容会自动记录';
      }
      return;
    }

    empty.style.display = 'none';
    list.innerHTML = filtered.map((record) => {
      if (record.type === 'text') {
        const text = this._escapeHtml(record.content);
        const preview = text.length > 200 ? text.substring(0, 200) + '...' : text;
        return `
          <div class="card" style="cursor:pointer;position:relative;" data-id="${record.id}" data-type="text">
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">${this._formatTime(record.created_at)}</div>
            <div style="color:var(--text-secondary);word-break:break-all;white-space:pre-wrap;">${preview}</div>
            <button class="btn-text" style="position:absolute;top:8px;right:8px;font-size:11px;" data-delete="${record.id}">删除</button>
          </div>
        `;
      } else {
        return `
          <div class="card" style="cursor:pointer;position:relative;" data-id="${record.id}" data-type="image">
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">${this._formatTime(record.created_at)}</div>
            <div style="display:flex;align-items:center;gap:8px;">
              <img src="${record.content}" style="width:80px;height:80px;object-fit:cover;border-radius:var(--radius-sm);border:0.5px solid var(--border-light);">
              <span style="font-size:12px;color:var(--text-hint);">点击查看大图</span>
            </div>
            <button class="btn-text" style="position:absolute;top:8px;right:8px;font-size:11px;" data-delete="${record.id}">删除</button>
          </div>
        `;
      }
    }).join('');

    list.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.delete);
        window.api.clipboard.delete(id);
        this.records = this.records.filter((r) => r.id !== id);
        this._renderRecords();
      });
    });

    list.querySelectorAll('[data-type="image"]').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.dataset.delete) return;
        const id = parseInt(card.dataset.id);
        const record = this.records.find((r) => r.id === id);
        if (record) {
          document.getElementById('clipboard-modal-img').src = record.content;
          document.getElementById('clipboard-modal').style.display = 'flex';
        }
      });
    });
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
      return parts[1].substring(0, 8);
    }
    return timeStr;
  },

  destroy() {},
};

window.TB = TB;
