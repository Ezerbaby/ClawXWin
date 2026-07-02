#!/usr/bin/env node
/**
 * sync-custom-extensions.mjs — 从 ClawWin2.0 同步自定义插件到 ClawX
 *
 * 功能：
 *   1. 从 ClawWin2.0/custom-plugins/extensions/ 复制插件到 ClawX/custom-plugins/extensions/
 *   2. 支持 --source 指定源目录（默认为 ../ClawWin2.0）
 *
 * 使用：
 *   node scripts/sync-custom-extensions.mjs              # 同步所有插件
 *   node scripts/sync-custom-extensions.mjs <plugin-name> # 同步指定插件
 *   node scripts/sync-custom-extensions.mjs --source <path> # 指定源目录
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ROOT_DIR = path.join(__dirname, '..')
const DEST_DIR = path.join(ROOT_DIR, 'custom-plugins', 'extensions')

/** 默认从 ClawWin2.0 项目同步 */
const DEFAULT_SOURCE = path.resolve(ROOT_DIR, '..', 'ClawWin2.0')

function log(msg) {
  console.log(`[sync-extensions] ${msg}`)
}

function error(msg) {
  console.error(`[sync-extensions] ERROR: ${msg}`)
}

/** 确保目录存在 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

/** 递归复制目录 */
function copyDir(src, dest) {
  ensureDir(dest)
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath)
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

/** 列出源目录中的所有插件 */
function listPlugins(srcDir) {
  const extDir = path.join(srcDir, 'custom-plugins', 'extensions')
  if (!fs.existsSync(extDir)) return []
  return fs.readdirSync(extDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
}

/** 同步单个插件 */
function syncPlugin(srcDir, pluginName) {
  const srcPlugin = path.join(srcDir, 'custom-plugins', 'extensions', pluginName)
  const destPlugin = path.join(DEST_DIR, pluginName)

  if (!fs.existsSync(srcPlugin)) {
    error(`插件不存在: ${srcPlugin}`)
    return false
  }

  // 清除旧版本再复制
  if (fs.existsSync(destPlugin)) {
    fs.rmSync(destPlugin, { recursive: true, force: true })
  }

  copyDir(srcPlugin, destPlugin)
  log(`已同步: ${pluginName}`)
  return true
}

/** 同步所有插件 */
function syncAll(srcDir) {
  const plugins = listPlugins(srcDir)
  if (plugins.length === 0) {
    log('未找到自定义插件')
    return
  }

  log(`发现 ${plugins.length} 个插件: ${plugins.join(', ')}`)
  ensureDir(DEST_DIR)

  for (const name of plugins) {
    syncPlugin(srcDir, name)
  }
}

function printUsage() {
  console.log(`
使用:
  node scripts/sync-custom-extensions.mjs              # 同步所有插件
  node scripts/sync-custom-extensions.mjs <plugin-name> # 同步指定插件
  node scripts/sync-custom-extensions.mjs --source <path> # 指定源目录

示例:
  node scripts/sync-custom-extensions.mjs aliyun-opensearch-plugin
  node scripts/sync-custom-extensions.mjs --source E:\\project\\ClawWin2.0
`)
}

// ==================== 主流程 ====================

const args = process.argv.slice(2)

if (args.includes('--help') || args.includes('-h')) {
  printUsage()
  process.exit(0)
}

// 解析 --source 参数
let sourceDir = DEFAULT_SOURCE
const sourceIdx = args.indexOf('--source')
if (sourceIdx !== -1 && args[sourceIdx + 1]) {
  sourceDir = path.resolve(args[sourceIdx + 1])
  args.splice(sourceIdx, 2)
}

if (!fs.existsSync(sourceDir)) {
  error(`源目录不存在: ${sourceDir}`)
  error('请确认 ClawWin2.0 项目路径，或使用 --source 指定')
  process.exit(1)
}

log(`源目录: ${sourceDir}`)
log(`目标目录: ${DEST_DIR}`)

if (args.length === 0) {
  syncAll(sourceDir)
} else {
  for (const name of args) {
    syncPlugin(sourceDir, name)
  }
}

log('同步完成!')
