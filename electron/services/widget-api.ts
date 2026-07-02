/**
 * 桌面悬浮小部件 API
 * 管理 Widget 窗口的显示/隐藏/消息转发
 */

import { BrowserWindow } from 'electron';
import type { HostSuccess, WidgetVisibilityResult } from '../../shared/host-api/contract';

/**
 * 创建 Widget host-api 模块
 * @param deps 依赖注入：获取 Widget 窗口实例的回调
 */
export function createWidgetApi(deps: { getWidgetWindow: () => BrowserWindow | null }) {
  return {
    /** 显示小部件 */
    show: async (): Promise<HostSuccess> => {
      const win = deps.getWidgetWindow();
      if (win) {
        win.show();
        return { success: true };
      }
      return { success: false, error: '小部件窗口未创建' };
    },

    /** 隐藏小部件 */
    hide: async (): Promise<HostSuccess> => {
      const win = deps.getWidgetWindow();
      if (win) {
        win.hide();
        return { success: true };
      }
      return { success: false, error: '小部件窗口未创建' };
    },

    /** 切换可见性 */
    toggle: async (): Promise<HostSuccess> => {
      const win = deps.getWidgetWindow();
      if (win) {
        if (win.isVisible()) {
          win.hide();
        } else {
          win.show();
        }
        return { success: true };
      }
      return { success: false, error: '小部件窗口未创建' };
    },

    /** 查询可见性 */
    isVisible: async (): Promise<WidgetVisibilityResult> => {
      const win = deps.getWidgetWindow();
      return { visible: win ? win.isVisible() : false };
    },

    /** 从小部件发送消息到主窗口 */
    sendMessage: async (payload: { message: string }): Promise<HostSuccess> => {
      // 向所有渲染进程窗口广播消息
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        win.webContents.send('widget:message', payload.message);
      }
      return { success: true };
    },
  };
}
