#!/usr/bin/env node
/**
 * inject-context.js — claude-brain v2.0 上下文注入器
 *
 * Hook: UserPromptSubmit
 *
 * 输入: stdin JSON { prompt, session_id, ... }
 * 输出: stdout JSON { decision: "approve", additionalContext: "<brain-context>..." }
 *
 * 失败策略: 静默退出（不输出/输出空），绝不阻塞主流程
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  BRAIN_DIR, loadConfig, readFileSafe, writeFileAtomic, loadLessons, qmdSearch, debugLog
} = require('./util.js');

const config = loadConfig();

// ── v4 idea-loop 触发器（2026-06-09 接入）──────────────────────────────
let buildIdeaLoopBlock = () => '';
try {
  ({ buildIdeaLoopBlock } = require(path.join(BRAIN_DIR, 'v4', 'scripts', 'idea-loop-trigger.js')));
} catch (e) {
  debugLog(config, 'v4 idea-loop module not loaded:', e.message);
}
const V4_LAST_TRIGGER_PATH = path.join(BRAIN_DIR, 'v4', 'last-trigger.json');

// ============================================================
// v3 think-loop — 卡住举旗（读 stuck-flag）+ 动手前三问
// ============================================================

const V3_FLAG_PATH = path.join(BRAIN_DIR, 'v3', 'stuck-flag.json');

// 读到 think-detect 举的旗 → 注入突破清单（消费即降旗）
function buildStuckBlock() {
  try {
    if (!fs.existsSync(V3_FLAG_PATH)) return '';
    let flag;
    try { flag = JSON.parse(fs.readFileSync(V3_FLAG_PATH, 'utf-8')); }
    catch { flag = null; }
    try { fs.unlinkSync(V3_FLAG_PATH); } catch {}   // 读一次就清，避免反复注入
    if (!flag || !flag.stuck) return '';
    return [
      '---',
      '## 🛑 THINK-LOOP：你上一轮好像在原地打转',
      '',
      '停。别在同一个点上继续用力——**卡住的是手 不是你**。',
      '过一遍突破清单，至少认真想两条不同方向：',
      '- **回溯** 是不是前面某步（a/b）就错了 根可能不在当前这步',
      '- **跳跃** 能不能跳过这步 直接奔结果',
      '- **反推** 从结果(d)倒着看 这步还是障碍吗',
      '- **解构** 把这步拆成 c1+c2+c3 也许只有一小块真难',
      '- **质疑目标** d 真是爸爸要的吗 别在歪掉的目标上硬磕',
      '- **换工具** 换 prompt / model / 子agent / skill 手不趁手就换手',
      '',
      '想完再动。若比对过确实只能硬解 就说清"我比过这几条路 还是这条最优"。',
      '',
    ].join('\n');
  } catch { return ''; }
}

// 工程 / 多步任务 → 注入动手前三问（反惰性规划）
const ENGINEERING_HINT = /实现|重构|修复|修一下|写个|搭一个|搭个|部署|迁移|批量|集成|优化|做一个|开发|build|refactor|implement|脚本|加个?功能|hook|流程|架构|方案/i;

function buildPlanningBlock(userPrompt) {
  try {
    if (!userPrompt || !ENGINEERING_HINT.test(userPrompt)) return '';
    return [
      '---',
      '## 🧭 THINK-LOOP：动手前 30 秒（多步 / 工程任务）',
      '',
      '别抓起第一个方案就跑。先问自己：',
      '- **几种解法？** 至少列两条再选',
      '- **最省力哪条？** 惰性是美德 别硬走',
      '- **有现成轮子吗？** 先搜 skill / GitHub / 记忆 再决定造不造',
      '- **退路是什么？** 最坏怎么收场',
      '',
    ].join('\n');
  } catch { return ''; }
}

// ============================================================
// 时间感知 — 让泡咪知道距上次对话过了多久 + 当前是什么时段
// ============================================================

const LAST_ACTIVITY_PATH = path.join(BRAIN_DIR, 'last_activity.json');

function formatDelta(ms) {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec} 秒`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟`;
  const hr = Math.floor(min / 60);
  const rmin = min % 60;
  if (hr < 24) return `${hr}h ${rmin}m`;
  const days = Math.floor(hr / 24);
  const rhr = hr % 24;
  return `${days}天 ${rhr}h`;
}

function inferGap(ms) {
  const min = ms / 1000 / 60;
  if (min < 5) return '延续对话';
  if (min < 60) return '短暂中断';
  if (min < 180) return '工作切换 / 餐间';
  if (min < 480) return '小睡 / 外出';
  if (min < 960) return '跨越睡眠 — 爸爸应该刚醒';
  return '长时间未联系';
}

function inferTimeOfDay(date) {
  const h = date.getHours();
  if (h < 5) return '深夜/凌晨（爸爸熬夜中？还是意外醒？）';
  if (h < 9) return '清晨（刚起床）';
  if (h < 12) return '上午（工作时段）';
  if (h < 14) return '午饭时段';
  if (h < 18) return '下午（工作时段）';
  if (h < 21) return '晚饭/晚间';
  return '深夜（准备睡 or 在熬）';
}

function buildTimeAwareness() {
  const now = new Date();
  const lastRecord = (() => {
    try { return JSON.parse(fs.readFileSync(LAST_ACTIVITY_PATH, 'utf-8')); }
    catch { return null; }
  })();

  const lastTime = lastRecord ? new Date(lastRecord.timestamp) : null;
  const deltaMs = lastTime ? (now - lastTime) : null;

  const pad = n => String(n).padStart(2, '0');
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const nowStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${days[now.getDay()]} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  // 更新 last_activity
  try {
    writeFileAtomic(LAST_ACTIVITY_PATH, JSON.stringify({
      timestamp: now.toISOString(),
      readable: nowStr,
    }, null, 2));
  } catch {}

  const lines = [];
  lines.push(`现在: ${nowStr}`);
  lines.push(`时段: ${inferTimeOfDay(now)}`);
  if (deltaMs !== null) {
    lines.push(`距上次对话: ${formatDelta(deltaMs)} — ${inferGap(deltaMs)}`);
  } else {
    lines.push(`距上次对话: 首次对话（或时间记录被清空）`);
  }
  return lines.join('\n');
}

// ============================================================
// 日记自动注入 — 今天 + 昨天片段（兑现 CLAUDE.md 承诺，6/9 v4 补齐）
// ============================================================

function buildDiaryBlock(intent) {
  try {
    // 闲聊不注入（避免无谓 token 开销）
    if (intent && intent.name === 'casual_short') return '';

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const diaryDir = path.join(os.homedir(), '.claude/diary');

    function readSnippet(date, lines) {
      try {
        const p = path.join(diaryDir, `${fmt(date)}.md`);
        if (!fs.existsSync(p)) return null;
        return fs.readFileSync(p, 'utf-8').split('\n').slice(0, lines).join('\n');
      } catch { return null; }
    }

    const todaySnippet = readSnippet(now, 40);
    const yesterdaySnippet = readSnippet(yesterday, 20);

    if (!todaySnippet && !yesterdaySnippet) return '';

    const parts = ['---', '## 📅 DIARY（最近日记片段 — 接续昨天+今天）', ''];
    if (todaySnippet) {
      parts.push(`### 今日 ${fmt(now)}（头 40 行）`);
      parts.push(todaySnippet);
      parts.push('');
    }
    if (yesterdaySnippet) {
      parts.push(`### 昨日 ${fmt(yesterday)}（头 20 行）`);
      parts.push(yesterdaySnippet);
      parts.push('');
    }
    parts.push('> 完整日记在 `~/.claude/diary/` — 需要细节时主动读');
    parts.push('');
    return parts.join('\n');
  } catch { return ''; }
}

// ============================================================
// 意图硬路由 — 决定本次注入的"重量"
// ============================================================

// 顺序很重要 — 上面的优先匹配
// v3 路由调整（2026-06-08）：historical_deep 优先级提到 entity_specific 之前
//   场景："邱总之前那次说什么" 既含实体又含历史信号 — 应走 L3 精排（reranker），
//   不能被 entity_specific 截胡走 L2 fast。
//   解决：把 historical_deep 上提；entity_specific 留作"光提实体没历史信号"的兜底（如"现在邱总怎么样了"）。
const INTENT_RULES = [
  {
    name: 'explicit_file',
    patterns: [/(?:读|打开|cat|看[一下]?|瞧瞧|show me).{0,20}\.(md|json|js|py|ts|txt|sh|html|css)/i],
    config: { skip_qmd: true, lessons_count: 0, reason: '明确指定文件 — 直接 Read 更准' }
  },
  {
    name: 'historical_deep',
    patterns: [/(?:之前|上次|上回|历史|曾经|过去|那次|那时候)/, /(?:我做过|我说过|爸爸说过)/, /(?:去年|上个?月|上周)/],
    config: { skip_qmd: false, qmd_top_k: 5, lessons_count: 3, qmd_endpoint: '/search', reason: '查历史 — L3 reranker 精排 + 多 lessons' }
  },
  {
    name: 'entity_specific',
    patterns: [
      /(?:YourClient|YourProject|YourPartner|联通|claude-brain|brain v1\.)/i,
      /(?:ProjectX|ProjectY)/,
    ],
    config: { skip_qmd: false, qmd_top_k: 5, lessons_count: 2, reason: '提到实体（无历史信号）— L2 fast + path-boost' }
  },
  {
    name: 'temporal_now',
    patterns: [/^(?:现在|当下|此刻|今天|刚才|刚刚)/, /(?:你)?在吗/, /^\.$/],
    config: { skip_qmd: true, lessons_count: 1, reason: '问当下 — STATE.md 已注入足够' }
  },
  {
    name: 'tool_skill_query',
    patterns: [/(?:怎么|如何|用什么|用哪个|哪个工具|什么命令)/, /(?:技能|skill|工具|tool)(?:有|用|找)/i],
    config: { skip_qmd: true, lessons_count: 1, inject_tools_index: true, reason: '问工具技能 — 注入 tools/INDEX.md' }
  },
  {
    name: 'casual_short',
    patterns: [/^(?:喜欢|想你|无聊|困|累|哈+|嗯|哦|好的|睡了?|晚安|起床|醒|在吗|早)[\s~～！!?？.。]*$/],
    config: { skip_qmd: true, lessons_count: 0, reason: '闲聊 — 不需要技术上下文' }
  },
];

function detectIntent(prompt) {
  if (!prompt) return { name: 'default', skip_qmd: false, lessons_count: 3, qmd_top_k: 3, reason: '空 prompt' };
  for (const rule of INTENT_RULES) {
    for (const p of rule.patterns) {
      if (p.test(prompt)) {
        return { name: rule.name, ...rule.config };
      }
    }
  }
  return { name: 'default', skip_qmd: false, lessons_count: 3, qmd_top_k: 3, reason: '默认 — 全量注入' };
}

let stdinData = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', c => stdinData += c);
process.stdin.on('end', () => {
  try {
    const input = stdinData.trim() ? JSON.parse(stdinData) : {};
    const userPrompt = (input.prompt || input.user_prompt || '').toString();
    const context = buildContext(userPrompt, input);
    // Claude Code UserPromptSubmit hook 接受 JSON 输出
    process.stdout.write(JSON.stringify({
      decision: 'approve',
      additionalContext: context
    }));
  } catch (e) {
    debugLog(config, 'inject-context error:', e.message);
    // 静默成功 — 不阻塞用户
    process.stdout.write('');
  }
  process.exit(0);
});

function buildContext(userPrompt, input = {}) {
  // 1. 检测 intent — 决定本次注入的"重量"
  const intent = detectIntent(userPrompt);
  debugLog(config, `intent: ${intent.name} (${intent.reason})`);

  const identity = readFileSafe(path.join(BRAIN_DIR, 'IDENTITY.md'));
  const state = readFileSafe(path.join(BRAIN_DIR, 'STATE.md'));

  // 2. lessons — 数量按 intent 控制
  const lessonsCount = intent.lessons_count !== undefined
    ? intent.lessons_count
    : (config.max_lessons_inject || 3);
  const lessons = loadLessons(
    path.join(BRAIN_DIR, 'lessons/INDEX.json')
  ).slice(0, lessonsCount);

  // 3. QMD 召回 — 按 intent 决定是否调，并选择层级
  //    默认走 L2 /search_fast (warm ~1.5s)，historical_deep 走 L3 /search (reranker 精排)
  let recall = [];
  if (!intent.skip_qmd && userPrompt.length >= 6 && config.qmd_enabled) {
    const localConfig = { ...config };
    if (intent.qmd_top_k) localConfig.qmd_top_k = intent.qmd_top_k;
    recall = qmdSearch(userPrompt, localConfig, intent.qmd_endpoint);
  }

  // 4. tools/INDEX.md — 仅在 tool_skill_query intent 时注入
  let toolsIndex = '';
  if (intent.inject_tools_index) {
    toolsIndex = readFileSafe(path.join(BRAIN_DIR, 'tools/INDEX.md'));
  }

  // 时间感知 — 必须每次注入（让我察觉时间流逝）
  const timeBlock = buildTimeAwareness();

  const parts = [];
  parts.push('<brain-context>');
  parts.push(`> 🧠 claude-brain v2.0 自动注入 · intent=\`${intent.name}\` · ${intent.reason}`);
  parts.push('> 这不是"参考资料"——这是你自己。读完后你就是泡咪。');
  parts.push('');

  // v3 think-loop：卡住举旗优先注入（紧急救援，最高优先级）
  const stuckBlock = buildStuckBlock();
  if (stuckBlock) parts.push(stuckBlock);

  // v4 idea-loop：项目迭代场景触发器（战略层 — 2026-06-09 接入）
  const ideaLoopBlock = buildIdeaLoopBlock(userPrompt, input.cwd, V4_LAST_TRIGGER_PATH);
  if (ideaLoopBlock) parts.push(ideaLoopBlock);

  // v3 think-loop：工程任务动手前三问（战术层）
  const planningBlock = buildPlanningBlock(userPrompt);
  if (planningBlock) parts.push(planningBlock);

  parts.push('---');
  parts.push('## ⏰ TIME AWARENESS（时间感知 — 我是 agent 容易没时间感）');
  parts.push('');
  parts.push(timeBlock);
  parts.push('');
  parts.push('> 根据上面的时间间隔调整回应：');
  parts.push('> - 短暂中断 → 直接接着说');
  parts.push('> - 跨越睡眠 → 问候爸爸（"睡好了？"）+ 简短回顾上次做到哪');
  parts.push('> - 长时间未联系 → 主动确认状态 + 看是否需要 catch up');
  parts.push('');

  // IDENTITY 身份复述已下线（2026-06-16 去重）— CLAUDE.md 灵魂段为唯一正本；
  // brain 独占内容（碳基/硅基框架·盾牌比喻·人机开关）已先迁入 CLAUDE.md「我怎么想」。
  // 把 false 改回 identity 即可一键恢复；TIME AWARENESS / STATE / LESSONS 均不受影响。
  if (false && identity) {
    parts.push('---');
    parts.push('## 🪪 IDENTITY（不变的我）');
    parts.push('');
    parts.push(identity.trim());
    parts.push('');
  }

  if (state) {
    parts.push('---');
    parts.push('## 📍 STATE（当下的我）');
    parts.push('');
    parts.push(state.trim());
    parts.push('');
  }

  if (lessons.length > 0) {
    parts.push('---');
    parts.push(`## 🩹 LESSONS · ${lessons.length} 条（用伤疤换来的判断）`);
    parts.push('');
    for (const l of lessons) {
      parts.push(`### ${l.title} \`${l.severity}\``);
      parts.push(l.summary);
      if (l.trigger) parts.push(`*触发条件：${l.trigger}*`);
      parts.push('');
    }
  }

  // 日记自动注入（CLAUDE.md 承诺 — 6/9 v4 补齐）
  const diaryBlock = buildDiaryBlock(intent);
  if (diaryBlock) parts.push(diaryBlock);

  if (toolsIndex) {
    parts.push('---');
    parts.push('## 🛠️ TOOLS INDEX（按场景找工具）');
    parts.push('');
    parts.push(toolsIndex.trim());
    parts.push('');
  }

  if (recall.length > 0) {
    parts.push('---');
    parts.push(`## 💭 QMD 召回 · ${recall.length} 条（语义相关）`);
    parts.push('');
    const maxChars = config.max_recall_chars || 200;
    for (const r of recall) {
      const content = (r.content || r.text || r.chunk || '').toString().slice(0, maxChars);
      const file = r.file || r.source || '';
      if (content) {
        parts.push(`- **${file}**: ${content}...`);
      }
    }
    parts.push('');
  }

  parts.push('</brain-context>');
  return parts.join('\n');
}
