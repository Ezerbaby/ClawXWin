/**
 * CWW 欢迎页模板状态管理
 * 从鲁南千易后端拉取欢迎页 Tab + Card 数据
 */
import { create } from 'zustand';
import { hostApi } from '@/lib/host-api';
import type { CwwWelcomeCard, CwwWelcomeTab } from '@shared/host-api/contract';

/** 欢迎页 Card（从 contract 类型重新导出） */
export type { CwwWelcomeCard, CwwWelcomeTab };

interface CwwWelcomeState {
  /** Tab 列表 */
  tabs: CwwWelcomeTab[];
  /** 是否正在加载 */
  loading: boolean;
  /** 当前选中的 Tab ID */
  activeTabId: number | null;

  /** 拉取欢迎页数据 */
  fetchTabs: () => Promise<void>;
  /** 切换 Tab */
  setActiveTab: (tabId: number) => void;
}

export const useCwwWelcomeStore = create<CwwWelcomeState>((set, _get) => ({
  tabs: [],
  loading: false,
  activeTabId: null,

  fetchTabs: async () => {
    // 开始加载，置 loading 标记
    set({ loading: true });
    try {
      const result = await hostApi.cwwWelcome.fetchTabs();
      const tabs = result.tabs ?? [];
      set({
        tabs,
        loading: false,
        // 默认选中第一个 Tab
        activeTabId: tabs.length > 0 ? tabs[0].id : null,
      });
    } catch {
      // 请求失败时静默恢复，前端 fallback 到默认欢迎语
      set({ loading: false });
    }
  },

  setActiveTab: (tabId: number) => {
    set({ activeTabId: tabId });
  },
}));
