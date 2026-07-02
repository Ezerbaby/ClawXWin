/**
 * 桌面悬浮小部件窗口管理
 * 透明、置顶、无边框、鼠标穿透
 */

import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';
import { logger } from '../utils/logger';

/** Widget 窗口实例引用 */
let widgetWindow: BrowserWindow | null = null;

/** 获取 Widget 窗口实例 */
export function getWidgetWindow(): BrowserWindow | null {
  return widgetWindow;
}

/**
 * 创建 Widget 窗口
 * @param mainWindow 主窗口实例，用于焦点回切
 */
export async function createWidgetWindow(mainWindow: BrowserWindow): Promise<BrowserWindow> {
  // 如果窗口已存在且未销毁，直接显示并返回
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.show();
    return widgetWindow;
  }

  // 获取主显示器工作区尺寸，用于定位 Widget 到右上角
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth } = primaryDisplay.workAreaSize;

  widgetWindow = new BrowserWindow({
    width: 300,
    height: 400,
    x: screenWidth - 330,
    y: 100,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, '../preload/index.js'),
    },
  });

  // 开发模式加载 dev server，生产模式加载打包文件
  if (process.env.VITE_DEV_SERVER_URL) {
    await widgetWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/widget`);
  } else {
    await widgetWindow.loadFile(join(__dirname, '../../dist/index.html'), { hash: '/widget' });
  }

  // 鼠标穿透模式（默认穿透，悬浮交互区域时关闭）
  widgetWindow.setIgnoreMouseEvents(true, { forward: true });

  // 监听来自 Widget 渲染进程的鼠标事件控制
  widgetWindow.webContents.on('ipc-message', (_event, channel, ...args) => {
    if (channel === 'widget:setIgnoreMouseEvents') {
      // 切换鼠标穿透状态
      const ignore = args[0] as boolean;
      widgetWindow?.setIgnoreMouseEvents(ignore, { forward: !ignore });
    } else if (channel === 'widget:moveBy') {
      // 按偏移量移动窗口（拖拽移动）
      const [dx, dy] = args as [number, number];
      if (widgetWindow) {
        const [x, y] = widgetWindow.getPosition();
        widgetWindow.setPosition(x + dx, y + dy);
      }
    } else if (channel === 'widget:openMainWindow') {
      // 激活主窗口
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });

  widgetWindow.on('closed', () => {
    logger.debug('Widget 窗口已关闭');
    widgetWindow = null;
  });

  return widgetWindow;
}

/** 销毁 Widget 窗口 */
export function destroyWidgetWindow(): void {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.destroy();
    widgetWindow = null;
  }
}
