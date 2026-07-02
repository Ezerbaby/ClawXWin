/**
 * 桌面悬浮小部件页面
 * 透明、置顶、无边框的浮动助手
 * 功能：可拖拽图标、悬停展开输入、发送消息到主窗口、右键菜单
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { hostApi } from '@/lib/host-api';
import { cn } from '@/lib/utils';

/** 拖拽状态 */
interface DragState {
  /** 是否正在拖拽 */
  dragging: boolean;
  /** 拖拽起始位置 X */
  startX: number;
  /** 拖拽起始位置 Y */
  startY: number;
}

/**
 * 爪印 SVG 图标组件
 * 用作悬浮小部件的默认浮动图标
 */
function PawIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="currentColor"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* 主掌心 */}
      <ellipse cx="24" cy="32" rx="10" ry="9" />
      {/* 上左趾 */}
      <ellipse cx="10" cy="18" rx="5" ry="7" transform="rotate(-15 10 18)" />
      {/* 上中左趾 */}
      <ellipse cx="19" cy="11" rx="4.5" ry="6.5" transform="rotate(-5 19 11)" />
      {/* 上中右趾 */}
      <ellipse cx="29" cy="11" rx="4.5" ry="6.5" transform="rotate(5 29 11)" />
      {/* 上右趾 */}
      <ellipse cx="38" cy="18" rx="5" ry="7" transform="rotate(15 38 18)" />
    </svg>
  );
}

/**
 * 右键菜单项
 */
interface ContextMenuItem {
  /** 显示文本 */
  label: string;
  /** 点击回调 */
  onClick: () => void;
}

/**
 * 右键上下文菜单组件
 */
function ContextMenu({
  items,
  position,
  onClose,
}: {
  items: ContextMenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
}) {
  // 点击空白处关闭菜单
  useEffect(() => {
    const handleClick = () => onClose();
    const handleContextMenu = () => onClose();
    // 延迟绑定，避免当前右键事件立刻触发关闭
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClick);
      document.addEventListener('contextmenu', handleContextMenu);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClick);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [onClose]);

  return (
    <div
      className="fixed z-50 min-w-[140px] rounded-lg border border-black/10 bg-white/95 py-1 shadow-lg backdrop-blur-sm dark:border-white/10 dark:bg-neutral-800/95"
      style={{ left: position.x, top: position.y }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          className="w-full px-3 py-1.5 text-left text-sm text-neutral-700 transition-colors hover:bg-black/5 dark:text-neutral-200 dark:hover:bg-white/10"
          onClick={(e) => {
            e.stopPropagation();
            item.onClick();
            onClose();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Widget 悬浮小部件主页面
 */
export default function WidgetPage() {
  const { t } = useTranslation('cww');

  /** 是否处于展开状态（输入区域可见） */
  const [expanded, setExpanded] = useState(false);
  /** 输入框文本 */
  const [inputText, setInputText] = useState('');
  /** 是否正在发送消息 */
  const [sending, setSending] = useState(false);
  /** 拖拽状态 */
  const [drag, setDrag] = useState<DragState>({ dragging: false, startX: 0, startY: 0 });
  /** 右键菜单位置（null 表示菜单关闭） */
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);

  /** 输入框引用 */
  const inputRef = useRef<HTMLInputElement>(null);

  // ========== 鼠标穿透控制 ==========

  /** 通知主进程关闭鼠标穿透（进入交互模式） */
  const enableInteraction = useCallback(() => {
    window.electron?.ipcRenderer.send?.('widget:setIgnoreMouseEvents', false);
  }, []);

  /** 通知主进程开启鼠标穿透（退出交互模式） */
  const disableInteraction = useCallback(() => {
    window.electron?.ipcRenderer.send?.('widget:setIgnoreMouseEvents', true);
  }, []);

  // ========== 拖拽移动 ==========

  /** 鼠标按下开始拖拽 */
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      // 仅左键拖拽
      if (e.button !== 0) return;
      e.preventDefault();
      setDrag({ dragging: true, startX: e.clientX, startY: e.clientY });
    },
    [],
  );

  /** 鼠标移动时通知主进程移动窗口 */
  useEffect(() => {
    if (!drag.dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      // 每次移动后重置起始点，实现相对拖拽
      window.electron?.ipcRenderer.send?.('widget:moveBy', dx, dy);
    };

    const handleMouseUp = () => {
      setDrag((prev) => ({ ...prev, dragging: false }));
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [drag.dragging, drag.startX, drag.startY]);

  // ========== 展开/收起交互 ==========

  /** 鼠标进入小部件区域时展开 */
  const handleMouseEnter = useCallback(() => {
    enableInteraction();
    setExpanded(true);
  }, [enableInteraction]);

  /** 鼠标离开小部件区域时收起 */
  const handleMouseLeave = useCallback(() => {
    // 拖拽中不收起
    if (drag.dragging) return;
    setExpanded(false);
    setInputText('');
    disableInteraction();
  }, [drag.dragging, disableInteraction]);

  // 展开时自动聚焦输入框
  useEffect(() => {
    if (expanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [expanded]);

  // ========== 发送消息 ==========

  /** 发送消息到主窗口 */
  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || sending) return;

    setSending(true);
    try {
      await hostApi.widget.sendMessage(text);
      setInputText('');
      // 发送后收起面板
      setExpanded(false);
      disableInteraction();
    } catch {
      // 发送失败静默处理
    } finally {
      setSending(false);
    }
  }, [inputText, sending, disableInteraction]);

  /** 输入框按键事件处理 */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      } else if (e.key === 'Escape') {
        setExpanded(false);
        setInputText('');
        disableInteraction();
      }
    },
    [handleSend, disableInteraction],
  );

  // ========== 右键菜单 ==========

  /** 打开右键菜单 */
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      enableInteraction();
      setContextMenuPos({ x: e.clientX, y: e.clientY });
    },
    [enableInteraction],
  );

  /** 打开主窗口 */
  const handleOpenMainWindow = useCallback(() => {
    window.electron?.ipcRenderer.send?.('widget:openMainWindow');
  }, []);

  /** 关闭小部件（隐藏到后台） */
  const handleCloseWidget = useCallback(async () => {
    try {
      await hostApi.widget.hide();
    } catch {
      // 静默处理
    }
    disableInteraction();
  }, [disableInteraction]);

  /** 右键菜单项定义 */
  const contextMenuItems: ContextMenuItem[] = [
    { label: t('widget.openMain'), onClick: handleOpenMainWindow },
    { label: t('widget.close'), onClick: handleCloseWidget },
  ];

  // ========== 页面挂载时初始化 ==========

  useEffect(() => {
    // 页面加载时开启鼠标穿透，等待用户悬停
    disableInteraction();
  }, [disableInteraction]);

  // ========== 渲染 ==========

  return (
    <div
      className="relative flex h-screen w-screen select-none flex-col items-center justify-center overflow-hidden bg-transparent"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
    >
      {/* 悬浮图标 — 收起状态可见，展开时隐藏 */}
      <div
        className={cn(
          'flex cursor-grab items-center justify-center rounded-full transition-all duration-300',
          'bg-white/80 shadow-lg backdrop-blur-md dark:bg-neutral-800/80',
          expanded ? 'h-0 w-0 opacity-0' : 'h-14 w-14 opacity-100',
          drag.dragging && 'cursor-grabbing',
        )}
        onMouseDown={handleDragStart}
      >
        <PawIcon className="h-8 w-8 text-violet-600 dark:text-violet-400" />
      </div>

      {/* 展开的交互面板 */}
      <div
        className={cn(
          'flex w-[280px] flex-col gap-3 rounded-2xl p-4 transition-all duration-300',
          'bg-white/90 shadow-xl backdrop-blur-md dark:bg-neutral-800/90',
          expanded
            ? 'scale-100 opacity-100'
            : 'pointer-events-none scale-95 opacity-0',
        )}
      >
        {/* 标题栏 + 拖拽把手 */}
        <div
          className="flex cursor-grab items-center gap-2"
          onMouseDown={handleDragStart}
        >
          <PawIcon className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
            {t('widget.title')}
          </span>
        </div>

        {/* 输入区域 */}
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('widget.placeholder')}
            disabled={sending}
            className={cn(
              'flex-1 rounded-lg border border-black/10 px-3 py-2 text-sm',
              'bg-surface-input text-neutral-800 placeholder:text-neutral-400',
              'outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30',
              'dark:border-white/10 dark:text-neutral-100 dark:placeholder:text-neutral-500',
              sending && 'opacity-60',
            )}
          />
          {/* 发送按钮 */}
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sending || !inputText.trim()}
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              'bg-violet-600 text-white transition-colors',
              'hover:bg-violet-700 active:bg-violet-800',
              'disabled:cursor-not-allowed disabled:opacity-40',
              'dark:bg-violet-500 dark:hover:bg-violet-600 dark:active:bg-violet-700',
            )}
            aria-label={t('widget.title')}
          >
            {sending ? (
              /* 发送中旋转指示器 */
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            ) : (
              /* 发送箭头图标 */
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            )}
          </button>
        </div>

        {/* 处理中提示 */}
        {sending && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {t('widget.processing')}
          </p>
        )}
      </div>

      {/* 右键上下文菜单 */}
      {contextMenuPos && (
        <ContextMenu
          items={contextMenuItems}
          position={contextMenuPos}
          onClose={() => setContextMenuPos(null)}
        />
      )}
    </div>
  );
}
