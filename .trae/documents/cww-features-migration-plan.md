# ClawWin2.0 -> ClawX 功能移植方案

## Context

将 ClawWin2.0 的鲁南千易后端集成功能移植到 ClawX。所有后端 API 调用通过 Main 进程 host-api 代理（AGENTS.md 约束），不使用渲染进程直接 fetch。环境变量分多个独立配置，完全替换 electron-updater，只移植扫码登录（不做 CWW 邮箱/支付体系）。

**代码规范**：所有代码需中文注释，结构清晰，不堆屎山。

## 新增 .env 变量

| 变量名 | 用途 | 示例 |
|--------|------|------|
| `VITE_CWW_API_BASE_URL` | 认证/遥测/欢迎页/模型配置 API | `https://lnqy.example.com/api/v1` |
| `VITE_CWW_UPDATE_SERVER_URL` | 版本检查/下载 API | `https://lnqy.example.com/api/v1` |
| `VITE_CWW_SKILL_STORE_URL` | SkillHub 技能商城 API | `https://lnqy.example.com` |

修改文件：`.env.example`、`electron/utils/config.ts`

---

## 9 个功能实施计划

### Feature 1: 扫码登录

**后端 API**: `GET /auth/qr-code`、`GET /auth/qr-code/{key}`、`GET /auth/me`

| 操作 | 文件 |
|------|------|
| 新建 | `electron/services/cww-auth-api.ts` — host-api 模块，代理三个认证接口 |
| 新建 | `src/stores/cww-auth.ts` — Zustand store（登录态、用户信息、modelConfig） |
| 新建 | `src/components/cww/QRCodeLogin.tsx` — 扫码登录 UI |
| 新建 | `src/components/cww/LoginStatusBadge.tsx` — 用户头像/昵称 |
| 修改 | `shared/host-api/contract.ts` — 新增 cwwAuth 类型 |
| 修改 | `src/lib/host-api.ts` — 新增 cwwAuth 模块 |
| 修改 | `electron/utils/secure-storage.ts` — 存 cww:accessToken |
| 修改 | `electron/main/ipc-handlers.ts` — 注册 cwwAuth |
| 新建 | `shared/i18n/locales/{en,zh,ja,ru}/cww.json` |

Token 存 OS keychain，用户信息存 electron-store。轮询用 setTimeout 链式（非 setInterval）。

### Feature 2: 设置向导工作区步骤

在 Setup Wizard 的 WELCOME 和 RUNTIME 之间插入 WORKSPACE 步骤。

| 操作 | 文件 |
|------|------|
| 修改 | `src/pages/Setup/index.tsx` — 新增 WORKSPACE step |
| 修改 | `shared/i18n/locales/{en,zh,ja,ru}/setup.json` — workspace 相关键 |

使用 `hostApi.dialog.open()` 选文件夹，路径写入 `openclaw.json` 的 `agents.defaults.workspace`。

### Feature 3: 增量/完整包更新（替换 electron-updater）

**后端 API**: `GET {UPDATE_SERVER_URL}/app/version/check?current_version=X`

| 操作 | 文件 |
|------|------|
| 新建 | `electron/services/cww-update-service.ts` — 版本检查 + 下载 + 安装 |
| 修改 | `electron/services/updates-api.ts` — 适配新 service |
| 替换 | `electron/main/updater.ts` — 移除 electron-updater |
| 修改 | `electron/main/index.ts` — 初始化新 service |
| 修改 | `src/stores/update.ts` — 新增 forceUpdate 状态 |
| 修改 | `shared/host-api/contract.ts` — UpdateStatusSnapshot 增加 force-update/lite/full |

关键逻辑：must_version > 当前 → 强制完整包；version_code > 当前 → 增量包。支持断点续传、下载取消。

### Feature 4: 模型凭证从 API 拉取注入 Gateway

登录成功后 `/auth/me` 返回 `model_config`（含 api_key/base_url/model_id）。

**凭证存储位置**（非 openclaw.json，而是 agent 目录）：
- `~/.openclaw/agents/<agentId>/agent/openclaw-agent.sqlite` — 主存储（auth_profile_store 表）
- `~/.openclaw/agents/<agentId>/agent/auth-profiles.json` — 兼容格式
- `~/.openclaw/agents/<agentId>/agent/models.json` — 自定义 provider 的 apiKey

| 操作 | 文件 |
|------|------|
| 新建 | `electron/utils/cww-model-config.ts` — modelConfig → auth-profiles 映射 + 内存缓存 |
| 修改 | `electron/gateway/config-sync.ts` — forkEnv 注入 CWW 模型环境变量 |
| 修改 | `electron/services/providers/provider-runtime-sync.ts` — 复用 syncAllProviderAuthToRuntime 将 CWW 下发的 key 同步到所有 agent 目录 |

优先级：用户手动 API Key > CWW model_config > 无配置。API Key 通过 `saveProviderKeyToOpenClaw()` 写入 agent 目录的 auth-profiles（SQLite + JSON），不写 openclaw.json。

### Feature 5: 阿里云 OpenSearch 插件

**不手动复制**，在 ClawX 项目中建立 `custom-plugins/extensions/` 目录结构，后续用脚本一键同步。

| 操作 | 文件 |
|------|------|
| 新建 | `custom-plugins/extensions/` 目录（类似 ClawWin2.0 结构） |
| 新建 | `scripts/sync-custom-extensions.mjs` — 从 ClawWin2.0 同步插本的脚本（参考 ClawWin2.0 已有的同名脚本） |
| 修改 | `electron/gateway/config-sync.ts` — forkEnv 注入 CLAWWIN_SERVER_URL + ACCESS_TOKEN |
| 修改 | `package.json` — 新增 `sync:extensions` script |

插件自身的 `credential-resolver.ts` 从环境变量读 ACCESS_TOKEN 和后端 URL，Gateway 启动时通过 forkEnv 注入。

### Feature 6: 遥测上报

**与 ClawWin2.0 逻辑一致**：在用户发送消息、模型返回时埋点，带关联 key（idempotency_key → run_id 映射）。

| 操作 | 文件 |
|------|------|
| 新建 | `electron/services/cww-telemetry-api.ts` — host-api 模块，POST `/app/telemetry/events` |
| 修改 | `src/lib/host-api.ts` — 新增 cwwTelemetry 模块 |
| 修改 | `shared/host-api/contract.ts` — 新增 CwwTelemetryEventPayload 类型 |
| 修改 | `src/stores/chat.ts`（或对应的消息发送/接收 hook）— 在 send/ack/rendered/abort 节点调用 hostApi.cwwTelemetry.sendEvent() |

**事件类型**（与 ClawWin2.0 一致）：
- `user_message_sent` — 用户发送消息时（含附件元信息）
- `chat_send_ack` — Gateway 返回 ack 时（建立 idempotency_key → run_id 映射）
- `assistant_message_rendered` — 助手消息渲染完成时
- `chat_abort_requested` / `chat_abort_result` — 中断请求/结果
- `stream_idle_fallback_triggered` — 流式超时兜底

800ms 超时，fire-and-forget，失败仅日志。保留现有 PostHog 不动。

### Feature 7: 欢迎页模板从 API 获取

**不是单独页面**，是新建会话时输入框上方的卡片区域。

**后端 API**: `GET /welcome` → Tab + Card 结构

| 操作 | 文件 |
|------|------|
| 新建 | `electron/services/cww-welcome-api.ts` — host-api 模块（含 15min 内存缓存） |
| 新建 | `src/stores/cww-welcome.ts` — Zustand store |
| 修改 | `src/pages/Chat/index.tsx` — WelcomeScreen 区域改为渲染 API 返回的 Tab + Card |
| 修改 | `shared/host-api/contract.ts` — 新增 cwwWelcome 类型 |
| 修改 | `src/lib/host-api.ts` — 新增 cwwWelcome 模块 |

Card 的 `prompt` 字段点击时填入输入框。API 不可用时 fallback 到现有默认欢迎语。

### Feature 8: 桌面悬浮小部件

独立透明窗口（300x400），置顶、鼠标穿透、浮球拖拽。

| 操作 | 文件 |
|------|------|
| 新建 | `electron/main/widget-window.ts` — BrowserWindow 管理 |
| 新建 | `electron/services/widget-api.ts` — host-api 模块 |
| 新建 | `src/pages/Widget/index.tsx` — Widget 页面（独立路由） |
| 修改 | `src/App.tsx` — 新增 /widget 路由 |
| 修改 | `electron/main/index.ts` — 集成 widget window |
| 修改 | `shared/host-api/contract.ts` — widget 类型 |
| 修改 | `src/lib/host-api.ts` — 新增 widget 模块 |

### Feature 9: SkillHub 替换 ClawHub

**后端 API**: `GET {SKILL_STORE_URL}/api/web/skills`、`GET .../download`

| 操作 | 文件 |
|------|------|
| 新建 | `electron/gateway/cww-skillhub.ts` — 实现 MarketplaceProvider 接口 |
| 新建 | `electron/extensions/builtin/cww-skillhub-marketplace.ts` — 替换 clawhub-marketplace |
| 修改 | `electron/extensions/builtin/index.ts` — 注册新扩展 |
| 修改 | `electron/services/skills-api.ts` — clawhub* 方法委托给 CwwSkillHub |
| 修改 | `src/pages/Skills/index.tsx` — Store tab 调用新 API |
| 修改 | `shared/host-api/contract.ts` — 新增 cwwSkillHub 类型 |

---

## 实施顺序

```
Phase 1: 基础设施
  ├─ .env 变量 + config.ts
  ├─ host-api contract 类型框架
  └─ secure-storage 扩展

Phase 2: 认证
  ├─ Feature 1: QR Code Login
  └─ Feature 2: Workspace in Setup Wizard

Phase 3: 依赖认证
  ├─ Feature 3: Update System
  ├─ Feature 4: Model Credential Injection
  └─ Feature 6: Telemetry

Phase 4: 内容与生态
  ├─ Feature 7: Welcome Templates
  ├─ Feature 9: SkillHub
  └─ Feature 5: OpenSearch Plugin (目录结构 + 脚本)

Phase 5: 独立大功能
  └─ Feature 8: Desktop Widget
```

## 关键风险

1. **API 代理约束**：所有后端调用必须走 host-api，不能像 ClawWin2.0 那样渲染进程直接 fetch
2. **模型凭证注入路径**：通过 `saveProviderKeyToOpenClaw()` 写入 agent 目录的 auth-profiles（SQLite + JSON），而非 openclaw.json
3. **electron-updater 移除**：需确保打包流程（electron-builder.yml publish）不受影响
4. **Widget 生命周期**：不阻止应用退出，与 close-to-tray 行为协调

## 验证方式

每个 Feature 完成后：
1. `pnpm run typecheck` — 类型检查通过
2. `pnpm run lint` — ESLint 通过
3. `pnpm dev` — 手动验证功能
4. 新增 E2E spec 覆盖核心流程
