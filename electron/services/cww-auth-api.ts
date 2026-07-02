/**
 * CWW 认证 API
 * 鲁南千易扫码登录的后端代理模块
 * 所有 HTTP 请求在主进程执行，通过 host-api 暴露给渲染进程
 */

import { CWW_CONFIG } from '../utils/config';
import { getProviderSecret, setProviderSecret, deleteProviderSecret } from './secrets/secret-store';
import { getClawXProviderStore } from './providers/store-instance';
import type {
  CwwQRCodeResponse,
  CwwQRCodeStatus,
  CwwMeSessionResult,
  CwwModelConfig,
  CwwAuthStatusSnapshot,
  HostSuccess,
} from '../../shared/host-api/contract';

/** CWW token 在 secure-storage 中的 key */
const CWW_TOKEN_KEY = 'cww:accessToken';

/** CWW 用户信息在 electron-store 中的 key */
const CWW_USER_KEY = 'cww:userInfo';
const CWW_MODEL_CONFIG_KEY = 'cww:modelConfig';

/**
 * 创建 CWW 认证 host-api 模块
 */
export function createCwwAuthApi() {
  return {
    /** 获取登录二维码 */
    getQRCode: async (): Promise<CwwQRCodeResponse> => {
      const baseUrl = CWW_CONFIG.API_BASE_URL;
      if (!baseUrl) throw new Error('CWW API 地址未配置');

      const resp = await fetch(`${baseUrl}/auth/qr-code`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!resp.ok) throw new Error(`获取二维码失败: ${resp.status}`);

      const json = await resp.json();
      const data = json.data ?? json;
      return {
        qrcode: data.qrcode ?? data.qr_code ?? '',
        img: data.img ?? data.qr_img ?? '',
      };
    },

    /** 轮询二维码扫码状态 */
    checkQRCode: async (payload: { key: string }): Promise<CwwQRCodeStatus> => {
      const baseUrl = CWW_CONFIG.API_BASE_URL;
      if (!baseUrl) throw new Error('CWW API 地址未配置');

      const resp = await fetch(`${baseUrl}/auth/qr-code/${payload.key}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!resp.ok) throw new Error(`轮询扫码状态失败: ${resp.status}`);

      const json = await resp.json();
      const data = json.data ?? json;

      // 登录成功时自动保存 token 和用户信息
      if (data.code === 1003 && data.access_token) {
        await saveCwwToken(data.access_token);
        if (data.user) {
          await saveCwwUserInfo(data.user);
        }
        if (data.model_config) {
          await saveCwwModelConfig(data.model_config);
        }
      }

      return {
        code: data.code,
        access_token: data.code === 1003 ? data.access_token : undefined,
        auth_type: data.auth_type,
        user: data.user,
        model_config: data.model_config,
      };
    },

    /** 获取当前认证状态（冷启动恢复用） */
    getAuthStatus: async (): Promise<CwwAuthStatusSnapshot> => {
      const token = await getCwwToken();
      if (!token) return { loggedIn: false };

      // 用 /auth/me 验证 token 有效性
      const session = await fetchMeSession(token);
      if (!session.ok) {
        // token 失效，清除本地数据
        await clearCwwAuthData();
        return { loggedIn: false };
      }

      // 更新本地缓存
      if (session.user) await saveCwwUserInfo(session.user);
      if (session.modelConfig) await saveCwwModelConfig(session.modelConfig);

      return {
        loggedIn: true,
        user: session.user,
        modelConfig: session.modelConfig,
      };
    },

    /** 退出登录 */
    logout: async (): Promise<HostSuccess> => {
      await clearCwwAuthData();
      return { success: true };
    },
  };
}

// ==================== 内部工具函数 ====================

/** 调用 /auth/me 验证 token 并获取用户信息 */
async function fetchMeSession(token: string): Promise<CwwMeSessionResult> {
  const baseUrl = CWW_CONFIG.API_BASE_URL;
  if (!baseUrl) return { ok: false, message: 'CWW API 地址未配置' };

  try {
    const resp = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (resp.status === 401) {
      return { ok: false, unauthorized: true };
    }
    if (!resp.ok) {
      return { ok: false, message: `请求失败: ${resp.status}` };
    }

    const json = await resp.json();
    const data = json.data ?? json;
    const modelConfig = data.model_config ?? data.modelConfig ?? null;

    return {
      ok: true,
      user: data.user ?? data,
      modelConfig,
    };
  } catch (err) {
    return { ok: false, message: String(err) };
  }
}

/** 保存 CWW access token 到 secure-storage */
async function saveCwwToken(token: string): Promise<void> {
  await setProviderSecret({
    type: 'api_key',
    accountId: CWW_TOKEN_KEY,
    apiKey: token,
  });
}

/** 读取 CWW access token */
export async function getCwwToken(): Promise<string | null> {
  const secret = await getProviderSecret(CWW_TOKEN_KEY);
  if (secret?.type === 'api_key') return secret.apiKey;
  return null;
}

/** 保存 CWW 用户信息到 electron-store */
async function saveCwwUserInfo(user: { id: number | string; nickname?: string; avatar?: string }): Promise<void> {
  const store = await getClawXProviderStore();
  store.set(CWW_USER_KEY, user);
}

/** 读取 CWW 用户信息 */
export async function getCwwUserInfo(): Promise<{ id: number | string; nickname?: string; avatar?: string } | null> {
  const store = await getClawXProviderStore();
  return (store.get(CWW_USER_KEY) as Record<string, unknown>) ?? null;
}

/** 保存 CWW 下发的模型配置到 electron-store */
async function saveCwwModelConfig(config: CwwModelConfig): Promise<void> {
  const store = await getClawXProviderStore();
  store.set(CWW_MODEL_CONFIG_KEY, config);
}

/** 读取 CWW 下发的模型配置 */
export async function getCwwModelConfig(): Promise<CwwModelConfig | null> {
  const store = await getClawXProviderStore();
  return (store.get(CWW_MODEL_CONFIG_KEY) as CwwModelConfig) ?? null;
}

/** 清除所有 CWW 认证数据 */
async function clearCwwAuthData(): Promise<void> {
  await deleteProviderSecret(CWW_TOKEN_KEY);
  const store = await getClawXProviderStore();
  store.delete(CWW_USER_KEY);
  store.delete(CWW_MODEL_CONFIG_KEY);
}
