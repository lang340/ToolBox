var TB = window.TB || {};

TB.Router = {
  container: null,
  currentTool: null,
  tools: {},

  init(containerId) {
    this.container = document.getElementById(containerId);
  },

  register(name, module) {
    this.tools[name] = module;
  },

  navigate(name) {
    if (!this.tools[name]) return;
    if (this.currentTool && this.tools[this.currentTool] && this.tools[this.currentTool].destroy) {
      this.tools[this.currentTool].destroy();
    }
    this.currentTool = name;
    this.container.innerHTML = '';
    const module = this.tools[name];
    this.container.innerHTML = module.render();
    if (module.init) {
      module.init();
    }
  },

  getCurrent() {
    return this.currentTool;
  },
};

window.TB = TB;
