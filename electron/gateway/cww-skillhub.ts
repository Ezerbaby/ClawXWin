/**
 * CWW SkillHub 技能商城服务
 * 替换 ClawHub，使用鲁南千易 SkillHub API
 * 实现 MarketplaceProvider 接口
 */

import { CWW_CONFIG } from '../utils/config';
import { getOpenClawSkillsDir, ensureDir } from '../utils/paths';
import type { MarketplaceProvider, MarketplaceSearchParams, MarketplaceInstallParams, MarketplaceSkillResult } from './clawhub';

/** SkillHub 搜索结果项 */
interface SkillHubItem {
  id: number;
  slug: string;
  displayName: string;
  summary?: string;
  status?: string;
  namespace?: string;
  downloadCount?: number;
}

/** SkillHub 搜索结果 */
interface SkillHubSearchResponse {
  code: number;
  msg?: string;
  data?: {
    items: SkillHubItem[];
    total: number;
    page: number;
    size: number;
  };
}

/**
 * CWW SkillHub 技能商城提供商
 * 实现 MarketplaceProvider 接口，与 ClawHubService 兼容
 */
export class CwwSkillHubProvider implements MarketplaceProvider {
  /** 获取能力信息 */
  async getCapability(): Promise<{ mode: string; canSearch: boolean; canInstall: boolean; reason?: string }> {
    const serverUrl = CWW_CONFIG.SKILL_STORE_URL;
    if (!serverUrl) {
      return {
        mode: 'cww-skillhub',
        canSearch: false,
        canInstall: false,
        reason: 'CWW SkillHub 地址未配置',
      };
    }
    return {
      mode: 'cww-skillhub',
      canSearch: true,
      canInstall: true,
    };
  }

  /** 搜索技能 */
  async search(params: MarketplaceSearchParams): Promise<MarketplaceSkillResult[]> {
    const serverUrl = CWW_CONFIG.SKILL_STORE_URL;
    if (!serverUrl) return [];

    try {
      const url = `${serverUrl}/api/web/skills?q=${encodeURIComponent(params.query)}&size=${params.limit ?? 20}`;
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!resp.ok) return [];

      const json: SkillHubSearchResponse = await resp.json();
      const items = json.data?.items ?? [];

      return items.map((item) => ({
        slug: `${item.namespace ?? 'default'}/${item.slug}`,
        name: item.displayName,
        description: item.summary ?? '',
        version: 'latest',
        author: item.namespace,
        downloads: item.downloadCount,
      }));
    } catch {
      return [];
    }
  }

  /** 安装技能（下载 ZIP 并解压到 skills 目录） */
  async install(params: MarketplaceInstallParams): Promise<void> {
    const serverUrl = CWW_CONFIG.SKILL_STORE_URL;
    if (!serverUrl) throw new Error('CWW SkillHub 地址未配置');

    const [namespace, slug] = params.slug.includes('/')
      ? params.slug.split('/')
      : ['default', params.slug];

    const downloadUrl = `${serverUrl}/api/web/skills/${namespace}/${slug}/download`;

    // 下载 ZIP
    const resp = await fetch(downloadUrl, {
      signal: AbortSignal.timeout(120_000),
    });
    if (!resp.ok) {
      throw new Error(`下载技能失败: ${resp.status}`);
    }

    // 保存到临时文件
    const arrayBuffer = await resp.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 解压到 skills 目录
    const skillsDir = getOpenClawSkillsDir();
    ensureDir(skillsDir);

    const installDirName = sanitizeSkillDirName(slug);
    const installPath = `${skillsDir}/${installDirName}`;

    // 使用 extract-zip（需要动态 import）
    try {
      const extractZip = (await import('extract-zip')).default;
      // 先写入临时 ZIP 文件
      const tmpZipPath = `${installPath}.zip`;
      const { writeFileSync, unlinkSync } = await import('fs');
      writeFileSync(tmpZipPath, buffer);

      // 清除旧安装
      const { rmSync, existsSync } = await import('fs');
      if (existsSync(installPath)) {
        rmSync(installPath, { recursive: true, force: true });
      }

      // 解压
      await extractZip(tmpZipPath, { dir: installPath });

      // 删除临时 ZIP
      unlinkSync(tmpZipPath);
    } catch (err) {
      throw new Error(`解压技能失败: ${err}`);
    }
  }
}

/** 清理技能目录名（防止路径注入） */
function sanitizeSkillDirName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}
