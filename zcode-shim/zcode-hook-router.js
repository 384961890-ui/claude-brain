#!/usr/bin/env node
/**
 * zcode-hook-router.js — ZCode host adapter for claude-brain
 *
 * Modes:
 *   inject-context          Explicitly select ZCode's light context mode
 *   post-tool-use           Forward successful tool telemetry
 *   post-tool-use-failure   Mark and forward failed tool telemetry
 *   stop                    Rebuild a full transcript and fan out Stop hooks
 *
 * The router is the only ZCode-specific boundary. Shared scripts remain
 * host-agnostic, and Claude Code never receives the ZCode host signal.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const BRAIN_DIR = process.env.CLAUDE_BRAIN_DIR || path.resolve(__dirname, '..');
const SESSIONS_DIR = path.join(BRAIN_DIR, 'zcode-shim', 'sessions');
const MODE = process.argv[2] || '';

const SCRIPTS = {
  injectContext: path.join(BRAIN_DIR, 'scripts', 'inject-context.js'),
  trackBehavior: path.join(BRAIN_DIR, 'scripts', 'track-behavior.js'),
  stopAudit: path.join(BRAIN_DIR, 'v2', 'scripts', 'stop-audit.js'),
  finishWork: path.join(BRAIN_DIR, 'v2', 'scripts', 'finish-the-work.js'),
  thinkDetect: path.join(BRAIN_DIR, 'v3', 'scripts', 'think-detect.js'),
  captureLesson: path.join(BRAIN_DIR, 'scripts', 'capture-lesson.js'),
  updateState: path.join(BRAIN_DIR, 'scripts', 'update-state.js'),
};

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => (input += chunk));
process.stdin.on('end', () => {
  try {
    if (MODE === 'inject-context') return routeInjectContext(input);
    if (MODE === 'post-tool-use') return routeToolEvent(input, false);
    if (MODE === 'post-tool-use-failure') return routeToolEvent(input, true);
    if (MODE === 'stop') return routeStop(input);
  } catch {}
  process.exit(0);
});
process.stdin.on('error', () => process.exit(0));

function runScript(script, stdin, options = {}) {
  try {
    return spawnSync(process.execPath, [script], {
      input: stdin,
      encoding: 'utf8',
      timeout: options.timeout || 10000,
      env: options.env || process.env,
      maxBuffer: 1024 * 1024,
    });
  } catch {
    return null;
  }
}

function relayValidJson(stdout) {
  const text = (stdout || '').trim();
  if (!text) return;
  try {
    JSON.parse(text);
    process.stdout.write(text);
  } catch {}
}

function routeInjectContext(stdin) {
  const result = runScript(SCRIPTS.injectContext, stdin, {
    env: { ...process.env, CLAUDE_BRAIN_HOST: 'zcode' },
  });
  if (result) relayValidJson(result.stdout);
  process.exit(0);
}

function routeToolEvent(stdin, isFailure) {
  let payload;
  try { payload = JSON.parse(stdin || '{}'); } catch { payload = {}; }
  payload.hook_event_name = isFailure ? 'PostToolUseFailure' : 'PostToolUse';
  payload.hookEventName = payload.hook_event_name;
  runScript(SCRIPTS.trackBehavior, JSON.stringify(payload));
  process.exit(0);
}

function buildTranscript(payload) {
  const sessionId = payload.session_id || payload.sessionId;
  const sessionFile = sessionId && path.join(SESSIONS_DIR, `${sessionId}.jsonl`);
  const lines = [];

  if (sessionFile && fs.existsSync(sessionFile)) {
    const userLines = fs.readFileSync(sessionFile, 'utf8')
      .split('\n')
      .filter(line => line.trim())
      .slice(-100);
    for (const line of userLines) {
      try {
        const message = JSON.parse(line);
        lines.push(JSON.stringify({
          role: 'user',
          content: message.content || '',
          message: {
            role: 'user',
            content: [{ type: 'text', text: message.content || '' }],
          },
        }));
      } catch {}
    }
  }

  const assistantText = payload.responseText || payload.responsePreview || '';
  if (assistantText) {
    lines.push(JSON.stringify({
      role: 'assistant',
      content: [{ type: 'text', text: assistantText }],
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: assistantText }],
      },
    }));
  }

  if (lines.length === 0) return null;
  const file = path.join(os.tmpdir(), `zcode-brain-${process.pid}-${Date.now()}.jsonl`);
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
  return file;
}

function routeStop(stdin) {
  let payload;
  try { payload = JSON.parse(stdin || '{}'); } catch { payload = {}; }

  let transcriptPath = null;
  let finishOutput = '';
  try {
    transcriptPath = buildTranscript(payload);
    const adapted = transcriptPath
      ? { ...payload, transcript_path: transcriptPath, transcriptPath }
      : payload;
    const adaptedInput = JSON.stringify(adapted);

    if (transcriptPath) {
      runScript(SCRIPTS.stopAudit, adaptedInput);
      const finish = runScript(SCRIPTS.finishWork, adaptedInput);
      if (finish) finishOutput = finish.stdout || '';
      runScript(SCRIPTS.thinkDetect, adaptedInput);
      runScript(SCRIPTS.captureLesson, adaptedInput, { timeout: 12000 });
    }
  } catch {} finally {
    runScript(SCRIPTS.updateState, JSON.stringify(payload));
    if (transcriptPath) {
      try { fs.unlinkSync(transcriptPath); } catch {}
    }
  }

  relayValidJson(finishOutput);
  process.exit(0);
}
