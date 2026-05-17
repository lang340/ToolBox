# ToolBox

> 一款绿色便携的 Windows 桌面工具箱，开箱即用，无需安装。

基于 Electron + sql.js 构建，卡其色主题界面，左侧线条图标导航，集成番茄钟、剪贴板管理、记事本、日程任务四大工具。

## 功能介绍

### 番茄钟

- SVG 环形进度动画，直观显示剩余时间
- 自定义工作/休息时长
- 完成提示音（AudioContext 单例复用，避免泄漏）
- 当日完成记录统计

### 剪贴板管理

- 一键开关系统剪贴板监听
- 自动记录文字和图片内容
- 支持搜索过滤（300ms debounce）
- 图片 MD5 去重 + 1s 时间去重，防止重复记录
- 单条删除 / 全部清空

### 记事本

- 多笔记支持，左侧标题列表快速切换
- 富文本编辑器，支持图片粘贴和插入
- 图片拖拽缩放：点击图片显示四角手柄，按比例拖拽调整大小（最小 80px，最大编辑器宽度）
- 1s debounce 自动保存，`_isDirty` 脏标记避免无意义写入
- 异步竞态保护：`await` 保存 + 局部变量固住 ID，防止标题互相覆盖

### 日程 & 任务

- 月历视图，直观标记有任务的日期
- 4 种重复规则：单次 / 有效 N 天 / 指定周几 / 每天循环
- 点击日期查看当日任务，勾选完成
- 任务删除使用数据库事务，保证数据一致性

### 自定义标题栏

- 无系统菜单栏（File/Edit/View 等），界面简洁
- 卡其色自定义标题栏，与主界面风格统一
- 左侧拖拽移动窗口，右侧最小化 / 最大化 / 关闭按钮

## 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 桌面框架 | Electron 31 | 窗口管理、剪贴板监听、文件系统、系统通知 |
| 数据库 | sql.js 1.11（纯 JS SQLite） | 避免 better-sqlite3 的 C++ 编译依赖 |
| 渲染层 | Vanilla JS | 无框架，模块挂在 `window.TB` 命名空间 |
| 进程通信 | contextBridge / preload.js | IPC 安全通信，`window.api` 7 个命名空间 |
| 样式 | CSS 自定义属性 | 10 级卡其色色阶（--khaki-50 ~ --khaki-900） |
| 打包 | electron-builder 25 | Windows 便携包 |

## 项目结构

```
ToolBox/
├── package.json              # 依赖和启动脚本
├── preload.js                # contextBridge，暴露 window.api
├── data/                     # 运行时数据（自动创建）
│   ├── toolbox.db            # SQLite 数据库
│   └── images/               # 图片存储
│       ├── clipboard/
│       └── diary/
├── docs/                     # 项目文档
│   ├── PRD.md
│   ├── UI-Design.md
│   ├── Tech-Architecture.md
│   └── Execution-Plan.md
└── src/
    ├── main/                 # 主进程
    │   ├── index.js          # 入口：窗口创建、IPC handlers、剪贴板监听
    │   ├── db-service.js     # sql.js 封装：initDB / query / run / schema 迁移
    │   └── file-service.js   # 图片存储：saveImage / deleteImage / getImagePath
    └── renderer/             # 渲染进程
        ├── index.html        # 单页 HTML，CSP 安全策略
        ├── styles/
        │   ├── theme.css     # CSS 变量：色阶、语义色、布局 token
        │   ├── base.css      # 重置、按钮、卡片、模态框、滚动条
        │   └── sidebar.css   # 56px 左侧导航栏
        └── js/
            ├── app.js        # 初始化 Router + Sidebar + 窗口控制
            ├── router.js     # 简单路由：register / navigate，render→init→destroy 生命周期
            ├── sidebar.js    # SVG 图标导航
            └── tools/
                ├── pomodoro.js    # 番茄钟
                ├── clipboard.js   # 剪贴板管理
                ├── schedule.js    # 日程 & 任务
                └── notebook.js    # 记事本
```

## 数据库设计

| 表 | 字段 | 说明 |
|---|---|---|
| `clipboard_records` | id, type, content, created_at, pinned | 剪贴板记录 |
| `tasks` | id, title, repeat_type, repeat_meta, start_date, end_date, time_start, time_end, completed, created_at | 任务定义 |
| `task_completions` | id, task_id(FK), completed_date, completed_at | 任务完成记录 |
| `notes` | id, title, content, created_at, updated_at | 记事本笔记 |
| `pomodoro_records` | id, duration, type, completed_at | 番茄钟记录 |
| `settings` | key(PK), value | 键值设置 |
| `schema_version` | version(PK) | 数据库迁移版本控制 |

## 快速开始

### 环境要求

- Node.js 18+
- Windows 系统

### 开发模式

```bash
# 克隆仓库
git clone https://github.com/lang340/ToolBox.git
cd ToolBox

# 安装依赖
npm install

# 启动（需确保 ELECTRON_RUN_AS_NODE 环境变量未设置）
set ELECTRON_RUN_AS_NODE=
npx electron .
```

### 打包

```bash
# 打包为 Windows 便携包
npm run build

# 或手动打包 zip
npx electron-builder --win zip --config.electronDist="node_modules/electron/dist"
```

### 直接使用

前往 [Releases](https://github.com/lang340/ToolBox/releases) 下载最新版本，解压后双击 `ToolBox.exe` 即可运行。

## 开发过程中遇到的问题与解决方案

### 一、技术选型问题

#### better-sqlite3 编译失败 → 切换 sql.js

**问题**：better-sqlite3 需要 C++ 编译工具链（node-gyp + Visual Studio Build Tools），在当前环境无法编译。

**解决**：切换到 sql.js（SQLite 编译为 WebAssembly/JS），纯 JavaScript 无需编译，API 封装为 `query()` / `run()` 方法，配合 500ms debounce 写入文件实现持久化。

#### ELECTRON_RUN_AS_NODE 环境变量冲突

**问题**：系统环境变量 `ELECTRON_RUN_AS_NODE=1` 导致 Electron 以 Node.js 模式启动，`app.whenReady()` 等桌面 API 全部不可用，报 `TypeError: Cannot read properties of undefined`。

**解决**：启动前必须清除该变量。`cross-env ELECTRON_RUN_AS_NODE=` 在 Windows 上设空字符串仍被 Electron 检测为存在，必须用 `set ELECTRON_RUN_AS_NODE=` 彻底清除。

### 二、安全问题（P0 级）

| # | 问题 | 根因 | 解决方案 |
|---|---|---|---|
| 1 | SQL 注入风险 | `task:update` 动态拼接字段名 | `ALLOWED_TASK_FIELDS` 白名单校验 |
| 2 | IPC 异常未捕获 | handler 无 try-catch，Promise 永远 pending | `safeHandler(fn)` 统一包装 |
| 3 | 删除任务无事务 | 两次 DELETE 中间出错产生孤立记录 | `BEGIN / COMMIT / ROLLBACK` 事务包裹 |
| 4 | 图片扩展名注入 | 用户可传入 `.exe` 等危险扩展名 | `ALLOWED_IMAGE_EXTS` 白名单 |

### 三、数据一致性问题

#### 日记保存竞态

**问题**：快速切换日期时，后加载的日记内容可能被先触发的保存覆盖。

**解决**：`_isLoading` 标志位，加载期间阻止自动保存触发。

#### 记事本标题互相覆盖

**问题**：切换笔记时新笔记继承旧笔记标题，或笔记间标题互相覆盖。

**根因**：`_selectNote()` 中 `_saveCurrentNote()` 未被 `await`，且内部使用 `this.currentNoteId` 实例属性。当 `await` 返回时 `this.currentNoteId` 已变成新笔记 ID，旧笔记标题写到了新笔记上。

**解决**：
1. `await this._saveCurrentNote()` 确保保存完成再切换
2. `const id = this.currentNoteId` 局部变量固住 ID，后续全部使用局部变量

#### 排序混乱 + 时间被篡改

**问题**：按顺序创建笔记 1→2→3→8，列表显示完全乱序；部分笔记的 `updated_at` 被改成同一时间。

**根因**：`_saveCurrentNote()` 在切换笔记时无条件调用（即使内容未修改），每次 `UPDATE` 都刷新 `updated_at = datetime('now')`，快速点击多个笔记导致多个笔记的 `updated_at` 被刷成同一时间。而排序用的是 `ORDER BY updated_at DESC`，时间被污染后排序全乱。

**解决**：
1. `_isDirty` 脏标记：内容真正修改时才设为 `true`，`_saveCurrentNote()` 检查 `if (!this._isDirty) return` 跳过无意义保存
2. 排序改为 `ORDER BY id DESC`：自增主键天然按创建顺序，不受 `updated_at` 污染

### 四、功能与 UI 问题

#### 剪贴板重复记录（6 倍）

**问题**：复制一次内容，剪贴板列表出现 6 条相同记录。

**根因**：`ipcRenderer.on('clipboard:new-record', callback)` 在每次切换回剪贴板页面时重复注册，切换 6 次就累积 6 个监听器。

**解决**：
1. `preload.js` 的 `onNewRecord` 先 `removeAllListeners` 再注册
2. 主进程加 `lastClipboardSaveTime` 防护，1 秒内不重复入库（纵深防御）

#### 日记本一天只能写一条 → 改造为记事本

**问题**：`diaries` 表的 `date` 字段有 `UNIQUE` 约束，每天只能记录一条。

**解决**：全面改造为记事本模块——新建 `notes` 表（无 UNIQUE 约束）、`diary:*` IPC 改为 `note:*`、`diary.js` 重写为 `notebook.js` 支持多笔记 CRUD、侧边栏入口从"日记本"改为"记事本"。

#### 番茄钟数字输入框箭头遮挡

**问题**：`<input type="number">` 默认渲染上下箭头，遮挡数字且容易误操作。

**解决**：CSS 隐藏 spinner：
```css
input[type="number"]::-webkit-inner-spin-button,
input[type="number"]::-webkit-outer-spin-button {
  -webkit-appearance: none;
}
input[type="number"] {
  -moz-appearance: textfield;
}
```

#### 剪贴板删除按钮飘移

**问题**：文字卡片的删除按钮堆叠在视口角落。

**根因**：卡片未设 `position: relative`，内部 `position: absolute` 的删除按钮相对视口定位。

**解决**：卡片添加 `position: relative`。

#### AudioContext 泄漏

**问题**：番茄钟每次完成都 `new AudioContext()`，多次使用后浏览器报警。

**解决**：改为单例模式，首次创建后复用，播放前检查 `state === 'suspended'` 并 `resume()`。

#### 图片缩放方案

**问题**：Chromium 原生图片缩放手柄在 contentEditable 中体验差（8 个手柄、不按比例、位置跳动）。

**解决**：自定义缩放方案——
1. `enableObjectResizing = false` 禁用原生手柄
2. 点击图片时创建 `position: fixed` 覆盖层 + 4 个角手柄
3. `getBoundingClientRect()` 实时同步手柄位置
4. 拖拽角手柄按比例缩放（`aspectRatio` 守恒），最小 80px / 最大编辑器宽度
5. 点击空白 / 切换笔记 / 滚动时自动隐藏手柄

### 五、打包与部署问题

#### electron-builder NSIS 下载失败

**问题**：`electron-builder --win portable` 需要下载 NSIS 安装器，网络超时失败。

**解决**：改用 `electron-builder --win zip --config.electronDist="node_modules/electron/dist"` 生成未打包目录，再手动 `Compress-Archive` 为 zip 便携包。

## 关键设计模式

| 模式 | 说明 |
|---|---|
| TB 命名空间 | 所有渲染层模块挂在 `window.TB`，如 `TB.Pomodoro`、`TB.Router`，模块间完全隔离 |
| 路由生命周期 | `render()` → `init()` → `destroy()`，切换工具时先 destroy 旧模块防止泄漏 |
| 防重注册 | `preload.js` 的 `onNewRecord` 先 `removeAllListeners` 再注册 |
| 脏标记自动保存 | `_isDirty` 标记 + 1s debounce，避免无意义写入污染 `updated_at` |
| Schema 迁移 | `schema_version` 表追踪版本，`initDB()` 按版本号顺序执行迁移脚本 |
| DB 持久化 | sql.js 内存数据库 + 500ms debounce 写入文件 |
| 安全通信 | `safeHandler` 包装 + 字段/扩展名白名单 + CSP 策略 |

## 许可证

MIT License

## 致谢

本项目在开发过程中使用 AI 辅助编程完成代码编写和调试。
