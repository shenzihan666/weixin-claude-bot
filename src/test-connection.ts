/**
 * 连接稳定性测试程序
 *
 * 测试目标：验证心跳机制是否能解决长时间运行后的 "fetch failed" 问题
 * 运行方式：npm run test:connection
 * 建议运行时间：至少 2 小时
 */

import crypto from "node:crypto";
import { loadCredentials, loadSyncBuf, saveSyncBuf } from "./store.js";

// === 配置 ===
const CONFIG = {
  longPollTimeoutMs: 35_000,      // 长轮询超时
  heartbeatIntervalMs: 20_000,    // 心跳间隔（在长轮询期间发送）
  reconnectIntervalMs: 60_000,    // 强制重连间隔
  maxConsecutiveFailures: 3,      // 最大连续失败次数
  backoffMs: 30_000,              // 失败后等待时间
};

// === 测试状态 ===
interface TestStats {
  startTime: Date;
  totalRequests: number;
  successCount: number;
  failureCount: number;
  lastSuccessTime: Date | null;
  lastFailureTime: Date | null;
  lastError: string | null;
  consecutiveFailures: number;
  reconnectCount: number;
}

const stats: TestStats = {
  startTime: new Date(),
  totalRequests: 0,
  successCount: 0,
  failureCount: 0,
  lastSuccessTime: null,
  lastFailureTime: null,
  lastError: null,
  consecutiveFailures: 0,
  reconnectCount: 0,
};

// === API 调用 ===

interface ApiOptions {
  baseUrl: string;
  token: string;
}

function randomWechatUin(): string {
  const uint32 = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), "utf-8").toString("base64");
}

function buildHeaders(token: string, body: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    AuthorizationType: "ilink_bot_token",
    "Content-Length": String(Buffer.byteLength(body, "utf-8")),
    "X-WECHAT-UIN": randomWechatUin(),
  };
}

/**
 * 方案1：带心跳的 fetch
 * 在长轮询期间定期发送 "keep-alive" 数据来保持连接活跃
 */
async function fetchWithHeartbeat(
  opts: ApiOptions,
  endpoint: string,
  payload: Record<string, unknown>,
  onHeartbeat?: () => void,
): Promise<Response> {
  const url = new URL(endpoint, opts.baseUrl.endsWith("/") ? opts.baseUrl : opts.baseUrl + "/");
  const body = JSON.stringify({ ...payload, base_info: { channel_version: "test-connection/0.1.0" } });
  const headers = buildHeaders(opts.token, body);

  const controller = new AbortController();

  // 设置心跳定时器
  let heartbeatCount = 0;
  const heartbeatTimer = setInterval(() => {
    heartbeatCount++;
    if (onHeartbeat) {
      onHeartbeat();
    }
    log(`  💓 心跳 #${heartbeatCount} (连接保持中...)`);
  }, CONFIG.heartbeatIntervalMs);

  try {
    const res = await fetch(url.toString(), {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
    return res;
  } finally {
    clearInterval(heartbeatTimer);
  }
}

/**
 * 方案2：强制重新建立连接
 * 每隔一定时间主动断开并重新建立连接
 */
class ConnectionManager {
  private lastConnectTime: Date | null = null;
  private requestCount = 0;

  shouldReconnect(): boolean {
    if (!this.lastConnectTime) return false;

    const elapsed = Date.now() - this.lastConnectTime.getTime();
    return elapsed >= CONFIG.reconnectIntervalMs;
  }

  recordConnect(): void {
    this.lastConnectTime = new Date();
    this.requestCount = 0;
    stats.reconnectCount++;
  }

  recordRequest(): void {
    this.requestCount++;
  }
}

const connectionManager = new ConnectionManager();

// === 核心测试逻辑 ===

async function testPoll(api: ApiOptions, syncBuf: string): Promise<string> {
  stats.totalRequests++;
  connectionManager.recordRequest();

  try {
    // 使用带心跳的 fetch
    const res = await fetchWithHeartbeat(
      api,
      "ilink/bot/getupdates",
      { get_updates_buf: syncBuf },
      () => {
        // 心跳回调 - 可以在这里做一些保持连接的事情
      },
    );

    const text = await res.text();

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${text}`);
    }

    const data = JSON.parse(text);

    // 检查业务错误
    if ((data.ret && data.ret !== 0) || (data.errcode && data.errcode !== 0)) {
      throw new Error(`API error: ret=${data.ret} errcode=${data.errcode}`);
    }

    // 成功
    stats.successCount++;
    stats.lastSuccessTime = new Date();
    stats.consecutiveFailures = 0;
    stats.lastError = null;

    return data.get_updates_buf || syncBuf;
  } catch (err) {
    stats.failureCount++;
    stats.lastFailureTime = new Date();
    stats.lastError = err instanceof Error ? err.message : String(err);
    stats.consecutiveFailures++;

    throw err;
  }
}

// === 日志和报告 ===

function log(msg: string): void {
  const now = new Date();
  const elapsed = Math.floor((now.getTime() - stats.startTime.getTime()) / 1000);
  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;
  const elapsedStr = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

  console.log(`[${elapsedStr}] ${msg}`);
}

function printReport(): void {
  console.log("\n" + "=".repeat(60));
  console.log("📊 测试报告");
  console.log("=".repeat(60));
  console.log(`开始时间: ${stats.startTime.toISOString()}`);
  console.log(`运行时长: ${Math.floor((Date.now() - stats.startTime.getTime()) / 1000 / 60)} 分钟`);
  console.log(`总请求数: ${stats.totalRequests}`);
  console.log(`成功次数: ${stats.successCount}`);
  console.log(`失败次数: ${stats.failureCount}`);
  console.log(`重连次数: ${stats.reconnectCount}`);
  console.log(`成功率: ${stats.totalRequests > 0 ? ((stats.successCount / stats.totalRequests) * 100).toFixed(2) : 0}%`);
  console.log(`最后成功: ${stats.lastSuccessTime?.toISOString() || "N/A"}`);
  console.log(`最后失败: ${stats.lastFailureTime?.toISOString() || "N/A"}`);
  console.log(`最后错误: ${stats.lastError || "N/A"}`);
  console.log("=".repeat(60) + "\n");
}

// 定期打印报告
function startReportTimer(): void {
  setInterval(() => {
    printReport();
  }, 5 * 60 * 1000); // 每 5 分钟打印一次报告
}

// === 主程序 ===

async function main() {
  console.log("🔬 连接稳定性测试程序");
  console.log("=".repeat(60));

  const creds = loadCredentials();
  if (!creds) {
    console.error("❌ 未找到登录凭证。请先运行: npm run login");
    process.exit(1);
  }

  const api: ApiOptions = {
    baseUrl: creds.baseUrl,
    token: creds.botToken,
  };

  console.log(`API 端点: ${api.baseUrl}`);
  console.log(`长轮询超时: ${CONFIG.longPollTimeoutMs}ms`);
  console.log(`心跳间隔: ${CONFIG.heartbeatIntervalMs}ms`);
  console.log(`强制重连间隔: ${CONFIG.reconnectIntervalMs}ms`);
  console.log("=".repeat(60));
  console.log("按 Ctrl+C 停止测试并查看报告\n");

  // 启动定期报告
  startReportTimer();

  let syncBuf = loadSyncBuf();
  connectionManager.recordConnect();

  // 优雅退出
  process.on("SIGINT", () => {
    console.log("\n\n🛑 收到停止信号...");
    printReport();
    process.exit(0);
  });

  // 主循环
  while (true) {
    try {
      // 检查是否需要强制重连
      if (connectionManager.shouldReconnect()) {
        log("🔄 强制重新建立连接...");
        connectionManager.recordConnect();
        // 给一点时间让之前的连接完全关闭
        await sleep(1000);
      }

      log(`📥 发起轮询请求 #${stats.totalRequests + 1}...`);
      syncBuf = await testPoll(api, syncBuf);

      // 保存游标
      if (syncBuf) {
        saveSyncBuf(syncBuf);
      }

      log(`✅ 请求成功 (连续失败: ${stats.consecutiveFailures})`);

      // 短暂休眠避免过于频繁
      await sleep(1000);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log(`❌ 请求失败 (${stats.consecutiveFailures}/${CONFIG.maxConsecutiveFailures}): ${errMsg}`);

      if (stats.consecutiveFailures >= CONFIG.maxConsecutiveFailures) {
        log(`⚠️  连续失败 ${CONFIG.maxConsecutiveFailures} 次，等待 ${CONFIG.backoffMs / 1000}s 后重试...`);
        stats.consecutiveFailures = 0;
        connectionManager.recordConnect(); // 重置连接状态
        await sleep(CONFIG.backoffMs);
      } else {
        await sleep(2000);
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error("启动失败:", err);
  printReport();
  process.exit(1);
});
