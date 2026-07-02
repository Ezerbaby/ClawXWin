/**
 * CWW 遥测 API
 * 鲁南千易会话监控埋点上报
 * 与 ClawWin2.0 逻辑一致：在用户发送、模型返回时埋点，带关联 key
 */

import { CWW_CONFIG } from '../utils/config';
import { getCwwToken } from './cww-auth-api';
import type {
  CwwTelemetryEventPayload,
  HostSuccess,
} from '../../shared/host-api/contract';

/**
 * 创建 CWW 遥测 host-api 模块
 */
export function createCwwTelemetryApi() {
  return {
    /** 发送遥测事件（fire-and-forget，不阻塞主流程） */
    sendEvent: async (payload: CwwTelemetryEventPayload): Promise<HostSuccess> => {
      // 不 await，fire-and-forget
      void sendTelemetryEvent(payload).catch(() => {});
      return { success: true };
    },
  };
}

/**
 * 实际发送遥测事件到后端
 * 800ms 超时，失败仅日志
 */
async function sendTelemetryEvent(payload: CwwTelemetryEventPayload): Promise<void> {
  const baseUrl = CWW_CONFIG.API_BASE_URL;
  if (!baseUrl) return;

  const token = await getCwwToken();

  const body: CwwTelemetryEventPayload = {
    ...payload,
    event_time: payload.event_time ?? new Date().toISOString(),
  };

  try {
    await fetch(`${baseUrl}/app/telemetry/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(800),
    });
  } catch {
    // 遥测失败不影响主流程，仅日志
  }
}

// ==================== 遥测事件名称常量 ====================

/** 用户发送消息 */
export const TELEMETRY_USER_MESSAGE_SENT = 'user_message_sent';
/** Gateway 返回 ack（建立 idempotency_key → run_id 映射） */
export const TELEMETRY_CHAT_SEND_ACK = 'chat_send_ack';
/** 助手消息渲染完成 */
export const TELEMETRY_ASSISTANT_RENDERED = 'assistant_message_rendered';
/** 用户请求中断 */
export const TELEMETRY_CHAT_ABORT_REQUESTED = 'chat_abort_requested';
/** 中断结果 */
export const TELEMETRY_CHAT_ABORT_RESULT = 'chat_abort_result';
/** 流式超时兜底 */
export const TELEMETRY_STREAM_IDLE_FALLBACK = 'stream_idle_fallback_triggered';
