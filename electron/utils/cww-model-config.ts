/**
 * CWW 模型配置映射工具
 * 将鲁南千易后端下发的 model_config 转换为 Gateway 环境变量
 * 以及 agent auth-profiles 格式
 */

import type { CwwModelConfig } from '../../shared/host-api/contract';

/** 内存缓存，避免重复拉取 */
let cachedConfig: CwwModelConfig | null = null;

/**
 * 将 CWW model_config 映射为 Gateway forkEnv 环境变量
 * 优先级：用户手动 API Key > CWW model_config > 无配置
 */
export function mapModelConfigToEnv(config: CwwModelConfig): Record<string, string> {
  const env: Record<string, string> = {};

  // 注入 API Key（运行时内存，不落盘）
  if (config.api_key) {
    env.OPENAI_API_KEY = config.api_key;
  }

  // 注入 base URL
  if (config.base_url) {
    env.OPENAI_BASE_URL = config.base_url;
  }

  // 注入默认模型标识
  if (config.model_id) {
    env.CWW_DEFAULT_MODEL = config.model_id;
  }

  return env;
}

/**
 * 从 model_config 推导 OpenClaw provider key
 * 用于 saveProviderKeyToOpenClaw 写入 agent 目录
 */
export function getProviderKeyFromModelConfig(config: CwwModelConfig): string | null {
  if (!config.api_key) return null;
  // 根据 provider 字段或 api_format 推断
  const provider = config.provider?.toLowerCase() ?? '';
  if (provider.includes('openai') || !provider) return 'openai';
  if (provider.includes('anthropic')) return 'anthropic';
  if (provider.includes('deepseek')) return 'deepseek';
  if (provider.includes('moonshot')) return 'moonshot';
  // 自定义 provider
  return provider || 'custom';
}

/** 设置内存缓存 */
export function setCachedModelConfig(config: CwwModelConfig | null): void {
  cachedConfig = config;
}

/** 获取内存缓存 */
export function getCachedModelConfig(): CwwModelConfig | null {
  return cachedConfig;
}
