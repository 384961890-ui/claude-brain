#!/usr/bin/env node
/**
 * capture-lesson.js — claude-brain v2.0 教训捕获器
 *
 * Hook: Stop
 *
 * 输入: stdin JSON { session_id, transcript_path, ... }
 * 输出: 无（静默）
 *
 * 策略: 启发式扫描 transcript 末尾用户消息，检测纠正信号，写一条 draft lesson
 *       不调 LLM（保证速度+零成本+不阻塞 Stop hook）
 *       Draft 状态，需用户后续 promote 为 confirmed
 */

const fs = require('fs');
const path = require('path');
const {
  BRAIN_DIR, loadConfig, readFileSafe, writeFileAtomic, nowISO, debugLog
} = require('./util.js');

const config = loadConfig();

// 纠正信号词（高准确率优先，低误报）
const CORRECTION_PATTERNS = [
  /不是这样|又犯|又这样|搞错了|纠正你|纠正我|你错了|不对/,
  /(?:我|你)之前(?:说|告诉|提过|讲过)过?/,
  /你(?:应该|不应该)/,
  /(?:为什么|为啥)(?:你|泡咪)(?:总是|又|这样|又一次)/,
  /(?:不要|别)再/,
  /我(?:发现|觉得|跟你说)你(?:每次|总是|又|这样)/,
  /(?:降级|降智|又掉|掉进)/  // 思维降级类纠正
];

// 强正面信号 — 出现就重置分数（说明用户是在表扬不是纠正）
const STRONG_POSITIVE_PATTERNS = [
  /你做得(?:很)?好|完美|你说得对|这次(?:对了|做对了)|做得不错/,
  /(?:这版|这次|这个).+(?:比.+好|更好|不错)/,
  /^(?:好的|没错|对的|完美|搞定|可以|行)[，,。!！?？\s]*$/m
];

let stdinData = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', c => stdinData += c);
process.stdin.on('end', () => {
  try {
    const input = stdinData.trim() ? JSON.parse(stdinData) : {};
    const sessionId = input.session_id || 'unknown';
    const transcriptPath = input.transcript_path;

    if (!transcriptPath || !fs.existsSync(transcriptPath)) {
      debugLog(config, 'no transcript_path');
      return process.exit(0);
    }

    const lesson = scanForLesson(transcriptPath, sessionId);
    if (lesson) {
      saveLesson(lesson);
      debugLog(config, 'lesson captured:', lesson.id);
    } else {
      debugLog(config, 'no lesson signal');
    }
  } catch (e) {
    debugLog(config, 'capture-lesson error:', e.message);
  }
  process.exit(0);
});

function scanForLesson(transcriptPath, sessionId) {
  let raw;
  try { raw = fs.readFileSync(transcriptPath, 'utf-8'); }
  catch { return null; }

  // 解析 JSONL transcript（每行一个 message）
  const lines = raw.split('\n').filter(l => l.trim());
  const userMessages = [];

  // 只看末尾 100 行
  for (const line of lines.slice(-100)) {
    try {
      const msg = JSON.parse(line);
      const role = msg.role || msg.type;
      if (role === 'user') {
        let content = msg.content;
        if (msg.message && msg.message.content) content = msg.message.content;
        if (Array.isArray(content)) {
          content = content.map(c => c.text || '').join(' ');
        }
        if (typeof content === 'string' && content.trim()) {
          // 关键：去掉 hook 注入的 system content（<brain-context>/<honest-loop-protocol>/<system-reminder>/<command-name>）
          // 不去掉的话 inject-context 注入的 IDENTITY 含"纠正"字样会自触发 capture
          const cleaned = stripInjectedContent(content);
          if (cleaned.trim()) {
            userMessages.push(cleaned);
          }
        }
      }
    } catch {}
  }

  if (userMessages.length === 0) return null;

  // 取最后 3 条用户消息分析
  const recent = userMessages.slice(-3).join('\n---\n');

  let signalScore = 0;
  for (const p of CORRECTION_PATTERNS) {
    if (p.test(recent)) signalScore += 1;
  }

  // 强正面信号 → 重置（用户在表扬，不是纠正）
  for (const p of STRONG_POSITIVE_PATTERNS) {
    if (p.test(recent)) {
      debugLog(config, 'strong positive override - skip lesson');
      return null;
    }
  }

  debugLog(config, `signal score: ${signalScore}`);
  if (signalScore < 1) return null;

  const lastMsg = userMessages[userMessages.length - 1] || '';
  const date = new Date();
  const yyyymmdd = `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}`;
  const seq = Math.floor(date.getTime() / 1000) % 1000;

  return {
    id: `L-${yyyymmdd}-d${seq}`,
    session_id: sessionId,
    created: nowISO(),
    severity: signalScore >= 2 ? 'high' : 'mid',
    status: 'draft',
    title: extractTitle(lastMsg),
    summary: lastMsg.slice(0, 400),
    raw_signal: recent.slice(0, 1000),
    signal_score: signalScore
  };
}

function extractTitle(text) {
  // 取第一句或前 40 字符
  const firstSentence = text.split(/[\n。！？!?]/)[0];
  return firstSentence.slice(0, 40).trim();
}

/**
 * 去掉 cc 注入的 system content（hook output / system-reminder / command-name）
 * 不去掉的话 inject-context 注入的 IDENTITY/REFLECTION 含"纠正"字会自触发 capture
 *
 * @param {string} content - user message 原始内容
 * @returns {string} 清理后只剩用户真实输入的部分
 */
function stripInjectedContent(content) {
  if (typeof content !== 'string') return '';
  let out = content;
  // 1. 去掉 brain inject-context 注入的整个 <brain-context>...</brain-context> 块
  out = out.replace(/<brain-context>[\s\S]*?<\/brain-context>/g, '');
  // 2. 去掉 honest-loop protocol 注入
  out = out.replace(/<honest-loop-protocol>[\s\S]*?<\/honest-loop-protocol>/g, '');
  // 3. 去掉 cc system-reminder 块
  out = out.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '');
  // 4. 去掉 command-name / local-command-stdout / etc
  out = out.replace(/<command-name>[\s\S]*?<\/command-name>/g, '');
  out = out.replace(/<command-message>[\s\S]*?<\/command-message>/g, '');
  out = out.replace(/<command-args>[\s\S]*?<\/command-args>/g, '');
  out = out.replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g, '');
  // 5. 去掉 tool_result / function_results 块
  out = out.replace(/<tool_result>[\s\S]*?<\/tool_result>/g, '');
  out = out.replace(/<function_results>[\s\S]*?<\/function_results>/g, '');
  return out.trim();
}

function saveLesson(lesson) {
  const date = new Date();
  const yyyymm = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
  const lessonsDir = path.join(BRAIN_DIR, 'lessons');
  const monthFile = path.join(lessonsDir, `${yyyymm}.md`);
  const indexFile = path.join(lessonsDir, 'INDEX.json');

  // 追加到月文件
  const block =
`
## ${lesson.id} | ${lesson.title} | ${lesson.severity} | DRAFT

**created:** ${lesson.created}
**session:** ${lesson.session_id}
**signal_score:** ${lesson.signal_score}

### 摘要
${lesson.summary}

### 原始信号
\`\`\`
${lesson.raw_signal}
\`\`\`

---
`;
  try {
    fs.appendFileSync(monthFile, block);
  } catch (e) {
    debugLog(config, 'failed to append month file:', e.message);
    return;
  }

  // 更新 INDEX
  let idx;
  try { idx = JSON.parse(readFileSafe(indexFile, '{"lessons":[]}')); }
  catch { idx = { lessons: [] }; }

  if (!Array.isArray(idx.lessons)) idx.lessons = [];

  idx.lessons.unshift({
    id: lesson.id,
    title: lesson.title,
    severity: lesson.severity,
    status: lesson.status,
    summary: lesson.summary.slice(0, 200),
    created: lesson.created,
    file: `${yyyymm}.md`
  });

  // 只保留最近 200 条（draft 自动清理）
  idx.lessons = idx.lessons.slice(0, 200);

  try {
    writeFileAtomic(indexFile, JSON.stringify(idx, null, 2));
  } catch (e) {
    debugLog(config, 'failed to write index:', e.message);
  }
}
