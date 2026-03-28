# weixin-claude-bot

通过微信消息远程操控 Claude Code —— 基于腾讯 iLink 协议的微信 AI Bot。

```
微信用户 ──► iLink 协议 ──► weixin-claude-bot ──► Claude Agent SDK ──► 本地文件系统
   ◄────────────────────────────────────────────────────────────────────────┘
```

在地铁上用微信让 Claude 帮你改代码、查日志、跑测试。

> **这是一个实验教学项目**，配套视频讲解和完整教学文档。
>
> **视频讲解**：[YouTube](https://youtu.be/-xCZ9KtaC04) | [B站](https://www.bilibili.com/video/BV18rXbBaEK7/)
>
> **教学文档**：[docs/00-overview.md](docs/00-overview.md)（iLink 协议解析、架构设计、Claude Agent SDK 深度科普、踩坑记录等）

## 前置条件

| 依赖 | 最低版本 | 说明 |
|------|---------|------|
| **Node.js** | 18+ | 运行环境 |
| **Claude Code** | 已安装并登录 | SDK 通过子进程调用 Claude Code CLI |
| **Anthropic API Key** | — | Claude Code 登录时已配置 |
| **微信** | 手机端 | 扫码登录用 |

### 安装 Node.js

```bash
# macOS (Homebrew)
brew install node

# 或使用 nvm
nvm install 18
```

### 安装 Claude Code

```bash
npm install -g @anthropic-ai/claude-agent-sdk
claude  # 首次运行会引导登录 Anthropic 账号
```
### 推荐使用 cc switch 配置供应商
https://github.com/farion1231/cc-switch

## 安装

```bash
git clone https://github.com/crazynomad/weixin-claude-bot.git
cd weixin-claude-bot
npm install
```

### 依赖说明

**运行时依赖：**

| 包名 | 用途 |
|------|------|
| `@anthropic-ai/claude-agent-sdk` | Claude Agent SDK，通过子进程调用 Claude Code 的 agentic 能力 |
| `qrcode-terminal` | 在终端显示微信登录二维码 |

**开发依赖：**

| 包名 | 用途 |
|------|------|
| `typescript` | TypeScript 编译器 |
| `tsx` | TypeScript 即时执行（免编译运行 .ts） |
| `@types/node` | Node.js 类型声明 |

## 快速开始

### 1. 扫码登录微信

```bash
npm run login
```

终端会显示二维码，用微信扫码并确认。登录凭证保存在 `~/.weixin-claude-bot/credentials.json`。

### 2. 配置（可选）

```bash
# 查看当前配置
npm run config

# 切换模型（完整 ID）
npm run config -- --model claude-sonnet-4-6       # 默认，速度与质量平衡
npm run config -- --model claude-opus-4-6          # 最强，适合复杂编程任务
npm run config -- --model claude-haiku-4-5-20251001  # 最快，适合简单对话

# 也可以用模型别名
npm run config -- --model sonnet                   # 等同 claude-sonnet-4-6
npm run config -- --model opus                     # 等同 claude-opus-4-6
npm run config -- --model opusplan                 # 规划用 Opus，执行用 Sonnet

# 开启多轮对话（记住上下文）
npm run config -- --multi-turn true
npm run config -- --multi-turn false                    # 关闭（默认）

# 设置权限模式
npm run config -- --permission-mode auto              # 推荐：后台安全检查（需 Team plan）
npm run config -- --permission-mode bypassPermissions  # 无限制（仅限隔离环境）

# 设置 Claude Code 的工作目录
npm run config -- --cwd ~/Github/my-project

# 设置最大 agentic 轮次
npm run config -- --max-turns 20

# 设置单次对话超时保护时间（ms)
npm run config -- --timeout 1800000

# 设置系统提示
npm run config -- --system-prompt "用简洁的中文回复，不要使用 Markdown 格式"

# 启用/禁用本地Claude配置自动加载（默认开启）
npm run config -- --use-local-claude-config true
npm run config -- --use-local-claude-config false

# 第三方模型提供商支持（DeepSeek、OpenRouter等）：
# 方式1：通过本地配置文件（推荐，无需手动设置环境变量）
# 在 ~/.claude/config.json 中添加：
# {"ANTHROPIC_BASE_URL": "https://api.deepseek.com/anthropic", "ANTHROPIC_MODEL": "DeepSeek-V3.2"}
# 然后运行：npm run config -- --model DeepSeek-V3.2
#
# 方式2：通过环境变量（传统方式）
# export ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
# export ANTHROPIC_MODEL=DeepSeek-V3.2
# npm run config -- --model DeepSeek-V3.2
```

配置保存在 `~/.weixin-claude-bot/config.json`。

### 3. 启动 Bot

```bash
npm start
```

```
=== 微信 Claude Bot 已启动 ===
账号: df412faf283b@im.bot
模型: claude-sonnet-4-6
权限模式: auto
多轮对话: 开启
最大轮次: 10
工作目录: /Users/you/Github/my-project
等待消息中...
```

现在在微信上给 Bot 发消息就能收到 Claude 的回复了。`Ctrl+C` 停止。

## 项目结构

```
weixin-claude-bot/
├── src/
│   ├── index.ts             # 主入口：long-poll 循环 + 消息分发
│   ├── login.ts             # QR 扫码登录
│   ├── config.ts            # 配置管理 CLI
│   ├── store.ts             # 状态持久化
│   ├── ilink/
│   │   ├── types.ts         # iLink 协议类型
│   │   ├── api.ts           # 5 个 HTTP API 封装
│   │   └── auth.ts          # QR 登录流程
│   └── claude/
│       └── handler.ts       # Claude Agent SDK 集成
├── docs/                    # 教学文档
│   ├── 00-overview.md       # 文档总览
│   ├── 01-ilink-protocol.md # iLink 协议解析
│   ├── 02-architecture.md   # 架构设计与决策
│   ├── 03-qr-login.md       # QR 登录流程
│   ├── 04-claude-code-sdk.md# Claude Agent SDK 详解
│   ├── 05-pitfalls.md       # 踩坑记录
│   ├── 06-usage-guide.md    # 使用指南
│   └── 07-openclaw-analysis.md # OpenClaw 源码分析
├── package.json
└── tsconfig.json
```

## 本地数据

所有数据存储在 `~/.weixin-claude-bot/`，不会上传到任何服务器：

| 文件 | 内容 |
|------|------|
| `credentials.json` | 微信登录凭证（bot_token） |
| `config.json` | Bot 配置（模型、参数） |
| `sync-buf.txt` | 消息游标（断点续传） |
| `context-tokens.json` | 会话令牌（per-user） |
| `session-ids.json` | Claude 会话 ID（多轮对话用） |

删除该目录即可完全清除所有数据。

## 注意事项

- **iLink 协议是实验性的** — 腾讯未正式公开文档，API 可能随时变更，不建议用于生产环境
- **权限模式** — 默认使用 `auto` 模式，后台分类器会检查危险操作（需 Team plan + Sonnet/Opus 4.6）。不满足条件时可切换到 `bypassPermissions`，但需注意安全
- **Token 会过期** — 出现 session 过期提示时重新运行 `npm run login`
- **超时保护** — Bot 内置 5 分钟默认超时保护，防止 Claude Code 进程卡死。可通过 `--timeout` 参数调整
- **第三方模型支持** — 支持 DeepSeek、OpenRouter 等第三方模型提供商，可通过本地 Claude 配置文件自动加载环境变量，无需手动设置

## 背景

本项目基于对 `@tencent-weixin/openclaw-weixin` npm 包（MIT License）的源码分析构建。该包实现了 iLink Bot 协议，让第三方开发者能通过标准 HTTP 与微信交互。

详细的协议分析和构建过程记录在 [docs/](docs/00-overview.md) 目录中。

## 项目对比

本项目是从 `@tencent-weixin/openclaw-weixin` (3756行) 精简重构的教学版本，保留了iLink协议的核心逻辑，删除了80%的非必要代码：

| 对比维度 | 原项目 (`openclaw-weixin`) | 本项目 (`weixin-claude-bot`) |
|---------|---------------------------|----------------------------|
| **代码规模** | 33个文件，3756行 | 7个文件，550行 |
| **架构** | OpenClaw框架插件 | 独立Node.js应用 |
| **功能** | 完整iLink协议（CDN媒体、多账号、语音转码等） | 核心文本消息 + Claude Code桥接 |
| **设计目标** | 生产环境完整功能 | 教学演示 + 最小可用产品 |
| **学习曲线** | 高（需理解框架） | 低（直接阅读核心逻辑） |

**精简设计理念**：
- 🗑️ **直接删除不需要的功能**：CDN媒体、多账号管理、SILK语音转码等
- 🔗 **保留关键协议细节**：`context_token`管理、`client_id`唯一性、`from_user_id`必须为空
- 🎯 **专注核心目标**：微信消息 ↔ Claude Code 桥接，不做通用微信客户端

详细的技术对比分析见 [docs/10-comparison-analysis.md](docs/10-comparison-analysis.md)。

## License

MIT
