/**
 * 更新状态 Store
 * 管理应用更新状态，适配 CWW 更新服务
 * 新增 forceUpdate 状态和 cancelDownload 操作
 */
import { create } from 'zustand';
import { useSettingsStore } from './settings';
import { hostApi } from '@/lib/host-api';
import { hostEvents } from '@/lib/host-events';
import type {
  UpdateChannel,
  UpdateInfoSnapshot,
  UpdateProgressSnapshot,
  UpdateStatusSnapshot,
} from '@shared/host-api/contract';

export type UpdateInfo = UpdateInfoSnapshot;
export type ProgressInfo = UpdateProgressSnapshot;
export type UpdateStatus = UpdateStatusSnapshot['status'];

interface UpdateState {
  status: UpdateStatus;
  currentVersion: string;
  updateInfo: UpdateInfo | null;
  progress: ProgressInfo | null;
  error: string | null;
  isInitialized: boolean;
  /** 是否为强制更新 */
  forceUpdate: boolean;
  /** Seconds remaining before auto-install, or null if inactive. */
  autoInstallCountdown: number | null;

  // Actions
  init: () => Promise<void>;
  checkForUpdates: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => void;
  cancelAutoInstall: () => Promise<void>;
  cancelDownload: () => Promise<void>;
  setChannel: (channel: UpdateChannel) => Promise<void>;
  setAutoDownload: (enable: boolean) => Promise<void>;
  clearError: () => void;
}

let updateInitPromise: Promise<void> | null = null;

export const useUpdateStore = create<UpdateState>((set, get) => ({
  status: 'idle',
  currentVersion: '0.0.0',
  updateInfo: null,
  progress: null,
  error: null,
  isInitialized: false,
  forceUpdate: false,
  autoInstallCountdown: null,

  init: async () => {
    if (get().isInitialized) return;
    if (updateInitPromise) return updateInitPromise;

    updateInitPromise = (async () => {
      // 获取当前版本号
      try {
        const version = await hostApi.updates.version();
        set({ currentVersion: version });
      } catch (error) {
        console.error('获取版本号失败:', error);
      }

      // 获取当前更新状态
      try {
        const status = await hostApi.updates.status();
        set({
          status: status.status,
          updateInfo: status.info || null,
          progress: status.progress || null,
          error: status.error || null,
          forceUpdate: status.status === 'force-update',
        });
      } catch (error) {
        console.error('获取更新状态失败:', error);
      }

      // 监听更新事件
      // 唯一数据源：仅监听 update:status-changed
      // （由主进程 CwwUpdateService 的 onStatusChange 回调发送）
      hostEvents.onUpdateStatusChanged((status) => {
        set({
          status: status.status,
          updateInfo: status.info || null,
          progress: status.progress || null,
          error: status.error || null,
          forceUpdate: status.status === 'force-update',
        });
      });

      hostEvents.onUpdateAutoInstallCountdown(({ seconds, cancelled }) => {
        set({ autoInstallCountdown: cancelled ? null : seconds });
      });

      // 默认提示优先：除非用户主动点击下载，否则不自动下载/安装
      void hostApi.updates.setAutoDownload(false).catch(() => {});

      set({ isInitialized: true });

      // 启动时自动检查更新（遵循用户开关）
      const autoCheckUpdate = useSettingsStore.getState().autoCheckUpdate;
      if (autoCheckUpdate) {
        setTimeout(() => {
          get().checkForUpdates().catch(() => {});
        }, 10000);
      }
    })();

    try {
      await updateInitPromise;
    } finally {
      if (!get().isInitialized) {
        updateInitPromise = null;
      }
    }
  },

  checkForUpdates: async () => {
    set({ status: 'checking', error: null });
    
    try {
      const result = await Promise.race([
        hostApi.updates.check(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('更新检查超时')), 30000))
      ]);
      
      if (result.status) {
        set({
          status: result.status.status,
          updateInfo: result.status.info || null,
          progress: result.status.progress || null,
          error: result.status.error || null,
          forceUpdate: result.status.status === 'force-update',
        });
      } else if (!result.success) {
        set({ status: 'error', error: result.error || '检查更新失败' });
      }
    } catch (error) {
      set({ status: 'error', error: String(error) });
    } finally {
      // 开发模式下更新服务可能跳过检查而不发送事件，兜底处理
      const currentStatus = get().status;
      if (currentStatus === 'checking' || currentStatus === 'idle') {
        set({
          status: 'error',
          error: '更新检查未返回结果，通常表示应用运行在开发模式下或 CWW 更新服务地址未配置。',
        });
      }
    }
  },

  downloadUpdate: async () => {
    set({ status: 'downloading', error: null });
    
    try {
      const result = await hostApi.updates.download();
      
      if (!result.success) {
        set({ status: 'error', error: result.error || '下载更新失败' });
      }
    } catch (error) {
      set({ status: 'error', error: String(error) });
    }
  },

  installUpdate: () => {
    void hostApi.updates.install();
  },

  cancelAutoInstall: async () => {
    try {
      await hostApi.updates.cancelAutoInstall();
    } catch (error) {
      console.error('取消自动安装失败:', error);
    }
  },

  cancelDownload: async () => {
    try {
      await hostApi.updates.cancelDownload();
      // 取消后重置到空闲状态
      set({ status: 'idle', progress: null });
    } catch (error) {
      console.error('取消下载失败:', error);
    }
  },

  setChannel: async (channel) => {
    try {
      await hostApi.updates.setChannel(channel);
    } catch (error) {
      console.error('设置更新通道失败:', error);
    }
  },

  setAutoDownload: async (enable) => {
    try {
      // 兼容旧 UI 路径：更新服务现为提示优先模式，
      // 即使旧的持久化设置要求自动下载也保持禁用
      await hostApi.updates.setAutoDownload(false);
      if (enable) {
        console.info('[Update] 自动下载偏好已忽略；改为显示更新提示。');
      }
    } catch (error) {
      console.error('设置自动下载失败:', error);
    }
  },

  clearError: () => set({ error: null, status: 'idle' }),
}));
