/**
 * Application Configuration
 * Centralized configuration constants and helpers
 */

/**
 * Port configuration
 */
export const PORTS = {
  /** ClawX GUI development server port */
  CLAWX_DEV: 5173,
  
  /** ClawX GUI production port (for reference) */
  CLAWX_GUI: 23333,

  /** Local host API server port */
  CLAWX_HOST_API: 13210,
  
  /** OpenClaw Gateway port */
  OPENCLAW_GATEWAY: 18789,
} as const;

/**
 * Get port from environment or default
 */
export function getPort(key: keyof typeof PORTS): number {
  const envKey = `CLAWX_PORT_${key}`;
  const envValue = process.env[envKey];
  return envValue ? parseInt(envValue, 10) : PORTS[key];
}

/**
 * Application paths
 */
export const APP_PATHS = {
  /** OpenClaw configuration directory */
  OPENCLAW_CONFIG: '~/.openclaw',
  
  /** ClawX configuration directory */
  CLAWX_CONFIG: '~/.clawx',
  
  /** Log files directory */
  LOGS: '~/.clawx/logs',
} as const;

/**
 * Update channels
 */
export const UPDATE_CHANNELS = ['stable', 'beta', 'dev'] as const;
export type UpdateChannel = (typeof UPDATE_CHANNELS)[number];

/**
 * Default update configuration
 */
export const UPDATE_CONFIG = {
  /** Check interval in milliseconds (6 hours) */
  CHECK_INTERVAL: 6 * 60 * 60 * 1000,
  
  /** Default update channel */
  DEFAULT_CHANNEL: 'stable' as UpdateChannel,
  
  /** Auto download updates */
  AUTO_DOWNLOAD: false,
  
  /** Show update notifications */
  SHOW_NOTIFICATION: true,
};

/**
 * CWW（鲁南千易）后端 API 配置
 * 从环境变量读取，支持 .env 文件配置
 */
export const CWW_CONFIG = {
  /** CWW 后端 API 基础地址（认证/遥测/欢迎页/模型配置） */
  get API_BASE_URL(): string {
    return process.env.VITE_CWW_API_BASE_URL || '';
  },

  /** CWW 版本检查与更新下载服务地址 */
  get UPDATE_SERVER_URL(): string {
    return process.env.VITE_CWW_UPDATE_SERVER_URL || '';
  },

  /** CWW SkillHub 技能商城服务地址 */
  get SKILL_STORE_URL(): string {
    return process.env.VITE_CWW_SKILL_STORE_URL || '';
  },

  /** 阿里云 OpenSearch 等集成凭证接口路径（拼接在 API_BASE_URL 之后） */
  get CREDENTIALS_PATH(): string {
    return process.env.VITE_CWW_CREDENTIALS_PATH || '/integrations/credentials';
  },
};

/**
 * Gateway configuration
 */
export const GATEWAY_CONFIG = {
  /** WebSocket reconnection delay (ms) */
  RECONNECT_DELAY: 5000,
  
  /** RPC call timeout (ms) */
  RPC_TIMEOUT: 30000,
  
  /** Health check interval (ms) */
  HEALTH_CHECK_INTERVAL: 30000,
  
  /** Maximum startup retries */
  MAX_STARTUP_RETRIES: 30,
  
  /** Startup retry interval (ms) */
  STARTUP_RETRY_INTERVAL: 1000,
};
