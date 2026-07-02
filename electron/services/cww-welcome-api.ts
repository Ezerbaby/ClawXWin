/**
 * CWW 欢迎页 API
 * 从鲁南千易后端拉取欢迎页 Tab + Card 模板数据
 * 含内存缓存，15 分钟 TTL
 */

import { CWW_CONFIG } from '../utils/config';
import type {
  CwwWelcomeTab,
  HostSuccess,
} from '../../shared/host-api/contract';

/** 缓存 TTL：15 分钟 */
const CACHE_TTL_MS = 15 * 60 * 1000;

/** 内存缓存 */
let cachedTabs: CwwWelcomeTab[] | null = null;
let cachedAt = 0;

/**
 * 创建 CWW 欢迎页 host-api 模块
 */
export function createCwwWelcomeApi() {
  return {
    /** 获取欢迎页 Tab + Card 数据 */
    fetchTabs: async (): Promise<HostSuccess & { tabs?: CwwWelcomeTab[] }> => {
      // 命中缓存直接返回
      if (cachedTabs && Date.now() - cachedAt < CACHE_TTL_MS) {
        return { success: true, tabs: cachedTabs };
      }

      const baseUrl = CWW_CONFIG.API_BASE_URL;
      if (!baseUrl) return { success: true, tabs: undefined };

      try {
        const resp = await fetch(`${baseUrl}/welcome`, {
          signal: AbortSignal.timeout(10_000),
        });
        if (!resp.ok) return { success: true, tabs: undefined };

        const json = await resp.json();
        const data = json.data ?? json;
        const tabs: CwwWelcomeTab[] = Array.isArray(data) ? data : [];

        // 更新缓存
        cachedTabs = tabs;
        cachedAt = Date.now();

        return { success: true, tabs };
      } catch {
        // API 不可用时返回空，前端 fallback 到默认欢迎语
        return { success: true, tabs: undefined };
      }
    },
  };
}
