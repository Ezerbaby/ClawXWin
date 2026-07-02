/**
 * CWW 认证状态管理
 * 管理鲁南千易扫码登录的登录态、用户信息、模型配置
 */
import { create } from 'zustand';
import { hostApi } from '@/lib/host-api';

// 来自服务端协议的类型定义
type CwwModelConfig = {
  provider?: string;
  model_id?: string;
  model_name?: string;
  base_url?: string;
  api_key?: string;
  api_format?: string;
};

type CwwUser = {
  id: number | string;
  nickname?: string;
  avatar?: string;
};

interface CwwAuthState {
  /** 是否已登录 */
  loggedIn: boolean;
  /** 用户信息 */
  user: CwwUser | null;
  /** 服务端下发的模型配置 */
  modelConfig: CwwModelConfig | null;
  /** 是否正在初始化（冷启动恢复） */
  initializing: boolean;
  /** 二维码状态：idle / loading / waiting / scanned / expired / error */
  qrState: 'idle' | 'loading' | 'waiting' | 'scanned' | 'expired' | 'error';
  /** 二维码图片 URL */
  qrImg: string;
  /** 当前二维码 key（用于轮询） */
  qrKey: string;
  /** 错误信息 */
  error: string;

  /** 冷启动恢复登录态 */
  restore: () => Promise<void>;
  /** 获取二维码 */
  fetchQRCode: () => Promise<void>;
  /** 开始轮询扫码状态 */
  startPolling: () => void;
  /** 停止轮询 */
  stopPolling: () => void;
  /** 退出登录 */
  logout: () => Promise<void>;
  /** 重置状态 */
  reset: () => void;
}

// 轮询定时器引用，模块级别共享
let pollingTimer: ReturnType<typeof setTimeout> | null = null;

export const useCwwAuthStore = create<CwwAuthState>((set, get) => ({
  loggedIn: false,
  user: null,
  modelConfig: null,
  initializing: true,
  qrState: 'idle',
  qrImg: '',
  qrKey: '',
  error: '',

  /** 冷启动时从 Main 进程恢复登录态 */
  restore: async () => {
    set({ initializing: true });
    try {
      const status = await hostApi.cwwAuth.getAuthStatus();
      set({
        loggedIn: status.loggedIn,
        user: status.user ?? null,
        modelConfig: status.modelConfig ?? null,
        initializing: false,
      });
    } catch {
      // 恢复失败视为未登录
      set({ loggedIn: false, initializing: false });
    }
  },

  /** 请求服务端生成二维码并自动启动轮询 */
  fetchQRCode: async () => {
    set({ qrState: 'loading', error: '' });
    try {
      const result = await hostApi.cwwAuth.getQRCode();
      set({
        qrState: 'waiting',
        qrImg: result.img,
        qrKey: result.qrcode,
      });
      // 二维码获取成功后自动开始轮询
      get().startPolling();
    } catch (err) {
      set({ qrState: 'error', error: String(err) });
    }
  },

  /** 启动轮询：定时检查扫码结果 */
  startPolling: () => {
    // 先清除旧的定时器，防止重复轮询
    if (pollingTimer) clearTimeout(pollingTimer);

    const poll = async () => {
      const { qrKey, qrState } = get();
      // 仅在等待扫码或已扫码待确认时继续轮询
      if (qrState !== 'waiting' && qrState !== 'scanned') return;

      try {
        const status = await hostApi.cwwAuth.checkQRCode(qrKey);

        if (status.code === 1002) {
          // 已扫码，等待用户在手机端确认
          set({ qrState: 'scanned' });
          pollingTimer = setTimeout(poll, 1000);
        } else if (status.code === 1003) {
          // 登录成功，更新用户信息和模型配置
          set({
            qrState: 'idle',
            loggedIn: true,
            user: status.user ?? null,
            modelConfig: status.model_config ?? null,
          });
        } else if (status.code === 1005) {
          // 二维码已过期，停止轮询
          set({ qrState: 'expired' });
        } else {
          // 其他状态码继续轮询
          pollingTimer = setTimeout(poll, 1000);
        }
      } catch {
        // 轮询请求失败时降频重试
        pollingTimer = setTimeout(poll, 2000);
      }
    };

    // 首次轮询延迟 1 秒
    pollingTimer = setTimeout(poll, 1000);
  },

  /** 停止轮询并清理定时器 */
  stopPolling: () => {
    if (pollingTimer) {
      clearTimeout(pollingTimer);
      pollingTimer = null;
    }
  },

  /** 退出登录：通知 Main 进程清除凭据，重置 store */
  logout: async () => {
    await hostApi.cwwAuth.logout();
    set({
      loggedIn: false,
      user: null,
      modelConfig: null,
      qrState: 'idle',
      qrImg: '',
      qrKey: '',
    });
  },

  /** 重置二维码相关状态（不清除登录态） */
  reset: () => {
    get().stopPolling();
    set({
      qrState: 'idle',
      qrImg: '',
      qrKey: '',
      error: '',
    });
  },
}));
