var TB = window.TB || {};

(function () {
  TB.Router.init('content');

  TB.Router.register('pomodoro', TB.Pomodoro);
  TB.Router.register('clipboard', TB.Clipboard);
  TB.Router.register('schedule', TB.Schedule);
  TB.Router.register('notebook', TB.Notebook);

  TB.Sidebar.init('sidebar');

  TB.Router.navigate('pomodoro');
})();

window.TB = TB;
