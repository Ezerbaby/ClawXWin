/**
 * 更新 API 适配层
 * 将 CwwUpdateService 适配为 host-api 的 updates 模块
 * 保持与原有 API 形状一致（status、version、check、download、install 等）
 * 内部使用 CwwUpdateService 替代 electron-updater 的 AppUpdater
 */

import type {
  UpdateInfoSnapshot,
  UpdateProgressSnapshot,
  UpdateStatusSnapshot,
} from '@shared/host-api/contract';
import type { CompleteHostServiceRegistry } from '../main/ipc/host-contract';
import { cwwUpdateService } from './cww-update-service';
import type { CwwUpdateStatusSnapshot } from './cww-update-service';

/** 将 CWW 更新信息快照转换为 host-api 的 UpdateInfoSnapshot */
function normalizeInfo(info: CwwUpdateStatusSnapshot['info']): UpdateInfoSnapshot | undefined {
  if (!info) return undefined;
  return {
    version: info.version,
    releaseNotes: info.releaseNotes,
  };
}

/** 将 CWW 下载进度快照转换为 host-api 的 UpdateProgressSnapshot */
function normalizeProgress(progress: CwwUpdateStatusSnapshot['progress']): UpdateProgressSnapshot | undefined {
  if (!progress) return undefined;
  return {
    total: progress.total,
    delta: progress.delta,
    transferred: progress.transferred,
    percent: progress.percent,
    bytesPerSecond: progress.bytesPerSecond,
  };
}

/** 将 CWW 状态快照转换为 host-api 的 UpdateStatusSnapshot */
function normalizeStatus(snapshot: CwwUpdateStatusSnapshot): UpdateStatusSnapshot {
  return {
    status: snapshot.status,
    info: normalizeInfo(snapshot.info),
    progress: normalizeProgress(snapshot.progress),
    error: snapshot.error,
  };
}

/**
 * 创建 updates host-api 模块
 * 使用 CwwUpdateService 替代 AppUpdater
 */
export function createUpdatesApi(): CompleteHostServiceRegistry['updates'] {
  return {
    /** 获取当前更新状态 */
    status: () => normalizeStatus(cwwUpdateService.getStatusSnapshot()),

    /** 获取当前版本号 */
    version: () => cwwUpdateService.getVersion(),

    /** 检查更新 */
    check: async () => {
      try {
        const snapshot = await cwwUpdateService.checkForUpdate();
        return { success: true, status: normalizeStatus(snapshot) };
      } catch (error) {
        return {
          success: false,
          error: String(error),
          status: normalizeStatus(cwwUpdateService.getStatusSnapshot()),
        };
      }
    },

    /** 下载更新 */
    download: async () => {
      try {
        const result = await cwwUpdateService.downloadUpdate();
        if (!result.success) {
          return { success: false, error: result.error };
        }
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /** 安装更新 */
    install: () => {
      const result = cwwUpdateService.installUpdate();
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return { success: true };
    },

    /** 设置更新通道（兼容保留，CWW 更新服务不使用通道） */
    setChannel: () => {
      // CWW 更新服务不区分通道，保留为空操作
      return { success: true };
    },

    /** 设置自动下载（兼容保留，始终为手动触发） */
    setAutoDownload: () => {
      // CWW 更新服务始终手动触发，保留为空操作
      return { success: true };
    },

    /** 取消自动安装倒计时（兼容保留） */
    cancelAutoInstall: () => {
      // CWW 更新服务不使用自动安装倒计时，保留为空操作
      return { success: true };
    },

    /** 取消正在进行的下载 */
    cancelDownload: () => {
      cwwUpdateService.cancelDownload();
      return { success: true };
    },
  };
}
