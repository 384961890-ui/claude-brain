<div align="center">

<img src="assets/poster.png" alt="Claude Brain" width="760"/>

# Claude Brain · 完整版 v2–v6

> **让 Claude Code 每次启动都"记得自己是谁"**，顺便帮你盯着代码质量、夜里自主巡检项目。
>
> 零 npm 依赖 · 纯 Node + Python 标准库 · 挂 Claude Code Hook 即用

</div>

---

## 🧬 设计哲学

**v1（存储型）的天花板：**
模型要主动"想起去用"记忆工具，忘了就忘了。8000 行脚本 + sqlite + 向量库。

**v2 的范式翻转 → Identity Brain（身份脑）：**
每次推理前把身份/状态/教训**自动注入**上下文——从"模型查记忆"变成"记忆找模型"。600 行 / 4 个 Hook 脚本。

v3–v6 在这个基础上一层层加能力，都是 Hook 或 launchd 定时任务，不改 Claude 本体。

---

## ✨ 功能一览

### 基础层（每次对话自动跑）
| # | 功能 | 说明 |
|:--|:-----|:-----|
| 1 | **时间感知注入** | 告诉 Claude 距上次对话过了多久，防止把昨天的事当成刚才 |
| 2 | **身份注入** | 把 `IDENTITY.md`（我是谁）+ `STATE.md`（当下状态）+ 最近教训塞进每次上下文 |
| 3 | **自动抓教训** | 你纠正 Claude 之后，会话结束时自动存一条草稿教训，下次注入给它看 |

### v2 · 诚实审计层
| # | 功能 | 说明 |
|:--|:-----|:-----|
| 4 | **诚实自查** | Claude 说"完成了"前，后台偷跑一遍"有没有在骗自己"的检测 |
| 5 | **对抗性探针** | 用另一个模型反向质疑 Claude 的结论，看经不经得起打 |
| 6 | **夜间记忆整合** | 每天凌晨压缩整理最近教训和状态，第二天更新鲜地开始 |

### v3 · 思维卡死检测
| # | 功能 | 说明 |
|:--|:-----|:-----|
| 7 | **卡住举旗** | 检测到 Claude 在一个点上来回转圈，下次发消息自动插一张"突破清单"提示换方向 |

### v4 · 项目迭代触发器
| # | 功能 | 说明 |
|:--|:-----|:-----|
| 8 | **迭代信号检测** | 你说"优化/下一步/重构"这类词，自动提醒先派侦察 Agent 扫项目再动手，别一上来就埋头干 |

### v5 · 内容摄入管道
| # | 功能 | 说明 |
|:--|:-----|:-----|
| 9 | **截图 OCR 摄入** | 把截图里的文字提取出来存进记忆（JXA + macOS 原生 OCR） |
| 10 | **PDF 提取** | 把 PDF 内容提取出来喂进记忆系统 |
| 11 | **Markdown 摄入** | 把任意 `.md` 文件消化进记忆，带去重账本防重复 |

### v6 分支一 · 屎山红灯（Shitcode Red-Light）
| # | 功能 | 说明 |
|:--|:-----|:-----|
| 12 | **写完代码立刻验味** | 每次编辑文件，自动检测：文件太长 / TODO 堆成山 / 调试代码没删 / 死代码残留——发现就发通知，让你当场决定修不修 |

### v6 分支二 · 定时自主上班
| # | 功能 | 说明 |
|:--|:-----|:-----|
| 13 | **每天自动巡检三次** | launchd 凌晨/早/上午各触发一次，扫：日记写了没、记忆索引漂没漂、待办堆没堆 |
| 14 | **项目扫描推荐** | 扫所有活跃项目，找"目标明确、可直接动手"的任务，列清单等你醒来看 |
| 15 | **巡检结果发 TG** | 每次上班完成后发一条 Telegram 消息告诉你干了什么，三行以内 |

### 配套工具
| # | 功能 | 说明 |
|:--|:-----|:-----|
| 16 | **语义记忆召回（QMD）** | 问历史的事时，后台用向量搜索找最相关的记忆片段注入（需本地 Qwen 模型，可选） |
| 17 | **一键安装钩子** | 两个安装脚本，把所有 Hook 一次注册进 Claude Code 设置 |

---

## 📂 目录结构

```
~/.claude-brain/
├── IDENTITY.md              ← 你的 AI 身份定义（你来写）
├── STATE.md                 ← 当前状态（AI 自动更新 + 你手动维护）
├── config.json              ← 配置（QMD 引擎路径、注入条数等）
├── lessons/                 ← 从错误中学到的教训
│   └── INDEX.json           ← 教训索引（draft → confirmed 流程）
│
├── scripts/                 ← 核心 Hook 脚本
│   ├── inject-context.js    ← UserPromptSubmit hook（注入身份+状态+教训）
│   ├── capture-lesson.js    ← Stop hook（捕获纠正信号→写草稿教训）
│   ├── update-state.js      ← Stop hook（刷新 STATE.md 时间戳）
│   └── util.js              ← 共用工具
│
├── v2/scripts/              ← 诚实审计：MCP + 夜间整合
├── v3/scripts/              ← 思维卡死检测
├── v4/scripts/              ← 项目迭代触发器
├── v5/scripts/              ← 内容摄入管道（OCR / PDF / markdown）
├── v6/scripts/              ← 屎山红灯 + 定时 loop
│
├── install-hooks.sh         ← 一键安装基础 Hooks（v2 注入 + 教训捕获）
└── install-capture-lesson.sh← 单独安装教训捕获 Hook
```

---

## 🚀 快速开始

### 1. 克隆到 `~/.claude-brain`

```bash
git clone https://github.com/384961890-ui/claude-brain.git ~/.claude-brain
```

### 2. 写你自己的身份文件

```bash
cp ~/.claude-brain/IDENTITY.md ~/.claude-brain/IDENTITY.md.bak
# 编辑 IDENTITY.md，写上你希望 AI 是什么样的
nano ~/.claude-brain/IDENTITY.md
```

### 3. 安装基础 Hooks

```bash
bash ~/.claude-brain/install-hooks.sh
```

重启 Claude Code，下次对话起效。

### 4. （可选）安装屎山红灯 v6 branch 1

```bash
# 参考 v6/scripts/smell-check.js 和 v6/config.json 配置
# 然后把 smell-check.js 注册为 PostToolUse hook
```

### 5. （可选）开启定时 loop v6 branch 2

```bash
# 1. 编辑 v6/loop-config.json，填入你的 Telegram chat_id 和路径
# 2. 编辑 v6/scripts/loop-prompt.md，定义你的任务白名单
# 3. 注册 launchd plist（参见 v6/DISPATCH-TRIGGER.md）
```

---

## 🔍 验证安装

```bash
# 测试注入脚本是否正常工作
echo '{"prompt":"测试"}' | node ~/.claude-brain/scripts/inject-context.js

# 查看 STATE 时间戳
head -5 ~/.claude-brain/STATE.md

# 查看教训库
python3 -m json.tool ~/.claude-brain/lessons/INDEX.json | head -20
```

---

## ⚙️ 工作原理

```
你发消息
  ↓
UserPromptSubmit Hook → inject-context.js
  ├── 读 IDENTITY.md（你是谁）
  ├── 读 STATE.md（当下状态）
  ├── 读 lessons/INDEX.json 前 N 条最高权重教训
  ├── （可选）QMD 语义搜索相关记忆
  └── 拼成 <brain-context> 注入上下文
  ↓
Claude 推理（上下文里 brain 已就位）
  ↓
Stop Hook → capture-lesson.js + update-state.js
  ├── 扫最近几条用户消息，检测纠正信号
  ├── 发现纠正 → 写一条 draft lesson
  └── 刷新 STATE.md 时间戳
```

---

## 📋 教训管理（Lessons）

教训有两种状态：`draft`（自动抓取）→ `confirmed`（人工确认）

```json
{
  "id": "L-20260524-001",
  "title": "我是 agent 不是人工，效率以秒计算",
  "severity": "high",
  "status": "confirmed",
  "summary": "给用户做规划时不要用「第一周第二周」这种人类节奏...",
  "trigger": "用户提到效率问题时"
}
```

**Promote draft → confirmed：**
1. 打开 `lessons/INDEX.json`
2. 找到 `"status": "draft"` 的条目
3. 改成 `"confirmed"`，精炼 `summary`，调整 `severity`
4. 保存——下次对话自动注入

---

## 🔌 QMD 语义召回（可选）

如果你有本地向量模型（Qwen3-Embedding 等），可以开启语义召回：

```json
// config.json
{
  "qmd_enabled": true,
  "qmd_engine": "~/.qmd-engine/brain-memory-qmd.py",
  "qmd_top_k": 3
}
```

不需要语义召回的话设 `"qmd_enabled": false`，其他功能完全不受影响。

---

## 📈 版本历史

| 版本 | 发布时间 | 核心新增 |
|:-----|:---------|:---------|
| v6 branch 2 | 2026-06 | 定时自主 loop（launchd + 项目巡检 + TG 通知） |
| v6 branch 1 | 2026-06 | 屎山红灯（PostToolUse 代码味道检测） |
| v5 | 2026-06 | 内容摄入管道（OCR / PDF / markdown） |
| v4 | 2026-06 | 项目迭代触发器（idea-loop） |
| v3 | 2026-06 | 思维卡死检测（think-detect） |
| v2 | 2026-05-24 | Identity Brain 范式翻转（身份注入 + 诚实审计 + 夜间整合） |

---

## 📄 License

MIT
