/**
 * Simple file-based persistence for bot credentials and state.
 * Stores in ~/.weixin-claude-bot/
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const STATE_DIR = path.join(os.homedir(), ".weixin-claude-bot");

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

// --- Credentials ---

export type Credentials = {
  botToken: string;
  accountId: string;
  baseUrl: string;
  userId?: string;
  savedAt: string;
};

function credentialsPath(): string {
  return path.join(STATE_DIR, "credentials.json");
}

export function saveCredentials(creds: Omit<Credentials, "savedAt">): void {
  ensureDir(STATE_DIR);
  const data: Credentials = { ...creds, savedAt: new Date().toISOString() };
  fs.writeFileSync(credentialsPath(), JSON.stringify(data, null, 2));
  fs.chmodSync(credentialsPath(), 0o600);
  console.log(`凭证已保存到 ${credentialsPath()}`);
}

export function loadCredentials(): Credentials | null {
  try {
    const raw = fs.readFileSync(credentialsPath(), "utf-8");
    return JSON.parse(raw) as Credentials;
  } catch {
    return null;
  }
}

// --- Sync buffer (getUpdates cursor) ---

function syncBufPath(): string {
  return path.join(STATE_DIR, "sync-buf.txt");
}

export function loadSyncBuf(): string {
  try {
    return fs.readFileSync(syncBufPath(), "utf-8");
  } catch {
    return "";
  }
}

export function saveSyncBuf(buf: string): void {
  ensureDir(STATE_DIR);
  fs.writeFileSync(syncBufPath(), buf);
}

// --- Context tokens (per-user) ---

function contextTokensPath(): string {
  return path.join(STATE_DIR, "context-tokens.json");
}

let tokenCache: Record<string, string> = {};

export function loadContextTokens(): void {
  try {
    const raw = fs.readFileSync(contextTokensPath(), "utf-8");
    tokenCache = JSON.parse(raw) as Record<string, string>;
  } catch {
    tokenCache = {};
  }
}

export function getContextToken(userId: string): string | undefined {
  return tokenCache[userId];
}

export function setContextToken(userId: string, token: string): void {
  tokenCache[userId] = token;
  ensureDir(STATE_DIR);
  fs.writeFileSync(contextTokensPath(), JSON.stringify(tokenCache));
}

// --- Local Claude config ---

export interface LocalClaudeConfig {
  /** Default model for Claude Code */
  defaultModel?: string;
  /** Default permission mode */
  permissionMode?: string;
  /** Default working directory */
  cwd?: string;
  /** Other Claude Code settings */
  [key: string]: unknown;
}

/**
 * Load local Claude Code configuration from ~/.claude/
 * Tries config.json first, then settings.json
 * Returns {config, sourcePath} or null if file doesn't exist or is invalid
 */
export function loadLocalClaudeConfig(): {config: LocalClaudeConfig; sourcePath: string} | null {
  const configPaths = [
    path.join(os.homedir(), ".claude", "config.json"),
    path.join(os.homedir(), ".claude", "settings.json"),
  ];

  for (const configPath of configPaths) {
    try {
      const raw = fs.readFileSync(configPath, "utf-8");
      const config = JSON.parse(raw) as LocalClaudeConfig;
      return {config, sourcePath: configPath};
    } catch {
      continue;
    }
  }
  return null;
}

// --- Bot config ---

/**
 * Permission modes for Claude Code:
 * - "auto"              — Background classifier checks each action (recommended for Bot)
 * - "bypassPermissions" — No checks at all (only for isolated environments)
 * - "acceptEdits"       — Auto-approve file edits, prompt for commands
 * - "plan"              — Read-only, no edits
 * - "default"           — Prompt for everything (not suitable for Bot)
 * - "dontAsk"           — Only pre-approved tools allowed
 *
 * Note: "auto" requires Team plan + Sonnet 4.6 or Opus 4.6
 */
export type PermissionMode = "auto" | "bypassPermissions" | "acceptEdits" | "plan" | "default" | "dontAsk";

export type BotConfig = {
  /** Claude model to use (e.g. "claude-sonnet-4-6", "claude-opus-4-6") */
  model?: string;
  /** Max agentic turns per message */
  maxTurns?: number;
  /** System prompt prepended to every conversation */
  systemPrompt?: string;
  /** Working directory for Claude Code */
  cwd?: string;
  /** Permission mode for Claude Code tool execution */
  permissionMode?: PermissionMode;
  /** Enable multi-turn conversation (resume previous session per user) */
  multiTurn?: boolean;
  /** Use local Claude Code configuration from ~/.claude/config.json */
  useLocalClaudeConfig?: boolean;
  /** Timeout in milliseconds for Claude Code responses (default: 300000 = 5 minutes) */
  timeoutMs?: number;
  /** Reconnect interval in milliseconds to prevent connection stale (default: 60000 = 1 minute) */
  reconnectIntervalMs?: number;
};

const DEFAULT_CONFIG: Required<BotConfig> = {
  model: "claude-sonnet-4-6",
  maxTurns: 10,
  systemPrompt: "",
  cwd: process.cwd(),
  permissionMode: "bypassPermissions",
  multiTurn: false,
  useLocalClaudeConfig: true, // 默认使用本地Claude配置
  timeoutMs: 300_000, // 5 minutes
  reconnectIntervalMs: 60_000, // 1 minute
};

function configPath(): string {
  return path.join(STATE_DIR, "config.json");
}

export function loadConfig(): Required<BotConfig> {
  let config: Required<BotConfig>;
  try {
    const raw = fs.readFileSync(configPath(), "utf-8");
    const saved = JSON.parse(raw) as BotConfig;
    config = { ...DEFAULT_CONFIG, ...saved };
  } catch {
    config = { ...DEFAULT_CONFIG };
  }

  // If enabled, merge local Claude config
  if (config.useLocalClaudeConfig) {
    const localResult = loadLocalClaudeConfig();
    if (localResult) {
      const { config: localConfig, sourcePath } = localResult;
      console.log(`📁 从本地 Claude 配置加载设置 (${sourcePath})`);

      // Set environment variables from local config (if not already set)
      // First check localConfig.env object (Claude Code style)
      if (localConfig.env && typeof localConfig.env === 'object' && !Array.isArray(localConfig.env)) {
        const envObj = localConfig.env as Record<string, unknown>;
        for (const [key, value] of Object.entries(envObj)) {
          if (process.env[key] === undefined && value !== undefined) {
            const strValue = String(value);
            process.env[key] = strValue;
            console.log(`  环境变量 ${key} = ${strValue}`);
          }
        }
      }
      // Also check top-level fields for backward compatibility
      const envVars = [
        'ANTHROPIC_BASE_URL',
        'ANTHROPIC_API_KEY',
        'ANTHROPIC_MODEL',
        'ANTHROPIC_DEFAULT_MODEL',
        'CLAUDE_CWD',
        'OPENAI_BASE_URL',
        'OPENAI_API_KEY',
      ];
      for (const envVar of envVars) {
        if (localConfig[envVar] !== undefined && process.env[envVar] === undefined) {
          const value = String(localConfig[envVar]);
          process.env[envVar] = value;
          console.log(`  环境变量 ${envVar} = ${value}`);
        }
      }

      // Map local config fields to bot config fields
      let updated = false;

      // Debug: show all available fields in local config (for troubleshooting)
      const debugFields = Object.keys(localConfig).filter(k => !k.startsWith('_') && k !== 'enabledPlugins' && k !== 'extraKnownMarketplaces');
      if (debugFields.length > 0) {
        console.log(`  本地配置可用字段: ${debugFields.join(', ')}`);
      }

      // Model mapping - try multiple possible field names
      const envObj = localConfig.env && typeof localConfig.env === 'object' && !Array.isArray(localConfig.env) ? localConfig.env as Record<string, unknown> : null;
      const modelCandidates = [
        localConfig.defaultModel,
        localConfig.model,
        envObj?.ANTHROPIC_MODEL,
        envObj?.ANTHROPIC_DEFAULT_MODEL,
        localConfig.ANTHROPIC_MODEL,
        localConfig.ANTHROPIC_DEFAULT_MODEL,
        process.env.ANTHROPIC_MODEL,
        process.env.ANTHROPIC_DEFAULT_MODEL
      ];

      for (const candidate of modelCandidates) {
        if (candidate && typeof candidate === 'string') {
          config.model = candidate;
          console.log(`  模型: ${candidate}`);
          updated = true;
          break;
        }
      }

      // Permission mode mapping
      const permissionCandidates = [
        localConfig.permissionMode,
        localConfig.defaultPermissionMode,
        localConfig.permission_mode
      ];

      for (const candidate of permissionCandidates) {
        if (candidate && typeof candidate === 'string') {
          const validModes: PermissionMode[] = ["auto", "bypassPermissions", "acceptEdits", "plan", "default", "dontAsk"];
          if (validModes.includes(candidate as PermissionMode)) {
            config.permissionMode = candidate as PermissionMode;
            console.log(`  权限模式: ${candidate}`);
            updated = true;
            break;
          }
        }
      }

      // Working directory mapping
      const cwdCandidates = [
        localConfig.cwd,
        localConfig.workingDirectory,
        localConfig.working_directory,
        localConfig.defaultCwd,
        process.env.CLAUDE_CWD
      ];

      for (const candidate of cwdCandidates) {
        if (candidate && typeof candidate === 'string') {
          config.cwd = candidate;
          console.log(`  工作目录: ${candidate}`);
          updated = true;
          break;
        }
      }

      // System prompt mapping
      const systemPromptCandidates = [
        localConfig.systemPrompt,
        localConfig.appendSystemPrompt,
        localConfig.defaultSystemPrompt,
        localConfig.system_prompt
      ];

      for (const candidate of systemPromptCandidates) {
        if (candidate && typeof candidate === 'string') {
          config.systemPrompt = candidate;
          console.log(`  系统提示: ${candidate.substring(0, 60)}...`);
          updated = true;
          break;
        }
      }

      // Max turns mapping
      const maxTurnsCandidates = [
        localConfig.maxTurns,
        localConfig.max_turns,
        localConfig.defaultMaxTurns,
        localConfig.maxTurns ?? localConfig.max_turns // handle undefined
      ];

      for (const candidate of maxTurnsCandidates) {
        if (candidate !== undefined && candidate !== null) {
          const turns = Number(candidate);
          if (!isNaN(turns) && turns > 0) {
            config.maxTurns = turns;
            console.log(`  最大轮次: ${turns}`);
            updated = true;
            break;
          }
        }
      }

      // Timeout mapping
      const timeoutMsCandidates = [
        localConfig.timeoutMs,
        localConfig.timeout,
        localConfig.defaultTimeoutMs,
        localConfig.timeout_ms
      ];

      for (const candidate of timeoutMsCandidates) {
        if (candidate !== undefined && candidate !== null) {
          const timeout = Number(candidate);
          if (!isNaN(timeout) && timeout > 0) {
            config.timeoutMs = timeout;
            console.log(`  超时时间: ${timeout}ms`);
            updated = true;
            break;
          }
        }
      }

      // Multi-turn mapping (if present)
      if (localConfig.multiTurn !== undefined) {
        config.multiTurn = Boolean(localConfig.multiTurn);
        console.log(`  多轮对话: ${config.multiTurn ? '开启' : '关闭'}`);
        updated = true;
      }

      if (!updated) {
        console.log(`  本地配置中没有可用的设置字段`);
      } else {
        console.log(`  ✅ 已从本地配置加载 ${updated ? '设置' : '无设置'}`);
      }
    } else {
      console.log(`ℹ️  未找到本地 Claude 配置文件 (尝试了 ~/.claude/config.json 和 ~/.claude/settings.json)`);
      console.log(`   将使用项目配置的默认值。`);
      console.log(`   如需禁用此功能: npm run config -- --use-local-claude-config false`);
      console.log(`   或创建配置文件: echo '{"defaultModel": "claude-sonnet-4-6"}' > ~/.claude/config.json`);
    }
  }

  return config;
}

export function saveConfig(config: BotConfig): void {
  ensureDir(STATE_DIR);
  const existing = loadConfig();
  const merged = { ...existing, ...config };
  fs.writeFileSync(configPath(), JSON.stringify(merged, null, 2));
  console.log(`配置已保存到 ${configPath()}`);
}

// --- Session IDs (per-user, for multi-turn conversations) ---

function sessionIdsPath(): string {
  return path.join(STATE_DIR, "session-ids.json");
}

let sessionCache: Record<string, string> = {};

export function loadSessionIds(): void {
  try {
    const raw = fs.readFileSync(sessionIdsPath(), "utf-8");
    sessionCache = JSON.parse(raw) as Record<string, string>;
  } catch {
    sessionCache = {};
  }
}

export function getSessionId(userId: string): string | undefined {
  return sessionCache[userId];
}

export function setSessionId(userId: string, sessionId: string): void {
  sessionCache[userId] = sessionId;
  ensureDir(STATE_DIR);
  fs.writeFileSync(sessionIdsPath(), JSON.stringify(sessionCache));
}

export function clearSessionId(userId: string): void {
  delete sessionCache[userId];
  ensureDir(STATE_DIR);
  fs.writeFileSync(sessionIdsPath(), JSON.stringify(sessionCache));
}
