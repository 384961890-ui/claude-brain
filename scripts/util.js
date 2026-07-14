/**
 * util.js — claude-brain v2.0 共用工具
 * 纯 Node 标准库，零 npm 依赖。
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const http = require('http');
const os = require('os');

const HOME = os.homedir();
const BRAIN_DIR = path.join(HOME, '.claude-brain');
const CONFIG_PATH = path.join(BRAIN_DIR, 'config.json');

function expandHome(p) {
  if (typeof p !== 'string') return p;
  if (p.startsWith('~/')) return path.join(HOME, p.slice(2));
  if (p === '~') return HOME;
  return p;
}

function loadConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    for (const key of Object.keys(cfg)) {
      if (typeof cfg[key] === 'string') cfg[key] = expandHome(cfg[key]);
    }
    return cfg;
  } catch (e) {
    return {
      qmd_enabled: false,
      max_lessons_inject: 3,
      max_recall_chars: 200,
      qmd_timeout_ms: 1500,
      qmd_top_k: 3
    };
  }
}

function readFileSafe(p, fallback = '') {
  try { return fs.readFileSync(p, 'utf-8'); } catch { return fallback; }
}

function writeFileAtomic(p, content) {
  const tmp = `${p}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, p);
}

function loadLessons(indexPath) {
  try {
    const idx = JSON.parse(readFileSafe(indexPath, '{"lessons":[]}'));
    const lessons = idx.lessons || [];
    // confirmed 优先，按 severity (high > mid > low)，再按 created 倒序
    const sevWeight = { high: 3, mid: 2, low: 1 };
    return lessons
      .filter(l => l.status !== 'rejected')
      // v7 P2: cooling/archive 不再注入（lifecycle 缺失 = 老数据 = active 兜底）
      .filter(l => !l.lifecycle || l.lifecycle === 'active')
      // v8 C2: 被判定作废/被新条目取代的老 lesson 不再注入（缺失 = null 语义 = 正常放行）
      .filter(l => !l.invalidated && !l.superseded_by)
      .sort((a, b) => {
        if (a.status === 'confirmed' && b.status !== 'confirmed') return -1;
        if (b.status === 'confirmed' && a.status !== 'confirmed') return 1;
        const sa = sevWeight[a.severity] || 0;
        const sb = sevWeight[b.severity] || 0;
        if (sa !== sb) return sb - sa;
        return (b.created || '').localeCompare(a.created || '');
      });
  } catch { return []; }
}

/**
 * v7 P2: 标记 lesson 被激活（注入到 LLM context）
 * @param {string} indexPath INDEX.json 路径
 * @param {string[]} lessonIds 本次被注入的 lesson id 数组
 * @returns {number} 实际标记成功的条数
 *
 * ponytail: 同步读改写 — race 风险存在
 *   - activation_count 不准可容忍（counter 偶尔少 1 没关系）
 *   - 但 last_activated 被并发拽老是真问题：热门 lesson 反而更易被 decay 错杀
 *   - 观察项：跑 1-2 周看真实并发频率；如果发现热门 lesson 被错降，
 *     上 proper-lockfile 或拆 sidecar 文件（lessons/activations.json）方案
 */
function markLessonsActivated(indexPath, lessonIds) {
  if (!Array.isArray(lessonIds) || lessonIds.length === 0) return 0;
  let idx;
  try { idx = JSON.parse(readFileSafe(indexPath, '{"lessons":[]}')); }
  catch { return 0; }
  if (!Array.isArray(idx.lessons)) return 0;

  const idSet = new Set(lessonIds);
  const now = new Date().toISOString();
  let updated = 0;
  for (const l of idx.lessons) {
    if (idSet.has(l.id)) {
      l.last_activated = now;
      l.activation_count = (l.activation_count || 0) + 1;
      updated++;
    }
  }
  if (updated === 0) return 0;
  try {
    writeFileAtomic(indexPath, JSON.stringify(idx, null, 2));
  } catch { return 0; }
  return updated;
}

function qmdSearchHttp(query, config) {
  // 优先：通过 HTTP 调 qmd_daemon（127.0.0.1:18765），模型常驻 → <100ms
  return new Promise((resolve) => {
    const topK = config.qmd_top_k || 3;
    const port = config.qmd_daemon_port || 18765;
    const url = `http://127.0.0.1:${port}/search?query=${encodeURIComponent(query)}&top_k=${topK}`;

    const req = http.get(url, { timeout: config.qmd_timeout_ms || 1500 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const obj = JSON.parse(data);
          const results = (obj.results || []).map(r => ({
            text: r.text,
            file: r.source || r.file,
            score: r.score,
          }));
          resolve(results);
        } catch { resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
  });
}

function qmdSearchSpawn(query, config) {
  // 兜底：daemon 没启动时回退到 spawn Python（慢 ~16s 冷启动）
  if (!config.qmd_engine) return [];
  try {
    const out = execFileSync('python3', [
      config.qmd_engine, 'search', query,
      '--top-k', String(config.qmd_top_k || 3)
    ], {
      encoding: 'utf-8',
      timeout: config.qmd_timeout_ms || 1500,
      stdio: ['ignore', 'pipe', 'ignore']
    });
    const results = JSON.parse(out);
    return Array.isArray(results) ? results : [];
  } catch { return []; }
}

// 同步包装：用于现有调用方（注入 hook 是 stdin 异步流，wait 是 OK 的）
//
// v3 分层召回（2026-06-08 加入）：
//   - endpoint 默认 '/search_fast' = 纯 embedding，warm ~1.5s，hook 注入用这条
//   - endpoint '/search'           = embedding + reranker，~30-90s，精排深查用这条
//   - 超时按 endpoint 分别取：fast 用 qmd_fast_timeout_ms (默认 5s)
//                            search 用 qmd_timeout_ms        (默认 45s)
function qmdSearch(query, config, endpoint) {
  if (!config.qmd_enabled) return [];
  const { execSync } = require('child_process');
  const topK = config.qmd_top_k || 3;
  const port = config.qmd_daemon_port || 18765;
  const ep = endpoint || '/search_fast';
  const url = `http://127.0.0.1:${port}${ep}?query=${encodeURIComponent(query)}&top_k=${topK}`;
  const timeoutMs = ep === '/search_fast'
    ? (config.qmd_fast_timeout_ms || 5000)
    : (config.qmd_timeout_ms || 45000);
  try {
    const out = execSync(`curl -sf --max-time ${timeoutMs / 1000} "${url}"`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
    const obj = JSON.parse(out);
    return (obj.results || []).map(r => ({
      text: r.text,
      // 兼容多种格式：/search_fast 返回 source+file_path，旧 /search 返回 file
      file: r.source || r.file || r.file_path,
      score: r.score,
    }));
  } catch {
    // daemon 不可用 — 静默退化（不调 spawn，太慢会超 hook 限时）
    return [];
  }
}

function nowISO() {
  return new Date().toISOString();
}

function nowReadable() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}（${days[d.getDay()]}）`;
}

function debugLog(config, ...args) {
  if (config && config.debug) {
    const logPath = path.join(BRAIN_DIR, 'debug.log');
    fs.appendFileSync(logPath, `[${nowISO()}] ${args.join(' ')}\n`);
  }
}

module.exports = {
  HOME, BRAIN_DIR, CONFIG_PATH,
  expandHome, loadConfig, readFileSafe, writeFileAtomic,
  loadLessons, markLessonsActivated, qmdSearch, nowISO, nowReadable, debugLog
};
