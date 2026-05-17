var TB = window.TB || {};

TB.Sidebar = {
  container: null,
  items: [
    {
      name: 'pomodoro',
      tooltip: '番茄钟',
      icon: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M10 4c0 0 1 .5 2 .5s2-.5 2-.5"/>',
    },
    {
      name: 'clipboard',
      tooltip: '剪贴板',
      icon: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M7 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>',
    },
    {
      name: 'schedule',
      tooltip: '日程 & 任务',
      icon: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><rect x="7" y="13" width="3" height="3" rx="0.5"/><rect x="14" y="13" width="3" height="3" rx="0.5"/>',
    },
    {
      name: 'notebook',
      tooltip: '记事本',
      icon: '<path d="M4 4h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4"/><path d="M4 4a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v14"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="14" y2="14"/>',
    },
  ],

  init(sidebarId) {
    this.container = document.getElementById(sidebarId);
    this.render();
  },

  render() {
    let html = '';
    this.items.forEach((item, index) => {
      html += `
        <div class="sidebar-icon${index === 0 ? ' active' : ''}" data-tool="${item.name}">
          <svg viewBox="0 0 24 24">${item.icon}</svg>
          <span class="sidebar-tooltip">${item.tooltip}</span>
        </div>
      `;
      if (index === 1) {
        html += '<div class="sidebar-divider"></div>';
      }
    });
    this.container.innerHTML = html;
    this.bindEvents();
  },

  bindEvents() {
    this.container.querySelectorAll('.sidebar-icon').forEach((el) => {
      el.addEventListener('click', () => {
        const toolName = el.dataset.tool;
        this.setActive(toolName);
        TB.Router.navigate(toolName);
      });
    });
  },

  setActive(name) {
    this.container.querySelectorAll('.sidebar-icon').forEach((el) => {
      el.classList.toggle('active', el.dataset.tool === name);
    });
  },
};

window.TB = TB;
