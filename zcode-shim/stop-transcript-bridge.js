#!/usr/bin/env node
// stop-transcript-bridge.js — ZCode shim (Stop)
// 用 record-prompt.js 记录的 user 消息 + ZCode 给的 responseText 拼一份 CC 风格
// 完整 transcript，替换 stdin 里的 transcript_path 后原样转喂 capture-lesson.js。
// 原脚本零改动；拼不出来就原 stdin 直通（行为不变差）。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CAPTURE = path.join(__dirname, '..', 'scripts', 'capture-lesson.js');
const SESSIONS_DIR = path.join(__dirname, 'sessions');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => (input += c));
process.stdin.on('end', () => {
  let stdinForChild = input;
  let tmpFile = null;
  try {
    const data = JSON.parse(input);
    const sessionId = data.session_id || data.sessionId;
    const sessFile = sessionId && path.join(SESSIONS_DIR, `${sessionId}.jsonl`);
    if (sessFile && fs.existsSync(sessFile)) {
      const userLines = fs.readFileSync(sessFile, 'utf8').split('\n').filter(l => l.trim()).slice(-100);
      const assistantText = data.responseText || data.responsePreview || '';
      const assistantLine = JSON.stringify({
        message: { role: 'assistant', content: [{ type: 'text', text: assistantText }] }
      });
      tmpFile = path.join(os.tmpdir(), `zcode-shim-${process.pid}-${Date.now()}.jsonl`);
      fs.writeFileSync(tmpFile, userLines.join('\n') + '\n' + assistantLine + '\n');
      stdinForChild = JSON.stringify({ ...data, transcript_path: tmpFile, transcriptPath: tmpFile });
    }
  } catch {}
  try {
    const r = spawnSync(process.execPath, [CAPTURE], { input: stdinForChild, encoding: 'utf8', timeout: 12000 });
    if (r.stdout) process.stdout.write(r.stdout);
  } catch {}
  if (tmpFile) { try { fs.unlinkSync(tmpFile); } catch {} }
  process.exit(0);
});
process.stdin.on('error', () => process.exit(0));
