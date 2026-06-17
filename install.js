#!/usr/bin/env node
// install.js — register the Shitcode Red-Light hook into ~/.claude/settings.json
//
// Safe by design: backs up settings.json first, APPENDS to the PostToolUse array
// (never overwrites existing hooks), and is idempotent (running twice is a no-op).
// Also seeds config.json from config.example.json on first run.
//
// Usage:
//   node install.js            # install (BRAIN_DIR defaults to this repo dir)
//   node install.js --uninstall # remove the hook
//
// After install, open config.json and set "enabled": true to turn it on.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_DIR = __dirname;
const HOOK_CMD = `node ${path.join(REPO_DIR, 'scripts', 'smell-check.js')}`;
const SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
const MATCHER = 'Write|Edit|MultiEdit';

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS, 'utf-8'));
  } catch {
    return {};
  }
}

function backup() {
  if (!fs.existsSync(SETTINGS)) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dst = `${SETTINGS}.bak-brain-${stamp}`;
  fs.copyFileSync(SETTINGS, dst);
  console.log(`  backed up settings → ${dst}`);
}

function hasOurHook(settings) {
  const blocks = (settings.hooks && settings.hooks.PostToolUse) || [];
  return blocks.some((b) =>
    (b.hooks || []).some((h) => (h.command || '').includes('smell-check.js')));
}

function seedConfig() {
  const example = path.join(REPO_DIR, 'config.example.json');
  const target = path.join(process.env.BRAIN_DIR || path.join(os.homedir(), '.claude-brain'), 'config.json');
  if (fs.existsSync(target)) {
    console.log(`  config.json already exists → left untouched (${target})`);
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(example, target);
  console.log(`  seeded config.json → ${target}  (edit it and set enabled:true)`);
}

function install() {
  const settings = readSettings();
  if (hasOurHook(settings)) {
    console.log('✓ hook already installed — nothing to do');
    seedConfig();
    return;
  }
  backup();
  settings.hooks = settings.hooks || {};
  settings.hooks.PostToolUse = settings.hooks.PostToolUse || [];
  settings.hooks.PostToolUse.push({
    matcher: MATCHER,
    hooks: [{ type: 'command', command: HOOK_CMD, timeout: 5 }],
  });
  fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2));
  console.log('✓ registered Shitcode Red-Light hook in settings.json');
  seedConfig();
  console.log('\nNext: open your config.json and set "enabled": true.');
  console.log('Then open a NEW Claude Code session (hooks load at session start).');
}

function uninstall() {
  const settings = readSettings();
  const blocks = (settings.hooks && settings.hooks.PostToolUse) || [];
  backup();
  settings.hooks.PostToolUse = blocks
    .map((b) => ({ ...b, hooks: (b.hooks || []).filter((h) => !(h.command || '').includes('smell-check.js')) }))
    .filter((b) => (b.hooks || []).length > 0);
  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2));
  console.log('✓ removed Shitcode Red-Light hook from settings.json');
}

if (process.argv.includes('--uninstall')) uninstall();
else install();
