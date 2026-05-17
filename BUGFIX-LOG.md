# ToolBox Bug 修复日志

> 记录项目开发过程中遇到的所有问题、根因分析和修复方案。

---

## P0 发布前代码审查修复

### 1. SQL 注入风险
- **现象**：`task:update` 的 IPC handler 直接拼接用户传入的字段名构建 SQL
- **根因**：`Object.entries(fields)` 未做字段白名单校验，恶意调用可注入任意 SQL
- **修复**：新增 `ALLOWED_TASK_FIELDS` 白名单，只允许 `['title', 'repeat_type', 'repeat_meta', 'start_date', 'end_date', 'time_start', 'time_end']`，不在白名单内的字段直接跳过
- **文件**：`src/main/index.js`

### 2. IPC handler 未捕获异常
- **现象**：任何 IPC handler 内部抛异常会导致渲染进程 Promise 永远 pending
- **根因**：`ipcMain.handle` 回调内未 try-catch
- **修复**：新增 `safeHandler(fn)` 包装函数，统一 catch 异常并返回 `{ error, success: false }`
- **文件**：`src/main/index.js`

### 3. 删除任务无事务保护
- **现象**：`task:delete` 先删 `task_completions` 再删 `tasks`，中间出错会导致孤立记录
- **根因**：两次 DELETE 未用事务包裹
- **修复**：用 `BEGIN TRANSACTION / COMMIT / ROLLBACK` 包裹，手动操作 `_db.run()` 并在成功后调用 `scheduleSave()`
- **文件**：`src/main/index.js`

### 4. 日记保存竞态
- **现象**：快速切换日期时，后加载的日记内容可能被先触发的保存覆盖
- **根因**：`_loadDiary()` 异步加载期间 `_isLoading` 标志未设置，`input` 事件仍触发保存
- **修复**：加载前设 `_isLoading = true`，加载完成后在 `finally` 中重置为 `false`，`_triggerAutoSave()` 检查 `_isLoading` 时直接 return
- **文件**：`src/renderer/js/tools/diary.js`（已替换为 notebook.js）

### 5. 剪贴板图片哈希不稳定
- **现象**：`bitmap.length` 作为图片哈希不可靠，不同图片可能 length 相同
- **根因**：`nativeImage.toBitmap()` 返回的 buffer 长度不唯一
- **修复**：改用 `crypto.createHash('md5').update(png).digest('hex')`，对 PNG buffer 做 MD5 哈希
- **文件**：`src/main/index.js`

### 6. Date 时区偏移
- **现象**：`new Date('YYYY-MM-DD')` 在部分环境下解析为 UTC 时间，导致日期偏移一天
- **根因**：ISO 8601 日期字符串不含时区信息时，JS 规范按 UTC 解析
- **修复**：所有日期字符串追加 `T00:00:00` 强制按本地时间解析
- **文件**：`src/main/index.js`（`isTaskActiveOnDate`）

### 7. 图片扩展名注入
- **现象**：`saveImage()` 直接使用用户传入的扩展名，可能写入 `.exe` 等危险文件
- **根因**：未校验文件扩展名
- **修复**：新增 `ALLOWED_IMAGE_EXTS` 白名单 `['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']`，不在白名单内则默认 `png`
- **文件**：`src/main/index.js`

### 8. AudioContext 泄漏
- **现象**：番茄钟每次完成都 `new AudioContext()`，多次使用后浏览器报警
- **根因**：未复用 AudioContext 实例
- **修复**：改为单例模式，首次创建后复用，每次播放前检查 `state` 是否为 `suspended` 并 `resume()`
- **文件**：`src/renderer/js/tools/pomodoro.js`

### 9. Schedule 初始化缺失
- **现象**：日程模块首次加载时日历上无任务标记
- **根因**：`init()` 中未调用 `_loadMonthTasks()`
- **修复**：在 `init()` 末尾添加 `this._loadMonthTasks()` 调用
- **文件**：`src/renderer/js/tools/schedule.js`

---

## 用户反馈 Bug 修复

### 10. 番茄钟数字输入框箭头遮挡
- **现象**：鼠标放在自定义时间输入框时出现上下箭头，点击会增减时间，箭头遮挡数字
- **根因**：浏览器对 `<input type="number">` 默认渲染 spinner 控件（Chrome/Edge 的上下箭头）
- **修复**：CSS 隐藏 spinner
  ```css
  input[type="number"]::-webkit-inner-spin-button,
  input[type="number"]::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  input[type="number"] {
    -moz-appearance: textfield;
  }
  ```
- **文件**：`src/renderer/styles/base.css`

### 11. 剪贴板删除按钮堆叠在视口角落
- **现象**：文字卡片的删除按钮堆叠在视口右上角；图片卡片无可见删除按钮
- **根因**：文字卡片未设 `position: relative`，内部 `position: absolute` 的删除按钮相对视口定位而非相对卡片
- **修复**：文字卡片行内样式添加 `position: relative`
- **文件**：`src/renderer/js/tools/clipboard.js`

### 12. 剪贴板复制一次显示 6 条相同记录
- **现象**：复制文字或图片后，剪贴板列表出现 6 条完全相同的记录
- **根因**：`ipcRenderer.on('clipboard:new-record', callback)` 在每次切换回剪贴板页面时重复注册，监听器累积。切 6 次页面就 6 个监听器，一次复制触发 6 次回调
- **修复**：
  1. `preload.js` 的 `onNewRecord` 改为先 `removeAllListeners('clipboard:new-record')` 再注册
  2. 主进程加 `lastClipboardSaveTime` 防护，1 秒内不重复入库（纵深防御）
- **文件**：`preload.js`、`src/main/index.js`

### 13. 日记本一天只能记录一条
- **现象**：日记本模块每天只能写一条记录，无法按想法添加多条
- **根因**：`diaries` 表的 `date` 字段有 `UNIQUE` 约束，同一天只能插入一条
- **修复**：全面改造为记事本模块
  1. DB：新建 `notes` 表（id, title, content, created_at, updated_at），无 UNIQUE 约束，Schema v2 迁移
  2. IPC：`diary:*` → `note:*`，完整 CRUD（create/get/getAll/update/delete/uploadImage）
  3. 渲染层：`diary.js` → `notebook.js`，左侧笔记标题列表，右侧富文本编辑器
  4. 侧边栏/路由：diary → notebook，tooltip "日记本" → "记事本"
- **文件**：`src/main/db-service.js`、`src/main/index.js`、`preload.js`、`src/renderer/js/tools/notebook.js`、`src/renderer/js/sidebar.js`、`src/renderer/js/app.js`、`src/renderer/index.html`

---

## 记事本模块专项修复

### 14. 切换笔记后标题显示"未命名笔记"
- **现象**：输入标题后左侧列表正确显示，但切换到别的笔记再切回来，标题变回"未命名笔记"；删除其他笔记后标题又恢复
- **根因**：`_saveCurrentNote()` 和 `_saveTitle()` 只更新了数据库和 DOM，未同步内存中的 `this.noteList`。`_renderNoteList()` 从旧 noteList 重建 DOM 时，标题被覆盖为旧值（空标题显示"未命名笔记"）
- **修复**：新增 `_syncNoteData(id, title)` 方法，保存时同步更新 noteList 中对应笔记的 title
- **文件**：`src/renderer/js/tools/notebook.js`

### 15. 新笔记继承上一个笔记的标题 / 笔记标题互相覆盖
- **现象**：添加新笔记后，新笔记的侧栏标题显示为上一个笔记的标题；点击笔记 1 再点笔记 2，笔记 2 的标题被笔记 1 的标题覆盖
- **根因**：异步竞态。`_selectNote()` 中 `_saveCurrentNote()` 未被 `await`，且内部用 `this.currentNoteId`（实例属性）而非局部变量。当 `_saveCurrentNote` 的 `await` 返回时，`this.currentNoteId` 已经变成新笔记的 ID，导致旧笔记的标题被写到了新笔记的 noteList 条目和 DOM 上
- **修复**：
  1. `_selectNote()` 中 `this._saveCurrentNote()` → `await this._saveCurrentNote()`，确保保存完成后再切换 ID
  2. `_saveCurrentNote()` 和 `_saveTitle()` 开头用 `const id = this.currentNoteId` 固住 ID，后续全部使用局部变量
- **文件**：`src/renderer/js/tools/notebook.js`

### 16. 笔记列表排序混乱 + 时间被篡改
- **现象**：按顺序创建 1→2→3→4→5→6→7→8，列表显示 8→4→2→6→7→3→5→1 完全乱序；部分笔记的更新时间被改成一样的
- **根因**：两层问题
  1. `_saveCurrentNote()` 在 `_selectNote()` 中无条件调用，即使内容未修改也会保存 → 数据库 `UPDATE` 触发 `updated_at = datetime('now', 'localtime')` 刷新 → 快速点击多个笔记时多个笔记的 updated_at 被刷新成同一时间
  2. `note:get-all` 查询用 `ORDER BY updated_at DESC` 排序 → updated_at 被污染后排序全乱，同秒内无稳定排序则随机
- **修复**：
  1. 新增 `_isDirty` 脏标记，`_triggerAutoSave()` 和 `_saveTitle()` 在真正修改时设 `_isDirty = true`，`_saveCurrentNote()` 开头检查 `if (!this._isDirty) return` 无修改则跳过保存，保存成功后 `_isDirty = false`
  2. 排序改为 `ORDER BY id DESC`（自增主键，天然按创建顺序），不受 updated_at 污染影响
- **文件**：`src/renderer/js/tools/notebook.js`、`src/main/index.js`

---

## UI 与窗口美化

### 17. 隐藏系统菜单栏，自定义卡其色标题栏
- **现象**：窗口顶部有 File/Edit/View/Window/Help 系统菜单栏，风格与主界面不统一
- **根因**：Electron 默认创建系统菜单栏和框架标题栏
- **修复**：
  1. `frame: false` 去掉系统标题栏框架
  2. `Menu.setApplicationMenu(null)` 完全移除菜单栏
  3. HTML 顶部添加自定义标题栏：卡其色背景、左侧图标+ToolBox（`-webkit-app-region: drag` 可拖动）、右侧最小化/最大化/关闭按钮
  4. 按钮 hover 效果：普通按钮 hover 浅卡其背景，关闭按钮 hover 红色背景
  5. 调整 `#app` 高度为 `calc(100vh - 32px)`、侧边栏高度同步
  6. IPC 暴露 `window:minimize/maximize/close/is-maximized`，渲染层绑定按钮事件
- **文件**：`src/main/index.js`、`preload.js`、`src/renderer/index.html`、`src/renderer/styles/base.css`、`src/renderer/styles/sidebar.css`、`src/renderer/js/app.js`

## 环境与启动问题

### 18. Electron 启动报 `Cannot read properties of undefined (reading 'whenReady')`
- **现象**：`npm start` 报 `TypeError: app.whenReady is not a function`
- **根因**：系统环境变量 `ELECTRON_RUN_AS_NODE=1` 导致 Electron 以 Node.js 模式运行而非桌面应用模式，`app` 对象不完整
- **修复**：启动前清除该变量
  ```bash
  set ELECTRON_RUN_AS_NODE=
  npx electron .
  ```
  `cross-env ELECTRON_RUN_AS_NODE=` 在 Windows 上设空字符串仍被 Electron 检测为存在，必须 `set` 清除
- **文件**：运行时环境问题，非代码缺陷
