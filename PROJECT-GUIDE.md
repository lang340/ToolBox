# ToolBox 项目概览

> 本文件供 AI 助手快速了解项目全貌，避免每次修改都重新读取全部代码。

## 项目简介

Windows 桌面工具箱应用，绿色便携版（双击运行）。基于 Electron 31 + sql.js（纯 JS SQLite）+ Vanilla JS 构建。卡其色主题，线条风格 SVG 图标，左侧导航栏。

## 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 桌面壳 | Electron 31 | 窗口管理、剪贴板监听、文件系统、系统通知 |
| 数据库 | sql.js (纯 JS SQLite) | 避免 better-sqlite3 需要 C++ 编译的问题 |
| 渲染层 | Vanilla JS (TB 命名空间) | 无框架，模块挂在 `window.TB` 上 |
| 通信 | contextBridge / preload.js | IPC 安全通信，`window.api` 5 个命名空间 |
| 样式 | CSS 自定义属性 | 10 级卡其色色阶 (--khaki-50 ~ --khaki-900) |

## 文件结构

```
L:/gjx/ToolBox/
├── package.json              # 依赖和启动脚本
├── preload.js                # contextBridge，暴露 window.api
├── data/                     # 运行时数据（自动创建）
│   ├── toolbox.db            # SQLite 数据库文件
│   └── images/               # 图片存储
│       ├── clipboard/        # 剪贴板图片
│       └── diary/            # 记事本/日记图片（历史兼容）
├── docs/                     # 项目文档
│   ├── PRD.md
│   ├── UI-Design.md
│   ├── Tech-Architecture.md
│   └── Execution-Plan.md
└── src/
    ├── main/                 # 主进程
    │   ├── index.js          # 入口：窗口创建、所有 IPC handlers、剪贴板监听
    │   ├── db-service.js     # sql.js 封装：initDB/query/run/schema 迁移
    │   └── file-service.js   # 图片存储：saveImage/deleteImage/getImagePath
    └── renderer/             # 渲染进程
        ├── index.html        # 单页 HTML，CSP 策略
        ├── styles/
        │   ├── theme.css     # CSS 变量：色阶、语义色、布局 token
        │   ├── base.css      # 重置、按钮(.btn-primary/secondary/text)、.card/.modal/.toggle、滚动条
        │   └── sidebar.css   # 56px 左侧导航栏
        └── js/
            ├── app.js        # 初始化 Router + Sidebar，默认导航到番茄钟
            ├── router.js     # 简单路由：register/navigate，render→init→destroy 生命周期
            ├── sidebar.js    # 4 个 SVG 图标，点击切换工具
            └── tools/
                ├── pomodoro.js    # 番茄钟：SVG 环形进度、自定义时间、AudioContext 提示音
                ├── clipboard.js   # 剪贴板记录：开关监听、文字/图片、搜索、删除
                ├── schedule.js    # 日程&任务：月历网格、4 种重复规则、勾选完成
                └── notebook.js    # 记事本：多条笔记、富文本编辑器、增删改查
```

## 数据库 Schema（v2）

| 表 | 字段 | 说明 |
|---|---|---|
| `clipboard_records` | id, type(text/image), content, created_at, pinned | 剪贴板记录 |
| `tasks` | id, title, repeat_type, repeat_meta, start_date, end_date, time_start, time_end, completed, created_at | 任务定义 |
| `task_completions` | id, task_id(FK), completed_date, completed_at | 任务完成记录（UNIQUE(task_id, date)） |
| `notes` | id, title, content, created_at, updated_at | 记事本（v2 新增，替代 diaries） |
| `diaries` | id, date(UNIQUE), content, updated_at | 旧日记本表（保留兼容） |
| `pomodoro_records` | id, duration, type(work/break), completed_at | 番茄钟记录 |
| `settings` | key(PK), value | 键值设置 |
| `schema_version` | version(PK) | 迁移版本控制 |

**重复规则**：`once`（当天有效）、`days`（有效N天，meta={count}）、`weekdays`（指定周几，meta={days:[1-7]}）、`daily`（每天循环）

## IPC 通信协议

`preload.js` 通过 `contextBridge` 暴露 `window.api`：

| 命名空间 | 方法 | 对应 IPC channel |
|---|---|---|
| `settings` | get(key), set(key, value) | settings:get/set |
| `app` | getDataDir() | app:get-data-dir |
| `clipboard` | start(), stop(), getAll(), delete(id), clear(), onNewRecord(cb) | clipboard:* |
| `task` | create(task), update(id, fields), delete(id), getByDate(date), getByMonth(y,m), toggleComplete(id, date) | task:* |
| `note` | create(title), get(id), getAll(), update(id, fields), delete(id), uploadImage(data, ext) | note:* |
| `pomodoro` | saveRecord(duration, type), getToday() | pomodoro:* |

**安全模式**：
- `safeHandler(fn)` 包裹所有 ipcMain.handle，防止未捕获异常
- `ALLOWED_TASK_FIELDS` / `ALLOWED_IMAGE_EXTS` 白名单防 SQL 注入和文件扩展名注入
- CSP: `default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:`

## 关键设计模式

1. **TB 命名空间**：所有渲染层模块挂在 `window.TB`，如 `TB.Pomodoro`、`TB.Router`
2. **路由生命周期**：`render()` → `init()` → `destroy()`，切换工具时先 destroy 旧模块
3. **防重注册**：`preload.js` 的 `onNewRecord` 先 `removeAllListeners` 再注册，防止切换页面后监听器泄漏
4. **自动保存**：记事本用 1s debounce 的 `_triggerAutoSave()`，`_isLoading` 标志防止加载时触发保存
5. **DB 持久化**：sql.js 内存数据库 + 500ms debounce 写入文件（`scheduleSave()`）
6. **Schema 迁移**：`schema_version` 表追踪版本，`initDB()` 按版本号顺序执行迁移脚本
7. **图片存储**：UUID 文件名，按 category（clipboard/diary）分目录，扩展名白名单校验

## 历史踩坑记录

| 问题 | 原因 | 解决 |
|---|---|---|
| better-sqlite3 编译失败 | 无 VS C++ build tools | 改用 sql.js |
| Electron 启动报 app undefined | 系统 `ELECTRON_RUN_AS_NODE=1` | cross-env + unset |
| 剪贴板复制一次出现 6 条 | `ipcRenderer.on` 累积注册 | `removeAllListeners` 先清理 |
| 剪贴板删除按钮堆叠 | 文本卡片缺 `position:relative` | 补上定位 |
| number input 箭头挡数字 | 浏览器默认 spinner | CSS `-webkit-appearance: none` |
| 日记一天只能一条 | `diaries` 表 date UNIQUE | 改为 `notes` 表，无 UNIQUE 约束 |
| SQL 注入风险 | 动态拼接字段名 | `ALLOWED_TASK_FIELDS` 白名单 |
| Date 时区偏移 | `new Date('YYYY-MM-DD')` UTC 解析 | 追加 `T00:00:00` |
| AudioContext 泄漏 | 每次完成新建实例 | 复用单例 + state 检查 |

## 启动方式

```bash
cd L:/gjx/ToolBox
# 确保 ELECTRON_RUN_AS_NODE 未设置
npx cross-env ELECTRON_RUN_AS_NODE= electron .
```

## Git 标签

- `v0.1.0-skeleton` — 骨架搭建
- `v0.5.0-all-tools` — 四个工具全部完成
- `v1.0.0-release` — P0-P3 修复完成
