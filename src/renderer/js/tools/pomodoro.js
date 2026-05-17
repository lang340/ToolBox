var TB = window.TB || {};

TB.Pomodoro = {
  render() {
    return `
      <h1>番茄钟</h1>
      <div class="pomodoro-container" style="display:flex;flex-direction:column;align-items:center;gap:20px;">
        <div class="pomodoro-ring" style="position:relative;width:180px;height:180px;">
          <svg viewBox="0 0 180 180" style="transform:rotate(-90deg);">
            <circle cx="90" cy="90" r="80" stroke="var(--khaki-300)" stroke-width="4" fill="none"/>
            <circle id="pomodoro-progress" cx="90" cy="90" r="80" stroke="var(--color-warning)" stroke-width="4" fill="none"
              stroke-dasharray="502.65" stroke-dashoffset="0" stroke-linecap="round"/>
          </svg>
          <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">
            <span id="pomodoro-time" style="font-size:28px;font-weight:500;color:var(--text-primary);">25:00</span>
            <span id="pomodoro-label" style="font-size:12px;color:var(--text-muted);margin-top:2px;">工作</span>
          </div>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn-primary" id="pomodoro-start">开始</button>
          <button class="btn-secondary" id="pomodoro-pause" disabled>暂停</button>
          <button class="btn-secondary" id="pomodoro-reset">重置</button>
        </div>
        <div style="display:flex;gap:16px;align-items:center;margin-top:8px;">
          <label style="font-size:12px;color:var(--text-muted);">
            工作 <input type="number" id="pomodoro-work-min" value="25" min="1" max="120" style="width:48px;text-align:center;">
          </label>
          <label style="font-size:12px;color:var(--text-muted);">
            休息 <input type="number" id="pomodoro-break-min" value="5" min="1" max="60" style="width:48px;text-align:center;">
          </label>
        </div>
        <div id="pomodoro-stats" style="font-size:12px;color:var(--text-muted);"></div>
      </div>
    `;
  },

  init() {
    this.workMinutes = 25;
    this.breakMinutes = 5;
    this.totalSeconds = this.workMinutes * 60;
    this.remainingSeconds = this.totalSeconds;
    this.isRunning = false;
    this.isWork = true;
    this.intervalId = null;
    this.circumference = 2 * Math.PI * 80;

    this._bindEvents();
    this._updateDisplay();
    this._loadStats();
  },

  _bindEvents() {
    document.getElementById('pomodoro-start').addEventListener('click', () => this._start());
    document.getElementById('pomodoro-pause').addEventListener('click', () => this._pause());
    document.getElementById('pomodoro-reset').addEventListener('click', () => this._reset());
    document.getElementById('pomodoro-work-min').addEventListener('change', (e) => {
      this.workMinutes = Math.max(1, Math.min(120, parseInt(e.target.value) || 25));
      e.target.value = this.workMinutes;
      if (!this.isRunning && this.isWork) {
        this.totalSeconds = this.workMinutes * 60;
        this.remainingSeconds = this.totalSeconds;
        this._updateDisplay();
      }
    });
    document.getElementById('pomodoro-break-min').addEventListener('change', (e) => {
      this.breakMinutes = Math.max(1, Math.min(60, parseInt(e.target.value) || 5));
      e.target.value = this.breakMinutes;
      if (!this.isRunning && !this.isWork) {
        this.totalSeconds = this.breakMinutes * 60;
        this.remainingSeconds = this.totalSeconds;
        this._updateDisplay();
      }
    });
  },

  _start() {
    if (this.isRunning) return;
    this.isRunning = true;
    document.getElementById('pomodoro-start').disabled = true;
    document.getElementById('pomodoro-pause').disabled = false;

    this.intervalId = setInterval(() => {
      this.remainingSeconds--;
      this._updateDisplay();

      if (this.remainingSeconds <= 0) {
        this._onTimerComplete();
      }
    }, 1000);
  },

  _pause() {
    if (!this.isRunning) return;
    this.isRunning = false;
    clearInterval(this.intervalId);
    document.getElementById('pomodoro-start').disabled = false;
    document.getElementById('pomodoro-pause').disabled = true;
  },

  _reset() {
    this.isRunning = false;
    clearInterval(this.intervalId);
    this.isWork = true;
    this.totalSeconds = this.workMinutes * 60;
    this.remainingSeconds = this.totalSeconds;
    document.getElementById('pomodoro-start').disabled = false;
    document.getElementById('pomodoro-pause').disabled = true;
    this._updateDisplay();
  },

  _onTimerComplete() {
    clearInterval(this.intervalId);
    this.isRunning = false;

    this._playSound();

    if (this.isWork) {
      window.api.pomodoro.saveRecord(this.workMinutes * 60, 'work');
      this.isWork = false;
      this.totalSeconds = this.breakMinutes * 60;
      this._loadStats();
    } else {
      window.api.pomodoro.saveRecord(this.breakMinutes * 60, 'break');
      this.isWork = true;
      this.totalSeconds = this.workMinutes * 60;
    }

    this.remainingSeconds = this.totalSeconds;
    document.getElementById('pomodoro-start').disabled = false;
    document.getElementById('pomodoro-pause').disabled = true;
    this._updateDisplay();
  },

  _updateDisplay() {
    const mins = Math.floor(this.remainingSeconds / 60);
    const secs = this.remainingSeconds % 60;
    document.getElementById('pomodoro-time').textContent =
      `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    document.getElementById('pomodoro-label').textContent = this.isWork ? '工作' : '休息';

    const progress = document.getElementById('pomodoro-progress');
    if (progress) {
      const offset = this.circumference * (1 - this.remainingSeconds / this.totalSeconds);
      progress.setAttribute('stroke-dashoffset', offset);
      progress.setAttribute('stroke', this.isWork ? 'var(--color-warning)' : 'var(--color-success)');
    }
  },

  _playSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gain.gain.value = 0.3;
      oscillator.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1);
      oscillator.stop(ctx.currentTime + 1);
    } catch (e) {
      console.warn('Audio playback failed:', e);
    }
  },

  async _loadStats() {
    try {
      const result = await window.api.pomodoro.getToday();
      const count = result ? result.count : 0;
      const el = document.getElementById('pomodoro-stats');
      if (el) el.textContent = `今日完成: ${count} 个番茄`;
    } catch (e) {
      console.warn('Load pomodoro stats failed:', e);
    }
  },

  destroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  },
};

window.TB = TB;
