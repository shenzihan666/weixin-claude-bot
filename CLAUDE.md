# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

weixin-claude-bot 是一个通过微信消息远程操控 Claude Code 的实验教学项目。它使用腾讯 iLink 协议（半公开）连接微信，桥接 Claude Agent SDK，实现从微信发送消息到本地开发环境的 Claude Code 代理。

**核心流程**：
微信用户 → iLink 协议 (HTTP long-poll) → Node.js Bot → Claude Agent SDK (子进程) → 本地文件系统

**技术栈**：
- **运行时**: Node.js 18+ with TypeScript (ESM)
- **微信接入**: iLink 协议（5个 HTTP 端点）
- **AI 引擎**: `@anthropic-ai/claude-agent-sdk` (Claude Agent SDK)
- **状态存储**: 本地文件系统 (`~/.weixin-claude-bot/`)

**设计理念**：
本项目基于 `@tencent-weixin/openclaw-weixin` (3756行) 精简重构，删除了80%的非必要代码（CDN媒体、多账号、语音转码等），专注于**微信消息 ↔ Claude Code 桥接**的核心目标。保留了iLink协议的所有关键细节（`context_token`管理、`client_id`唯一性等），是一个教学导向的极简实现。

## 常用命令

| 命令 | 用途 |
|------|------|
| `npm run login` | 扫码登录微信（生成二维码） |
| `npm run config` | 查看和修改 Bot 配置 |
| `npm start` | 启动 Bot（长轮询消息） |
| `npm run build` | 编译 TypeScript 到 `dist/` 目录 |

**配置示例**：
```bash
# 切换模型
npm run config -- --model claude-sonnet-4-6
npm run config -- --model claude-opus-4-6
npm run config -- --model claude-haiku-4-5-20251001

# 开启多轮对话
npm run config -- --multi-turn true

# 设置权限模式
npm run config -- --permission-mode auto

# 设置工作目录
npm run config -- --cwd ~/Github/my-project

# 设置系统提示
npm run config -- --system-prompt "用简洁的中文回复，不要使用 Markdown 格式"

# 设置超时时间（毫秒）
npm run config -- --timeout 300000  # 5分钟（默认）
npm run config -- --timeout 60000   # 1分钟
npm run config -- --timeout 1800000 # 30分钟
```

**第三方模型提供商支持**：
Bot 支持任意 Claude Code 兼容的模型，包括第三方提供商（如 DeepSeek、OpenRouter 等）。有两种配置方式：

1. **通过环境变量**（传统方式）：
   ```bash
   export ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
   export ANTHROPIC_MODEL=DeepSeek-V3.2
   npm run config -- --model DeepSeek-V3.2
   npm run config -- --permission-mode bypassPermissions  # 推荐第三方模型使用此模式
   npm start
   ```

2. **通过本地 Claude 配置文件**（推荐，无需手动设置环境变量）：
   ```bash
   # 在 ~/.claude/config.json 中添加以下配置：
   {
     "ANTHROPIC_BASE_URL": "https://api.deepseek.com/anthropic",
     "ANTHROPIC_MODEL": "DeepSeek-V3.2"
   }
   # 然后直接启动 Bot
   npm run config -- --model DeepSeek-V3.2
   npm start
   ```

默认情况下，Bot 会自动加载 `~/.claude/config.json` 或 `~/.claude/settings.json` 中的配置（可通过 `--use-local-claude-config false` 禁用）。配置文件中的环境变量字段（如 `ANTHROPIC_BASE_URL`、`ANTHROPIC_API_KEY`）会在启动时自动设置。

**运行 Bot**：
```bash
npm run login    # 首次使用需登录
npm start        # 启动 Bot
```

## 项目架构

### 消息流程
1. **接收消息**: Bot 通过 `ilink/bot/getupdates` 长轮询获取微信消息
2. **缓存状态**: 保存 `context_token`（用于回复）和 `sync_buf`（断点续传游标）
3. **发送输入状态**: 调用 `getconfig` 获取 `typing_ticket`，然后 `sendtyping`
4. **调用 Claude**: 通过 Claude Agent SDK 的 `query()` 启动 Claude Code 子进程
5. **收集响应**: 流式收集 Claude 的文本输出和 `session_id`（多轮对话）
6. **回复微信**: 通过 `ilink/bot/sendmessage` 发送回复，自动分片（≤4000字符）

### 核心模块
- **`src/index.ts`** - 主入口：长轮询循环、消息分发、状态管理
- **`src/login.ts`** - QR 扫码登录流程
- **`src/config.ts`** - 配置管理 CLI
- **`src/store.ts`** - 状态持久化（凭证、游标、token、配置、会话ID）
- **`src/ilink/`** - iLink 协议封装
  - `types.ts` - 协议类型定义
  - `api.ts` - 5个 HTTP API 封装 (`getUpdates`, `sendMessage`, `sendTyping`, `getConfig`)
  - `auth.ts` - QR 登录流程
- **`src/claude/handler.ts`** - Claude Agent SDK 集成 (`askClaude` 函数)

## 目录结构
```
weixin-claude-bot/
├── src/
│   ├── index.ts             # 主入口
│   ├── login.ts             # QR 扫码登录
│   ├── config.ts            # 配置管理 CLI
│   ├── store.ts             # 状态持久化
│   ├── vendor.d.ts          # 第三方类型声明
│   ├── ilink/               # iLink 协议封装
│   │   ├── types.ts
│   │   ├── api.ts
│   │   └── auth.ts
│   └── claude/
│       └── handler.ts       # Claude Agent SDK 集成
├── docs/                    # 教学文档
├── package.json
├── tsconfig.json
└── CLAUDE.md (本文件)
```

## 状态存储

所有数据存储在 `~/.weixin-claude-bot/` 目录：

| 文件 | 内容 |
|------|------|
| `credentials.json` | 微信登录凭证 (`bot_token`, `baseUrl`, `accountId`) |
| `config.json` | Bot 配置（模型、参数、权限模式等） |
| `sync-buf.txt` | 消息游标（断点续传） |
| `context-tokens.json` | 每用户 `context_token` 缓存 |
| `session-ids.json` | 每用户 Claude 会话 ID（多轮对话用） |

删除此目录可完全清除所有数据。

## 开发说明

### TypeScript 配置
- **目标**: ES2022, Node16 模块系统
- **严格模式**: 启用 (`strict: true`)
- **输出目录**: `dist/`（使用 `npm run build` 编译）
- **运行**: 使用 `tsx` 直接执行 TypeScript (`npm start`)

### 依赖项
**运行时**：
- `@anthropic-ai/claude-agent-sdk` - Claude Agent SDK
- `qrcode-terminal` - 终端显示二维码

**开发依赖**：
- `typescript` - TypeScript 编译器
- `tsx` - TypeScript 即时执行
- `@types/node` - Node.js 类型声明

### 构建与运行
```bash
# 安装依赖
npm install

# 编译 TypeScript
npm run build

# 直接运行（无需编译，使用 tsx）
npm start
```

## 配置管理

### 权限模式
Claude Code 提供多种权限模式，Bot 主要使用：

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| **`auto`** | 后台分类器检查每个操作（推荐） | 需要 Team plan + Sonnet/Opus 4.6 |
| **`bypassPermissions`** | 无检查（仅限隔离环境） | 无 Team plan 或测试环境 |
| `acceptEdits` | 自动批准文件编辑，提示命令 | 半自动模式 |
| `plan` | 只读模式，不编辑文件 | 安全审查 |
| `default` | 每个操作都提示（不适合 Bot） | 交互式使用 |
| `dontAsk` | 仅允许预批准工具 | 严格限制 |

**默认配置**: `bypassPermissions`（无 Team plan 时）

### 模型选择

#### Anthropic 官方模型
- **`claude-sonnet-4-6`** - 默认，速度与质量平衡
- **`claude-opus-4-6`** - 最强推理，适合复杂编程任务
- **`claude-haiku-4-5-20251001`** - 最快响应，适合简单对话

#### 第三方模型提供商 (DeepSeek, OpenRouter 等)
Bot 支持任意 Claude Code 兼容的模型，包括第三方提供商：

**方式一：通过环境变量**（传统方式）
1. **设置环境变量**（在启动 Bot 前）：
   ```bash
   export ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
   export ANTHROPIC_MODEL=DeepSeek-V3.2
   ```

2. **配置 Bot 使用该模型**：
   ```bash
   npm run config -- --model DeepSeek-V3.2
   npm run config -- --permission-mode bypassPermissions  # 推荐第三方模型使用此模式
   ```

3. **启动 Bot**：
   ```bash
   npm start
   ```

**方式二：通过本地 Claude 配置文件**（推荐，无需手动设置环境变量）
1. **创建或编辑本地配置文件** `~/.claude/config.json`：
   ```json
   {
     "ANTHROPIC_BASE_URL": "https://api.deepseek.com/anthropic",
     "ANTHROPIC_MODEL": "DeepSeek-V3.2"
   }
   ```

2. **配置 Bot 使用该模型**：
   ```bash
   npm run config -- --model DeepSeek-V3.2
   npm run config -- --permission-mode bypassPermissions  # 推荐第三方模型使用此模式
   ```

3. **启动 Bot**：
   ```bash
   npm start
   ```

默认情况下，Bot 会自动加载 `~/.claude/config.json` 或 `~/.claude/settings.json` 中的配置（可通过 `--use-local-claude-config false` 禁用）。配置文件中的环境变量字段会在启动时自动设置。

#### 模型别名（Claude Code 子进程解析）
- `sonnet` → claude-sonnet-4-6
- `opus` → claude-opus-4-6
- `haiku` → claude-haiku-4-5-20251001
- `opusplan` → 规划用 Opus，执行用 Sonnet（推荐复杂任务）
- `sonnet[1m]` → Sonnet + 100万 token 扩展上下文
- `opus[1m]` → Opus + 100万 token 扩展上下文

### 环境变量自动加载
Bot 支持从本地 Claude 配置文件自动加载环境变量，无需手动设置：

**支持的配置文件**：
- `~/.claude/config.json` (Claude Code 标准格式)
- `~/.claude/settings.json` (旧版格式)

**支持的配置格式**：
1. **Claude Code 标准格式** (推荐)：
   ```json
   {
     "env": {
       "ANTHROPIC_BASE_URL": "https://api.deepseek.com/anthropic",
       "ANTHROPIC_MODEL": "DeepSeek-V3.2"
     }
   }
   ```

2. **扁平格式** (向后兼容)：
   ```json
   {
     "ANTHROPIC_BASE_URL": "https://api.deepseek.com/anthropic",
     "ANTHROPIC_MODEL": "DeepSeek-V3.2"
   }
   ```

**支持的环境变量**：
- `ANTHROPIC_BASE_URL` - API 端点地址
- `ANTHROPIC_API_KEY` - API 密钥
- `ANTHROPIC_MODEL` - 默认模型
- `ANTHROPIC_DEFAULT_MODEL` - 默认模型别名
- `CLAUDE_CWD` - 工作目录
- `OPENAI_BASE_URL` - OpenAI 兼容 API 端点
- `OPENAI_API_KEY` - OpenAI 兼容 API 密钥

**智能合并策略**：
- 仅在环境变量未在系统环境中设置时才从配置文件加载
- 避免覆盖用户显式设置的环境变量
- 支持 `useLocalClaudeConfig` 开关（默认开启）

### 超时保护配置
Bot 内置全面的超时保护机制，防止 Claude Code 子进程卡死：

**默认配置**：
- 默认超时：**300000ms (5分钟)**
- 可配置范围：任意正整数（毫秒）

**配置方式**：
```bash
# 查看当前超时设置
npm run config

# 设置超时时间
npm run config -- --timeout 60000    # 1分钟
npm run config -- --timeout 300000   # 5分钟（默认）
npm run config -- --timeout 1800000  # 30分钟

# 也可以从本地配置加载
# 在 ~/.claude/config.json 中添加：
# {"timeoutMs": 60000}
```

**超时行为**：
1. **请求级超时**：每个 Claude Code 请求独立计时
2. **自动中止**：超时后自动中止进程，清理资源
3. **继续运行**：Bot 在超时后恢复，继续处理后续消息
4. **友好提示**：用户收到"请求超时"提示，而非无响应

**从本地配置加载超时设置**：
支持从本地 Claude 配置文件加载超时设置，支持多种字段名：
- `timeoutMs` (推荐)
- `timeout`
- `defaultTimeoutMs`
- `timeout_ms`

## 注意事项

1. **iLink 协议是实验性的** - 腾讯未正式公开文档，API 可能随时变更，不建议用于生产环境
2. **Token 会过期** - 出现 session 过期提示时重新运行 `npm run login`
3. **多轮对话** - 默认关闭，可通过 `--multi-turn true` 开启。用户发送"新对话"、"/reset"、"/clear" 可重置会话
4. **消息去重** - 每条回复必须包含唯一的 `client_id`，格式：`wcb-{timestamp}-{random_hex}`
5. **`from_user_id` 留空** - iLink 服务端会自动填充，客户端填写可能导致后续消息失败
6. **文件权限** - `credentials.json` 保存时自动设置为 `0o600`（仅用户可读写）

## 故障排除

- **Claude Code 进程异常退出**: 检查 `permissionMode` 是否支持当前计划，或模型是否可用
- **连续消息失败**: 检查网络连接，确认 `bot_token` 未过期
- **回复未送达**: 确认 `context_token` 有效且未过期，检查 `client_id` 唯一性
- **权限问题**: `auto` 模式需要 Team plan + Sonnet/Opus 4.6，否则切换至 `bypassPermissions`

## 教学文档

详细的技术解析和教学材料在 `docs/` 目录中：
- `00-overview.md` - 文档总览
- `01-ilink-protocol.md` - iLink 协议解析
- `02-architecture.md` - 架构设计与决策
- `03-qr-login.md` - QR 登录流程
- `04-claude-code-sdk.md` - Claude Agent SDK 详解
- `05-pitfalls.md` - 踩坑记录
- `06-usage-guide.md` - 使用指南
- `07-openclaw-analysis.md` - OpenClaw 源码分析
- `08-permission-modes.md` - 权限模式详解
- `09-agent-sdk-deep-dive.md` - Agent SDK 深度科普