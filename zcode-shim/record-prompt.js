#!/usr/bin/env node
// record-prompt.js — ZCode shim (UserPromptSubmit)
// ZCode 的 Stop hook transcript 只含最后一条 assistant 回复、没有 user 消息，
// capture-lesson 靠扫 user 纠正信号，在 ZCode 下会瞎。
// 此 shim 每轮把 prompt 记进 sessions/<session_id>.jsonl，Stop 时由 stop-transcript-bridge.js 拼回完整 transcript。
// 失败策略：静默退出，绝不阻塞主流程。
const fs = require('fs');
const path = require('path');

const SESSIONS_DIR = path.join(__dirname, 'sessions');
const MAX_BYTES = 200 * 1024; // ponytail: 超 200KB 截到最后 100 行，防长 session 膨胀

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => (input += c));
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const sessionId = data.session_id || data.sessionId;
    const prompt = data.prompt;
    if (sessionId && typeof prompt === 'string' && prompt.trim()) {
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
      const file = path.join(SESSIONS_DIR, `${sessionId}.jsonl`);
      fs.appendFileSync(file, JSON.stringify({ role: 'user', content: prompt, ts: Date.now() }) + '\n');
      const stat = fs.statSync(file);
      if (stat.size > MAX_BYTES) {
        const lines = fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim());
        fs.writeFileSync(file, lines.slice(-100).join('\n') + '\n');
      }
    }
  } catch {}
  process.stdout.write('{}');
  process.exit(0);
});
process.stdin.on('error', () => process.exit(0));
