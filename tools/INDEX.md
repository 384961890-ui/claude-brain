# claude-brain TOOLS INDEX — 工具入口

> 按"我现在想做什么"找工具，不是按工具名找用法。

---

## 🌐 网页 / 浏览器

| 场景 | 工具 | 关键命令 / 说明 |
|:---|:---|:---|
| 读网页内容（提取文本+元素） | dokobot | `dokobot read <url>` |
| 浏览器自动化（点击、填表） | mcp__chrome-mcp__ + mcp__Claude_in_Chrome__ | Chrome 扩展 + DOM-aware |
| 本地无头浏览器 | Playwright | v1.58 已装；输入被富文本编辑器拦截需配 dokobot |

---

## 🔍 搜索 / 调研

| 场景 | 工具 |
|:---|:---|
| 通用网搜 | tavily-search |
| 神经语义搜（找代码/公司/人） | exa-search |
| 深度报告含引用 | deep-research（firecrawl + exa） |
| 我的过去（语义召回） | QMD HTTP search :18765 |
| 我的当下（身份/状态） | 读 IDENTITY.md + STATE.md |

---

## 🧠 记忆 / 索引

| 场景 | 工具 / 路径 |
|:---|:---|
| 找过去对话 / 文档 | QMD :18765/search |
| 找最近教训 | ~/.claude-brain/lessons/INDEX.json |
| 找项目状态 | ~/.claude/workbench/工作缓冲区.md |
| 找今天日记 | ~/.claude/diary/YYYY-MM-DD.md |
| 找历史项目 | ~/.claude/identity/MEMORY.md |

---

## 📝 文档 / 编辑

| 场景 | 工具 |
|:---|:---|
| 读文件 | Read |
| 改文件 | Edit（替换片段）/ Write（新建或重写） |
| 跨文件搜索 | Grep |
| 文件查找 | Bash `find` / `ls` |

---

## 🤖 子任务派发

| 场景 | 工具 |
|:---|:---|
| 内容编辑/枚举类任务 | DeepClaude 模式（爸爸传话给 DeepSeek） |
| 代码探索（read-only） | Agent + subagent_type: Explore |
| 复杂多步骤任务 | Agent + subagent_type: general-purpose |

---

## 🎨 设计 / 前端

| 场景 | 技能 |
|:---|:---|
| 高保真原型 / 设计探索 | huashu-design |
| 网页 PPT | guizang-ppt-skill |
| 瑞士国际主义风设计 | frontend-design (skill) |

---

## 🛡️ 安全 / 代码审查

| 场景 | 技能 |
|:---|:---|
| 通用代码审查 | code-review (skill) |
| 安全审查 | security-review (skill) |
| 终极多 agent 审查 | /ultrareview (用户触发) |

---

## 💬 通信 / 集成

| 场景 | 工具 |
|:---|:---|
| Discord 回复 | mcp__plugin_discord_discord__* |
| 飞书 / 钉钉 | mcp__lark-mcp__* |
| 邮件 / Slack | 通过 chief-of-staff agent |

---

## 💾 数据 / 数据库

| 场景 | 工具 |
|:---|:---|
| SQLite 查询 | Bash + sqlite3 |
| PostgreSQL | postgres-patterns (skill) |
| ClickHouse 分析 | clickhouse-io (skill) |
| 向量库 | lancedb-pro MCP（暂未深度使用） |

---

## 维护说明

- 用过的工具标 ✅ + 一句心得
- 没用过的工具不删（备查）
- 踩坑的工具写 ⚠️ + 原因
- 这个 INDEX 不追求全 — 追求"我真用过的命令是什么"
