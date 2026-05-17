var TB = window.TB || {};

(function () {
  TB.Router.init('content');

  TB.Router.register('pomodoro', TB.Pomodoro);
  TB.Router.register('clipboard', TB.Clipboard);
  TB.Router.register('schedule', TB.Schedule);
  TB.Router.register('notebook', TB.Notebook);

  TB.Sidebar.init('sidebar');

  TB.Router.navigate('pomodoro');

  // Title bar controls
  const btnMin = document.getElementById('win-minimize');
  const btnMax = document.getElementById('win-maximize');
  const btnClose = document.getElementById('win-close');

  if (btnMin) btnMin.addEventListener('click', () => window.api.window.minimize());
  if (btnClose) btnClose.addEventListener('click', () => window.api.window.close());

  if (btnMax) {
    btnMax.addEventListener('click', async () => {
      await window.api.window.maximize();
      const isMax = await window.api.window.isMaximized();
      btnMax.title = isMax ? '还原' : '最大化';
      // Toggle icon: square for normal, overlap-squares for maximized
      btnMax.innerHTML = isMax
        ? '<svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="2" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="2.5" y="0" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>'
        : '<svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>';
    });
  }
})();

window.TB = TB;
