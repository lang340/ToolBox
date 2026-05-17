var TB = window.TB || {};

TB.Schedule = {
  currentDate: new Date(),
  viewYear: new Date().getFullYear(),
  viewMonth: new Date().getMonth(),
  selectedDate: null,
  tasks: [],
  monthTaskDates: [],

  render() {
    return `
      <h1>日程 & 任务</h1>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <button class="btn-text" id="schedule-prev">&lt;</button>
          <span id="schedule-month-label" style="font-size:14px;font-weight:500;color:var(--text-primary);min-width:100px;text-align:center;"></span>
          <button class="btn-text" id="schedule-next">&gt;</button>
          <button class="btn-text" id="schedule-today" style="font-size:11px;">今天</button>
        </div>
        <button class="btn-primary" id="schedule-add">+ 新建任务</button>
      </div>
      <div id="schedule-calendar" class="card" style="margin-bottom:16px;"></div>
      <div id="schedule-task-list"></div>
    `;
  },

  init() {
    this.selectedDate = this._formatDate(new Date());
    this._bindEvents();
    this._renderCalendar();
    this._loadTasks();
    this._loadMonthTasks();
  },

  _bindEvents() {
    document.getElementById('schedule-prev').addEventListener('click', () => {
      this.viewMonth--;
      if (this.viewMonth < 0) { this.viewMonth = 11; this.viewYear--; }
      this._renderCalendar();
      this._loadMonthTasks();
    });
    document.getElementById('schedule-next').addEventListener('click', () => {
      this.viewMonth++;
      if (this.viewMonth > 11) { this.viewMonth = 0; this.viewYear++; }
      this._renderCalendar();
      this._loadMonthTasks();
    });
    document.getElementById('schedule-today').addEventListener('click', () => {
      const now = new Date();
      this.viewYear = now.getFullYear();
      this.viewMonth = now.getMonth();
      this.selectedDate = this._formatDate(now);
      this._renderCalendar();
      this._loadTasks();
      this._loadMonthTasks();
    });
    document.getElementById('schedule-add').addEventListener('click', () => {
      this._showAddTaskModal();
    });
  },

  _renderCalendar() {
    const label = document.getElementById('schedule-month-label');
    label.textContent = `${this.viewYear}年${this.viewMonth + 1}月`;

    const container = document.getElementById('schedule-calendar');
    const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
    const firstDay = new Date(this.viewYear, this.viewMonth, 1);
    let startWeekday = firstDay.getDay() - 1;
    if (startWeekday < 0) startWeekday = 6;
    const daysInMonth = new Date(this.viewYear, this.viewMonth + 1, 0).getDate();
    const today = this._formatDate(new Date());

    let html = '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center;">';

    weekdays.forEach((d) => {
      html += `<div style="font-size:11px;color:var(--text-hint);padding:6px 0;">${d}</div>`;
    });

    for (let i = 0; i < startWeekday; i++) {
      html += '<div style="padding:6px 0;"></div>';
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${this.viewYear}-${String(this.viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = dateStr === today;
      const isSelected = dateStr === this.selectedDate;
      const hasTask = this.monthTaskDates.includes(dateStr);

      let style = 'padding:6px 0;font-size:12px;cursor:pointer;border-radius:var(--radius-sm);position:relative;';
      if (isSelected) {
        style += 'background:var(--khaki-800);color:#fff;';
      } else if (isToday) {
        style += 'background:var(--khaki-200);color:var(--text-primary);font-weight:500;';
      } else {
        style += 'color:var(--text-secondary);';
      }

      html += `<div class="calendar-day" data-date="${dateStr}" style="${style}">${day}`;
      if (hasTask && !isSelected) {
        html += '<div style="width:4px;height:4px;background:var(--color-warning);border-radius:50%;margin:2px auto 0;"></div>';
      }
      html += '</div>';
    }

    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('.calendar-day').forEach((el) => {
      el.addEventListener('click', () => {
        this.selectedDate = el.dataset.date;
        this._renderCalendar();
        this._loadTasks();
      });
    });
  },

  async _loadTasks() {
    try {
      this.tasks = await window.api.task.getByDate(this.selectedDate) || [];
      this._renderTaskList();
    } catch (e) {
      console.warn('Load tasks failed:', e);
      this.tasks = [];
      this._renderTaskList();
    }
  },

  async _loadMonthTasks() {
    try {
      this.monthTaskDates = await window.api.task.getByMonth(this.viewYear, this.viewMonth + 1) || [];
      this._renderCalendar();
    } catch (e) {
      console.warn('Load month tasks failed:', e);
    }
  },

  _renderTaskList() {
    const container = document.getElementById('schedule-task-list');
    if (!this.tasks || this.tasks.length === 0) {
      container.innerHTML = '<div class="empty-state"><span>当天没有任务</span></div>';
      return;
    }

    const repeatLabels = {
      once: '仅当天',
      days: '有效N天',
      weekdays: '指定周几',
      daily: '每天循环',
    };

    container.innerHTML = this.tasks.map((task) => {
      const completed = task.completed === 1;
      const timeStr = task.time_start ? `${task.time_start}${task.time_end ? ' - ' + task.time_end : ''}` : '';
      const metaStr = task.repeat_meta ? this._formatRepeatMeta(task.repeat_type, task.repeat_meta) : '';

      return `
        <div class="card" style="margin-bottom:8px;display:flex;align-items:center;gap:10px;${completed ? 'opacity:0.5;' : ''}">
          <div class="task-checkbox" data-id="${task.id}" style="
            width:18px;height:18px;border-radius:50%;border:1.5px solid var(--khaki-400);
            display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;
            ${completed ? 'background:var(--color-success);border-color:var(--color-success);' : ''}
          ">
            ${completed ? '<svg viewBox="0 0 12 12" width="10" height="10" stroke="#fff" fill="none" stroke-width="2" stroke-linecap="round"><polyline points="2,6 5,9 10,3"/></svg>' : ''}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;${completed ? 'text-decoration:line-through;' : ''}color:var(--text-primary);">${this._escapeHtml(task.title)}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
              ${timeStr ? timeStr + ' · ' : ''}${repeatLabels[task.repeat_type] || task.repeat_type}${metaStr ? ' · ' + metaStr : ''}
            </div>
          </div>
          <div style="display:flex;gap:4px;">
            <button class="btn-text" data-edit="${task.id}" style="font-size:11px;">编辑</button>
            <button class="btn-text" data-delete="${task.id}" style="font-size:11px;color:var(--color-danger);">删除</button>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.task-checkbox').forEach((el) => {
      el.addEventListener('click', () => {
        const id = parseInt(el.dataset.id);
        window.api.task.toggleComplete(id, this.selectedDate);
        this._loadTasks();
      });
    });

    container.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.edit);
        const task = this.tasks.find((t) => t.id === id);
        if (task) this._showAddTaskModal(task);
      });
    });

    container.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.delete);
        window.api.task.delete(id);
        this._loadTasks();
        this._loadMonthTasks();
      });
    });
  },

  _showAddTaskModal(task = null) {
    const isEdit = !!task;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h2>${isEdit ? '编辑任务' : '新建任务'}</h2>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div>
            <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px;">任务名称</label>
            <input type="text" id="task-title" value="${isEdit ? this._escapeHtml(task.title) : ''}" placeholder="输入任务名称" style="width:100%;">
          </div>
          <div>
            <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px;">重复规则</label>
            <div style="display:flex;flex-direction:column;gap:6px;">
              <label style="font-size:12px;display:flex;align-items:center;gap:6px;">
                <input type="radio" name="repeat-type" value="once" ${(!isEdit || task.repeat_type === 'once') ? 'checked' : ''}> 仅当天
              </label>
              <label style="font-size:12px;display:flex;align-items:center;gap:6px;">
                <input type="radio" name="repeat-type" value="days" ${isEdit && task.repeat_type === 'days' ? 'checked' : ''}> 有效
                <input type="number" id="repeat-days" value="${isEdit && task.repeat_type === 'days' ? (JSON.parse(task.repeat_meta || '{}').count || 3) : 3}" min="1" max="365" style="width:48px;text-align:center;">
                天
              </label>
              <label style="font-size:12px;display:flex;align-items:center;gap:6px;">
                <input type="radio" name="repeat-type" value="weekdays" ${isEdit && task.repeat_type === 'weekdays' ? 'checked' : ''}> 指定周几
              </label>
              <div id="weekday-picker" style="display:flex;gap:4px;padding-left:22px;">
                ${['一','二','三','四','五','六','日'].map((d, i) => {
                  const dayNum = i + 1;
                  const checked = isEdit && task.repeat_type === 'weekdays' && JSON.parse(task.repeat_meta || '{}').days?.includes(dayNum);
                  return `<div class="weekday-btn${checked ? ' active' : ''}" data-day="${dayNum}" style="
                    width:28px;height:28px;border-radius:50%;border:0.5px solid var(--border-light);
                    display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:11px;
                    ${checked ? 'background:var(--khaki-800);color:#fff;border-color:var(--khaki-800);' : 'color:var(--text-muted);'}
                  ">${d}</div>`;
                }).join('')}
              </div>
              <label style="font-size:12px;display:flex;align-items:center;gap:6px;">
                <input type="radio" name="repeat-type" value="daily" ${isEdit && task.repeat_type === 'daily' ? 'checked' : ''}> 每天循环
              </label>
            </div>
          </div>
          <div style="display:flex;gap:12px;">
            <div style="flex:1;">
              <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px;">开始时间 (可选)</label>
              <input type="time" id="task-time-start" value="${isEdit && task.time_start ? task.time_start : ''}" style="width:100%;">
            </div>
            <div style="flex:1;">
              <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px;">结束时间 (可选)</label>
              <input type="time" id="task-time-end" value="${isEdit && task.time_end ? task.time_end : ''}" style="width:100%;">
            </div>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px;">
            <button class="btn-secondary" id="task-cancel">取消</button>
            <button class="btn-primary" id="task-save">${isEdit ? '保存' : '确定'}</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const weekdayBtns = overlay.querySelectorAll('.weekday-btn');
    weekdayBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('active');
        if (btn.classList.contains('active')) {
          btn.style.background = 'var(--khaki-800)';
          btn.style.color = '#fff';
          btn.style.borderColor = 'var(--khaki-800)';
        } else {
          btn.style.background = '';
          btn.style.color = 'var(--text-muted)';
          btn.style.borderColor = 'var(--border-light)';
        }
      });
    });

    overlay.querySelector('#task-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#task-save').addEventListener('click', () => {
      const title = document.getElementById('task-title').value.trim();
      if (!title) return;

      const repeatType = overlay.querySelector('input[name="repeat-type"]:checked').value;
      let repeatMeta = null;

      if (repeatType === 'days') {
        const count = parseInt(document.getElementById('repeat-days').value) || 3;
        repeatMeta = JSON.stringify({ count });
      } else if (repeatType === 'weekdays') {
        const days = [];
        weekdayBtns.forEach((btn) => {
          if (btn.classList.contains('active')) days.push(parseInt(btn.dataset.day));
        });
        if (days.length === 0) return;
        repeatMeta = JSON.stringify({ days });
      }

      const timeStart = document.getElementById('task-time-start').value || null;
      const timeEnd = document.getElementById('task-time-end').value || null;

      const taskData = {
        title,
        repeat_type: repeatType,
        repeat_meta: repeatMeta,
        start_date: this.selectedDate,
        time_start: timeStart,
        time_end: timeEnd,
      };

      if (isEdit) {
        window.api.task.update(task.id, taskData);
      } else {
        window.api.task.create(taskData);
      }

      overlay.remove();
      this._loadTasks();
      this._loadMonthTasks();
    });
  },

  _formatRepeatMeta(type, metaStr) {
    try {
      const meta = JSON.parse(metaStr);
      if (type === 'days' && meta.count) return `${meta.count}天`;
      if (type === 'weekdays' && meta.days) {
        const dayNames = ['', '一', '二', '三', '四', '五', '六', '日'];
        return meta.days.map((d) => '周' + dayNames[d]).join('、');
      }
    } catch {}
    return '';
  },

  _formatDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  },

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  destroy() {},
};

window.TB = TB;
