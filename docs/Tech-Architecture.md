# ToolBox — 技术架构文档

> 版本: v1.0  
> 日期: 2026-05-17

---

## 1. 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 桌面壳 | Electron 33+ | 提供原生能力（剪贴板、文件系统、系统通知） |
| 渲染层 | HTML5 + CSS3 + Vanilla JS | 无框架依赖，保持轻量 |
| 富文本 | Quill.js 2.x | 日记本编辑器 |
| 数据库 | better-sqlite3 | 同步 SQLite，无需异步 |
| 图片存储 | 本地文件系统 | `./data/images/` 目录 |
| 打包 | electron-builder | 生成绿色便携版 |
| 版本控制 | Git | 版本回溯 |

---

## 2. 架构分层

```
┌─────────────────────────────────────┐
│           Electron 主进程             │
│  main.js                            │
│  ├── 窗口管理                        │
│  ├── 剪贴板监听 (clipboard-watcher)  │
│  ├── 数据库服务 (db-service)         │
│  └── 文件服务 (file-service)         │
├─────────────────────────────────────┤
│           IPC 通信层                  │
│  preload.js (contextBridge)         │
├─────────────────────────────────────┤
│           渲染进程                    │
│  index.html                         │
│  ├── 主题系统 (theme.js)             │
│  ├── 路由系统 (router.js)            │
│  ├── 导航组件 (sidebar.js)           │
│  ├── 番茄钟 (tools/pomodoro/)       │
│  ├── 剪贴板 (tools/clipboard/)      │
│  ├── 日程任务 (tools/schedule/)     │
│  └── 日记本 (tools/diary/)          │
└─────────────────────────────────────┘
```

---

## 3. 模块划分与边界

### 3.1 主进程模块

| 模块 | 文件 | 职责 | 对外接口 |
|------|------|------|---------|
| 窗口管理 | `main/window.js` | 创建/管理 BrowserWindow | `createWindow()` |
| 剪贴板监听 | `main/clipboard-watcher.js` | 监听系统剪贴板变化 | `start()`, `stop()`, `on('text')`, `on('image')` |
| 数据库服务 | `main/db-service.js` | SQLite CRUD 操作 | `init()`, 各表操作方法 |
| 文件服务 | `main/file-service.js` | 图片读写、导出 | `saveImage()`, `readImage()` |

### 3.2 渲染进程模块

| 模块 | 目录 | 职责 | 依赖 |
|------|------|------|------|
| 主题系统 | `renderer/theme.js` | CSS 变量注入、主题切换 | 无 |
| 路由系统 | `renderer/router.js` | 工具切换、内容区渲染 | `sidebar.js` |
| 侧边导航 | `renderer/sidebar.js` | 图标渲染、选中态管理 | `router.js` |
| 番茄钟 | `renderer/tools/pomodoro/` | 计时器逻辑 + UI | `router.js` |
| 剪贴板 | `renderer/tools/clipboard/` | 记录展示 + 交互 | `router.js`, IPC |
| 日程任务 | `renderer/tools/schedule/` | 日历 + 任务列表 + 弹窗 | `router.js`, IPC |
| 日记本 | `renderer/tools/diary/` | 富文本编辑 + 日期列表 | `router.js`, IPC, Quill.js |

### 3.3 模块通信规则

- 渲染进程 → 主进程：`window.api.xxx()` (通过 preload contextBridge)
- 主进程 → 渲染进程：`webContents.send(channel, data)`
- 模块间：通过事件总线 `EventTarget`，不直接引用

**严格边界**：
- 工具模块之间不允许直接引用
- 所有跨模块数据通过数据库或事件总线传递
- 新增工具只需：在 `renderer/tools/` 下新建目录 + 在 `sidebar.js` 注册图标

---

## 4. 数据模型

### 4.1 剪贴板记录表 `clipboard_records`

```sql
CREATE TABLE clipboard_records (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT NOT NULL CHECK(type IN ('text', 'image')),
  content     TEXT NOT NULL,          -- 文字内容或图片文件名
  created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  pinned      INTEGER DEFAULT 0       -- 0=普通, 1=置顶
);
```

### 4.2 任务表 `tasks`

```sql
CREATE TABLE tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  repeat_type TEXT NOT NULL CHECK(repeat_type IN ('once', 'days', 'weekdays', 'daily')),
  repeat_meta TEXT DEFAULT NULL,      -- JSON: days模式={"count":3}, weekdays模式={"days":[1,3,5]}
  start_date  TEXT NOT NULL,          -- ISO date
  end_date    TEXT,                   -- NULL=无限循环
  time_start  TEXT,                   -- HH:mm 或 NULL
  time_end    TEXT,                   -- HH:mm 或 NULL
  completed   INTEGER DEFAULT 0,      -- 0=未完成, 1=已完成
  created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
```

### 4.3 任务完成记录表 `task_completions`

```sql
CREATE TABLE task_completions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  completed_date TEXT NOT NULL,       -- ISO date
  completed_at   TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE(task_id, completed_date)
);
```

### 4.4 日记表 `diaries`

```sql
CREATE TABLE diaries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  date        TEXT NOT NULL UNIQUE,   -- ISO date, 一天一篇
  content     TEXT NOT NULL,          -- HTML 富文本内容
  updated_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
```

### 4.5 番茄钟记录表 `pomodoro_records`

```sql
CREATE TABLE pomodoro_records (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  duration    INTEGER NOT NULL,       -- 实际时长(秒)
  type        TEXT NOT NULL CHECK(type IN ('work', 'break')),
  completed_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
```

### 4.6 设置表 `settings`

```sql
CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL
);
```

---

## 5. IPC 通信协议

### 5.1 剪贴板相关

| 频道 | 方向 | 参数 | 返回 |
|------|------|------|------|
| `clipboard:start` | R→M | - | - |
| `clipboard:stop` | R→M | - | - |
| `clipboard:get-all` | R→M | - | `Array<Record>` |
| `clipboard:delete` | R→M | `{ id }` | `{ success }` |
| `clipboard:clear` | R→M | - | `{ success }` |
| `clipboard:new-record` | M→R | `Record` | - |

### 5.2 任务相关

| 频道 | 方向 | 参数 | 返回 |
|------|------|------|------|
| `task:create` | R→M | `Task` | `{ id }` |
| `task:update` | R→M | `{ id, ...fields }` | `{ success }` |
| `task:delete` | R→M | `{ id }` | `{ success }` |
| `task:get-by-date` | R→M | `{ date }` | `Array<Task>` |
| `task:toggle-complete` | R→M | `{ id, date }` | `{ success }` |

### 5.3 日记相关

| 频道 | 方向 | 参数 | 返回 |
|------|------|------|------|
| `diary:get` | R→M | `{ date }` | `Diary \| null` |
| `diary:save` | R→M | `{ date, content }` | `{ success }` |
| `diary:get-list` | R→M | `{ month }` | `Array<{ date }>` |
| `diary:upload-image` | R→M | `{ data, ext }` | `{ filename }` |

### 5.4 番茄钟相关

| 频道 | 方向 | 参数 | 返回 |
|------|------|------|------|
| `pomodoro:save-record` | R→M | `{ duration, type }` | `{ id }` |
| `pomodoro:get-today` | R→M | - | `{ count }` |

### 5.5 设置相关

| 频道 | 方向 | 参数 | 返回 |
|------|------|------|------|
| `settings:get` | R→M | `{ key }` | `value` |
| `settings:set` | R→M | `{ key, value }` | `{ success }` |

---

## 6. 存储方案

```
ToolBox/
├── data/                    ← 数据目录（随程序走）
│   ├── toolbox.db           ← SQLite 数据库
│   └── images/              ← 图片文件
│       ├── clipboard/       ← 剪贴板图片
│       └── diary/           ← 日记图片
├── src/
│   ├── main/                ← 主进程代码
│   └── renderer/            ← 渲染进程代码
├── docs/                    ← 项目文档
└── package.json
```

- 数据库路径：`app.getPath('userData')` 的便携模式改为 `./data/toolbox.db`
- 图片以 UUID 命名存储，数据库记录文件名
- 便携模式：`process.env.PORTABLE_EXECUTABLE_DIR` 存在时使用程序同目录

---

## 7. 版本回溯机制

### 7.1 Git 策略

- 每个 Phase 完成打 tag：`v0.1.0-phase1`, `v0.2.0-phase2` ...
- 每个 feature 完成提交：`feat: 实现番茄钟核心逻辑`
- bugfix 提交：`fix: 修复剪贴板图片存储路径`
- 重构提交：`refactor: 拆分日历组件`

### 7.2 数据库迁移

- 使用版本号表 `schema_version` 记录当前数据库版本
- 每次表结构变更写迁移脚本 `migrations/v2.sql`
- 启动时自动检测并执行未执行的迁移

---

## 8. 便携版打包配置

```json
{
  "build": {
    "appId": "com.toolbox.app",
    "productName": "ToolBox",
    "directories": {
      "output": "dist"
    },
    "win": {
      "target": "portable",
      "artifactName": "ToolBox-v${version}-Portable.exe"
    },
    "portable": {
      "artifactName": "ToolBox-v${version}-Portable.exe"
    },
    "extraResources": [
      { "from": "data", "to": "data" }
    ]
  }
}
```

- 使用 electron-builder 的 portable target
- 数据文件放在程序同目录的 `data/` 文件夹下
