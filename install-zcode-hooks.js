#!/usr/bin/env node
/**
 * Idempotently reconcile claude-brain hooks in ~/.zcode/cli/config.json.
 * Unrelated hooks, plugins, MCP servers, and settings are preserved.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const home = os.homedir();
const configPath = process.env.ZCODE_CONFIG_PATH || path.join(home, '.zcode', 'cli', 'config.json');
const brainDir = process.env.CLAUDE_BRAIN_DIR || path.join(home, '.claude-brain');
const nodeBin = process.env.CLAUDE_BRAIN_NODE || process.execPath;
const router = path.join(brainDir, 'zcode-shim', 'zcode-hook-router.js');

if (!fs.existsSync(configPath)) fail(`${configPath} does not exist`);
if (!fs.existsSync(router)) fail(`${router} does not exist`);

let config;
try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); }
catch (error) { fail(`cannot parse ${configPath}: ${error.message}`); }

const hooks = config.hooks || (config.hooks = {});
hooks.enabled = true;
const events = hooks.events || (hooks.events = {});
const before = fs.readFileSync(configPath, 'utf8');
const configuredBrainRoots = new Set([brainDir, path.join(home, '.claude-brain')]);
for (const groups of Object.values(events)) {
  for (const group of groups || []) {
    for (const hook of group.hooks || []) {
      for (const arg of Array.isArray(hook.args) ? hook.args : []) {
        if (typeof arg !== 'string' || !path.isAbsolute(arg)) continue;
        const marker = `${path.sep}.claude-brain${path.sep}`;
        const index = arg.indexOf(marker);
        if (index >= 0) configuredBrainRoots.add(arg.slice(0, index + marker.length - 1));
      }
    }
  }
}
const runtimeRoots = [...configuredBrainRoots];

const ownedTargets = new Set(runtimeRoots.flatMap(root => [
  path.join(root, 'scripts', 'debug-up.js'),
  path.join(root, 'scripts', 'inject-context.js'),
  path.join(root, 'scripts', 'track-behavior.js'),
  path.join(root, 'v2', 'scripts', 'stop-audit.js'),
  path.join(root, 'v2', 'scripts', 'finish-the-work.js'),
  path.join(root, 'v3', 'scripts', 'think-detect.js'),
  path.join(root, 'zcode-shim', 'stop-transcript-bridge.js'),
  path.join(root, 'scripts', 'capture-lesson.js'),
  path.join(root, 'scripts', 'update-state.js'),
  path.join(root, 'zcode-shim', 'zcode-hook-router.js'),
]));

const isBrainRuntimePath = value =>
  typeof value === 'string' && value.includes(`${path.sep}.claude-brain${path.sep}`);
const isLegacyBrainHook = value =>
  isBrainRuntimePath(value) && [
    `${path.sep}scripts${path.sep}debug-up.js`,
    `${path.sep}scripts${path.sep}inject-context.js`,
    `${path.sep}scripts${path.sep}track-behavior.js`,
    `${path.sep}v2${path.sep}scripts${path.sep}stop-audit.js`,
    `${path.sep}v2${path.sep}scripts${path.sep}finish-the-work.js`,
    `${path.sep}v3${path.sep}scripts${path.sep}think-detect.js`,
    `${path.sep}zcode-shim${path.sep}stop-transcript-bridge.js`,
    `${path.sep}zcode-shim${path.sep}record-prompt.js`,
    `${path.sep}scripts${path.sep}capture-lesson.js`,
    `${path.sep}scripts${path.sep}update-state.js`,
    `${path.sep}zcode-shim${path.sep}zcode-hook-router.js`,
  ].some(suffix => value.endsWith(suffix));

function hookIsOwned(hook) {
  const args = Array.isArray(hook.args) ? hook.args : [];
  if (args.some(arg => {
    if (typeof arg !== 'string' || !path.isAbsolute(arg)) return false;
    const normalized = path.normalize(arg);
    return ownedTargets.has(normalized) || isLegacyBrainHook(normalized);
  })) return true;
  return typeof hook.command === 'string' && (
    [...ownedTargets].some(target => hook.command.includes(target)) ||
    isLegacyBrainHook(hook.command)
  );
}

for (const event of ['UserPromptSubmit', 'PostToolUse', 'PostToolUseFailure', 'Stop']) {
  events[event] = (events[event] || []).flatMap(group => {
    const remaining = (group.hooks || []).filter(hook => !hookIsOwned(hook));
    return remaining.length > 0 ? [{ ...group, hooks: remaining }] : [];
  });
}

function directProcess(script, timeoutMs) {
  return {
    hooks: [{
      type: 'process',
      command: nodeBin,
      args: [script],
      timeoutMs,
    }],
  };
}

function processHook(mode, timeoutMs) {
  return {
    hooks: [{
      type: 'process',
      command: nodeBin,
      args: [router, mode],
      timeoutMs,
    }],
  };
}

events.UserPromptSubmit.push(directProcess(path.join(brainDir, 'zcode-shim', 'record-prompt.js'), 5000));
events.UserPromptSubmit.push(processHook('inject-context', 10000));
events.PostToolUse.push(processHook('post-tool-use', 10000));
events.PostToolUseFailure.push(processHook('post-tool-use-failure', 10000));
events.Stop.push(processHook('stop', 15000));

const after = `${JSON.stringify(config, null, 2)}\n`;
if (before === after) {
  process.stdout.write('ZCode hooks already up to date\n');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
const backup = `${configPath}.bak-brain-${stamp}`;
const tmp = `${configPath}.tmp-${process.pid}`;
fs.copyFileSync(configPath, backup);
fs.writeFileSync(tmp, after, { mode: 0o600 });
fs.renameSync(tmp, configPath);
process.stdout.write(`ZCode hooks updated; backup: ${backup}\n`);

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
