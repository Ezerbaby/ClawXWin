/**
 * CWW SkillHub 商城扩展
 * 替换 ClawHub marketplace，使用鲁南千易 SkillHub API
 */

import type {
  Extension,
  ExtensionContext,
  MarketplaceProviderExtension,
  MarketplaceCapability,
} from '../types';
import type {
  MarketplaceSearchParams,
  MarketplaceInstallParams,
  MarketplaceSkillResult,
} from '../../gateway/clawhub';
import { CwwSkillHubProvider } from '../../gateway/cww-skillhub';

/** CWW SkillHub 商城扩展实现 */
class CwwSkillHubMarketplaceExtension implements MarketplaceProviderExtension {
  readonly id = 'builtin/cww-skillhub-marketplace';
  private provider = new CwwSkillHubProvider();

  setup(_ctx: ExtensionContext): void {
    // CWW SkillHub 初始化，无需额外操作
  }

  async getCapability(): Promise<MarketplaceCapability> {
    return this.provider.getCapability();
  }

  async search(params: MarketplaceSearchParams): Promise<MarketplaceSkillResult[]> {
    return this.provider.search(params);
  }

  async install(params: MarketplaceInstallParams): Promise<void> {
    return this.provider.install(params);
  }
}

/** 创建 CWW SkillHub 商城扩展实例 */
export function createCwwSkillHubMarketplaceExtension(): Extension {
  return new CwwSkillHubMarketplaceExtension();
}
