/**
 * CWW 增量/完整包更新服务
 * 替换 electron-updater，使用鲁南千易版本检查 API
 * 支持强制更新（must_version）和增量更新（lite）
 */

import { app } from 'electron';
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { platform } from 'node:os';
import { CWW_CONFIG } from '../utils/config';
import { getCwwToken } from './cww-auth-api';

/** 更新状态类型 */
export type CwwUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'force-update';

/** 更新类型 */
export type CwwUpdateType = 'full' | 'lite';

/** 版本检查响应 */
interface CwwVersionCheckResult {
  must_version_code: string;
  must_exe_path: string;
  must_exe_path_32?: string;
  must_remark?: string;
  version_code: string;
  exe_path: string;
  exe_path_32?: string;
  remark?: string;
  force_update?: number | boolean;
}

/** 更新信息快照 */
export interface CwwUpdateInfoSnapshot {
  version: string;
  releaseNotes?: string;
  updateType: CwwUpdateType;
  downloadUrl: string;
  forceUpdate: boolean;
}

/** 下载进度 */
export interface CwwUpdateProgress {
  total: number;
  delta: number;
  transferred: number;
  percent: number;
  bytesPerSecond: number;
}

/** 完整状态快照 */
export interface CwwUpdateStatusSnapshot {
  status: CwwUpdateStatus;
  info?: CwwUpdateInfoSnapshot;
  progress?: CwwUpdateProgress;
  error?: string;
}

/** 比较版本号，返回 true 表示 v1 > v2 */
function isVersionGreaterThan(v1: string, v2: string): boolean {
  const parts1 = v1.replace(/^v/, '').split('.').map(Number);
  const parts2 = v2.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const a = parts1[i] || 0;
    const b = parts2[i] || 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return false;
}

/**
 * CWW 更新服务
 */
export class CwwUpdateService {
  private status: CwwUpdateStatus = 'idle';
  private info?: CwwUpdateInfoSnapshot;
  private progress?: CwwUpdateProgress;
  private errorMessage?: string;
  private downloadPath?: string;
  private abortController?: AbortController;
  private onStatusChange?: (snapshot: CwwUpdateStatusSnapshot) => void;

  /** 设置状态变更回调 */
  setOnStatusChange(cb: (snapshot: CwwUpdateStatusSnapshot) => void): void {
    this.onStatusChange = cb;
  }

  /** 获取当前状态快照 */
  getStatusSnapshot(): CwwUpdateStatusSnapshot {
    return {
      status: this.status,
      info: this.info,
      progress: this.progress,
      error: this.errorMessage,
    };
  }

  /** 获取当前版本号 */
  getVersion(): string {
    return app.getVersion();
  }

  /** 检查更新 */
  async checkForUpdate(): Promise<CwwUpdateStatusSnapshot> {
    const serverUrl = CWW_CONFIG.UPDATE_SERVER_URL;
    if (!serverUrl) {
      this.setError('CWW 更新服务地址未配置');
      return this.getStatusSnapshot();
    }

    this.setStatus('checking');
    this.info = undefined;
    this.progress = undefined;
    this.errorMessage = undefined;

    try {
      const token = await getCwwToken();
      const currentVersion = app.getVersion();
      const url = `${serverUrl}/app/version/check?current_version=${currentVersion}`;

      const resp = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(15_000),
      });

      if (!resp.ok) {
        this.setError(`版本检查失败: ${resp.status}`);
        return this.getStatusSnapshot();
      }

      const json = await resp.json();
      const data: CwwVersionCheckResult = json.data ?? json;

      // 判断是否需要强制更新
      if (data.must_version_code && isVersionGreaterThan(data.must_version_code, currentVersion)) {
        const is32Bit = platform() === 'win32' && process.arch === 'ia32';
        const downloadUrl = is32Bit && data.must_exe_path_32 ? data.must_exe_path_32 : data.must_exe_path;
        this.info = {
          version: data.must_version_code,
          releaseNotes: data.must_remark,
          updateType: 'full',
          downloadUrl,
          forceUpdate: true,
        };
        this.setStatus('force-update');
        return this.getStatusSnapshot();
      }

      // 判断是否有可选更新
      if (data.version_code && isVersionGreaterThan(data.version_code, currentVersion)) {
        const is32Bit = platform() === 'win32' && process.arch === 'ia32';
        const downloadUrl = is32Bit && data.exe_path_32 ? data.exe_path_32 : data.exe_path;
        const forceFlag = data.force_update === 1 || data.force_update === true;
        this.info = {
          version: data.version_code,
          releaseNotes: data.remark,
          updateType: 'lite',
          downloadUrl,
          forceUpdate: forceFlag,
        };
        this.setStatus(forceFlag ? 'force-update' : 'available');
        return this.getStatusSnapshot();
      }

      this.setStatus('not-available');
      return this.getStatusSnapshot();
    } catch (err) {
      this.setError(String(err));
      return this.getStatusSnapshot();
    }
  }

  /** 下载更新 */
  async downloadUpdate(): Promise<{ success: boolean; error?: string }> {
    if (!this.info?.downloadUrl) {
      return { success: false, error: '没有可下载的更新' };
    }

    this.setStatus('downloading');
    this.abortController = new AbortController();

    try {
      const fileName = this.info.downloadUrl.split('/').pop() || 'update.exe';
      this.downloadPath = join(app.getPath('downloads'), fileName);

      // 检查是否支持断点续传
      let startByte = 0;
      if (existsSync(this.downloadPath)) {
        const stat = statSync(this.downloadPath);
        startByte = stat.size;
      }

      const headers: Record<string, string> = {};
      if (startByte > 0) {
        headers.Range = `bytes=${startByte}-`;
      }

      const resp = await fetch(this.info.downloadUrl, {
        headers,
        signal: this.abortController.signal,
        redirect: 'follow',
      });

      // 416 = Range Not Satisfiable，从头下载
      if (resp.status === 416) {
        startByte = 0;
        const retryResp = await fetch(this.info.downloadUrl, {
          signal: this.abortController.signal,
        });
        return this.writeDownload(retryResp, startByte);
      }

      if (!resp.ok && resp.status !== 206) {
        this.setError(`下载失败: ${resp.status}`);
        return { success: false, error: `下载失败: ${resp.status}` };
      }

      return this.writeDownload(resp, startByte);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        this.setStatus('idle');
        return { success: false, error: '下载已取消' };
      }
      this.setError(String(err));
      return { success: false, error: String(err) };
    }
  }

  /** 将下载流写入文件 */
  private async writeDownload(resp: Response, startByte: number): Promise<{ success: boolean; error?: string }> {
    if (!this.downloadPath || !resp.body) {
      this.setError('下载路径或响应体无效');
      return { success: false, error: '下载路径或响应体无效' };
    }

    const totalStr = resp.headers.get('content-length');
    const total = totalStr ? parseInt(totalStr, 10) + startByte : 0;
    let transferred = startByte;
    let lastTime = Date.now();
    let lastTransferred = startByte;

    const fileStream = createWriteStream(this.downloadPath, {
      flags: startByte > 0 ? 'a' : 'w',
    });

    const reader = resp.body.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        fileStream.write(Buffer.from(value));
        transferred += value.length;

        const now = Date.now();
        const elapsed = (now - lastTime) / 1000;
        const bytesPerSecond = elapsed > 0.5 ? (transferred - lastTransferred) / elapsed : 0;

        if (elapsed > 0.5) {
          lastTime = now;
          lastTransferred = transferred;
        }

        this.progress = {
          total,
          delta: value.length,
          transferred,
          percent: total > 0 ? Math.round((transferred / total) * 100) : 0,
          bytesPerSecond,
        };

        // 每 500ms 通知一次进度
        if (elapsed > 0.5) {
          this.notifyChange();
        }
      }

      fileStream.end();
      this.setStatus('downloaded');
      return { success: true };
    } catch (err: any) {
      fileStream.destroy();
      if (err.name === 'AbortError') {
        this.setStatus('idle');
        return { success: false, error: '下载已取消' };
      }
      this.setError(String(err));
      return { success: false, error: String(err) };
    }
  }

  /** 取消下载 */
  cancelDownload(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = undefined;
    }
    this.setStatus('idle');
  }

  /** 安装更新并退出 */
  installUpdate(): { success: boolean; error?: string } {
    if (!this.downloadPath || !existsSync(this.downloadPath)) {
      return { success: false, error: '安装包不存在' };
    }

    try {
      // 以独立进程启动安装程序
      spawn(this.downloadPath, [], {
        detached: true,
        stdio: 'ignore',
      }).unref();

      // 退出当前应用
      app.quit();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  /** 设置状态并通知 */
  private setStatus(status: CwwUpdateStatus): void {
    this.status = status;
    this.notifyChange();
  }

  /** 设置错误状态 */
  private setError(message: string): void {
    this.errorMessage = message;
    this.status = 'error';
    this.notifyChange();
  }

  /** 通知状态变更 */
  private notifyChange(): void {
    this.onStatusChange?.(this.getStatusSnapshot());
  }
}

/** 全局单例 */
export const cwwUpdateService = new CwwUpdateService();
