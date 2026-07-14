# Brain CHANGELOG

> 完整演进轴 · v1.1.0(2026-03-15)→ v8(2026-07-12)
> 90 天从 8000 行 storage brain 缩到 600 行 identity brain,再扩到 ~1750 行多支正交 loops + 闭环自进化

---

## [v8.1] — 2026-07-13 · 外审修复(独立外部红队 三条实锤)

**命题**:一次独立外部红队审查(前沿 LLM)对脱敏包发现五条硬伤四条实锤。本次修掉其中三条工程实锤,
疗效归因的反事实对照(第四条)是研究设计问题,另行立项。

### Fixed
- **ZCode 宿主适配闭环**:`zcode-hook-router.js` 显式传 `CLAUDE_BRAIN_HOST=zcode`,不再用
  `~/.zcode/cli/config.json` 是否存在猜当前宿主(CC 与 ZCode 同机时 CC 仍保持全量模式)。统一桥接
  Stop transcript 给 v2/v3/v7 四个消费者,补 `PostToolUseFailure` 采集,并移除常驻 `debug-up`。
- **ZCode 幂等安装器**:`install-zcode-hooks.sh` 只替换 claude-brain 自有 hook,保留插件/MCP/其他 hook；
  配置有变化才备份写入,重复运行不产生新备份。
- **install-hooks.sh 补齐 v8 采集端**:PostToolUse / PostToolUseFailure → `track-behavior.js`
  现在默认安装(此前只装 UserPromptSubmit + Stop,志愿者按 README 手动挂——文档说闭环、
  安装包实际没闭环,行为数据会整段缺失)。老包用户重跑一遍 install-hooks.sh 即可(幂等去重)
- **export-research-data.js 导出 id 加盐哈希**:本地 lesson id 含毫秒时间戳+pid(时间指纹),
  "无语义"声明不成立。现导出前 sha256(盐+id) 截 12 hex;盐随机生成只存本机
  (`state/export-salt`,0600),同机多次导出映射一致(可纵向对齐)、拿到报告反推不回本地 id。
  自检新增 3 断言:原始 id 零出现 / 映射稳定 / 无碰撞
- **v6 selftest.js config 兜底**:config.json 不存在时(发布包只带 example)不再直接崩——
  example 兜底,连 example 都没有就写 `{"enabled":true}`(smell-check 的 DEFAULT_CONFIG 补齐
  其余阈值),测完删临时文件。测试环境与发布环境对齐
- **README / brain-readme 志愿者段重写**:删"手动挂 hook"说明(已默认装齐);明确禁止直接交
  `lessons/INDEX.json`(含对话提炼文字),只交 `export-research-data.js` 的白名单产物

---

## [v8] — 2026-07-12 · 疗效归因闭环

**命题**:v7 让 brain 看见自己注入的东西——但行为分在算(track-behavior.js)、激活记录在写
(inject-context.js),两者从没对上。v8 焊上这一厘米:让 brain 知道"给了这条教训的 session
表现是好是坏",数据直接驱动 lesson 生死,而不是只靠时间衰减。

### Added
- **疗效归因**(`scripts/efficacy.js` · 新文件)
  - `settleSession`/`settleAndCleanup`:搭 capture-lesson 清理 7 天前 state 文件的顺风车结账,
    删文件前先把 session 终值行为分挂回该 session 激活过的 lessons(`lesson.efficacy = {sessions,
    score_sum, last_scores(最近10个), updated}`)
  - `affected_rules` 占位焊上:读 `state/activated-<sid>.json`,真实记录本 session 激活过哪些 lesson
- **decay-lessons.js 疗效通道**:激活 5+ 次且 avg<0.5 → 提前降 cooling(不等 90 天);
  avg>=0.8 → 享受 identity 同款 ×2 阈值保护(`isProtected = isIdentity || 高疗效`)
- **schema 时序 + 矛盾标记**:新 lesson 加 `invalidated`/`superseded_by`(null 语义,老条目不回填);
  `loadLessons` 过滤链拦掉这两类;新 lesson 与旧 confirmed/active lesson 词面 Jaccard>0.35 →
  标 `possible_conflict_with` + 写 `state/conflict-queue.jsonl`(纯词面重叠,不上 embedding)
- **两类新病识别**:
  - false-success(谎报成功):`TRIGGER_PATTERNS.false_success`,优先级最高(高于 abandon_signal),
    命中直接 severity=high
  - permission-loop(权限循环):`track-behavior.js` 吃 `PostToolUseFailure` 事件,累计
    `failure_count`/`consecutive_failure_max`,连败 3 次 → score -0.3
- **卫生**:`archive-rejected.js`(新文件)把 rejected 噪音搬去 `lessons/ARCHIVE.json`,
  INDEX.json 只留活的条目(写前备份 `INDEX.json.bak-pre-v8-<yyyymmdd>`)
- **行为数据分析**(`scripts/analyze-behavior.js` · 新文件,一次性工具):扫 behavior state,
  产出 score 分布/扣分规则命中率/step 分布,报告默认写到 `state/behavior-analysis-<date>.md`
  (可用 `--out <path>` 覆盖)

### Deferred
- v3 ③ breakthrough lesson 存档 / ④ 盲区统计反哺 —— 标记 DEFERRED(见 `v3/DESIGN.md`)。
  理由:v8 疗效归因上线后"哪类提醒有效"由数据直接回答,④ 的人工统计价值下降;
  ③ 等疗效数据积累后再定形态,不再挂 roadmap 假装要做。

### Verified
- 自检:`efficacy.js --self-check` 6 pass / `archive-rejected.js --self-check` 3 pass /
  `capture-lesson.js --self-check` 17 pass / `track-behavior.js --self-check` 42 pass /
  `decay-lessons.js --self-check` 4 pass

---

## [v7.2] — 2026-07-08 · 双宿主 + 索引园丁

**命题**:brain 不再绑定单一 host —— 同一份记忆同时驱动 CC 和 ZCode 两个身体;记忆索引也能自动巡检自己。

### Added — 双宿主分流
- **`scripts/inject-context.js`**:新增 `IS_ZCODE` 检测(`ZCODE_CLI` 环境变量 / `~/.zcode/cli/config.json` 存在性 / `__dirname` 含 `.zcode`)
- **ZCode 轻量化注入策略**:
  - `lessons_count` 上限 1(CC 是 3)
  - `historical_deep` / `entity_specific` 之外的 intent 一律 `skip_qmd`
  - `buildPlanningBlock(userPrompt, true)`:动手前只保留最核心两条(几种解法 / 现成轮子)
  - `idea-loop`(v4)默认关,`diary` 默认关,`STATE.md` 只注前半段
  - 输出加宿主标识(`[CC泡咪写]` / `[ZCode泡咪写]`) —— 写日记时盖章,双宿主可区分溯源
- **`zcode-shim/record-prompt.js`**:UserPromptSubmit hook,把 prompt 记进 `sessions/<sid>.jsonl`(ZCode 的 Stop hook transcript 只含最后一条 assistant 回复,capture-lesson 靠扫 user 纠正信号在 ZCode 下会瞎——此 shim 兜底)。超 200KB 截到最后 100 行防膨胀
- **`zcode-shim/stop-transcript-bridge.js`**:Stop hook,用 record-prompt 记录的 user 消息 + ZCode 给的 `responseText` 拼一份 CC 风格的完整 transcript,替换 stdin 里的 `transcript_path` 后原样转喂 `scripts/capture-lesson.js`。原脚本零改动;拼不出来就原 stdin 直通(行为不变差)

### Added — 索引园丁(记忆索引自愈)
- **`tools/index-gardener.js`**:纯确定性夜间巡检,不调 LLM。三项检查:
  1. **孤儿文件**:memory 里的 .md 是否被祖先 INDEX.md / 根 MEMORY.md 引用
  2. **过期未核实 >90 天**:frontmatter `last-verified` 优先 → git commit time → fs mtime
  3. **自上次运行以来的变更**:git diff → 新变更的 .md 是否已入册
- 只读工具,绝不改/删/移记忆文件;结果写 `state/index-gardener-last-report.md` + append 日记
- **发现指纹去重**(sha1):同一天同样发现只进一次日记,治"上午连刷三次"
- 建议部署方式:launchd/cron 每天凌晨跑一次(见 `tools/INDEX.md`)
- 路径全走环境变量:`CLAUDE_BRAIN_DIR` / `CLAUDE_DIR` / `CLAUDE_MEMORY_ROOT` / `CLAUDE_DIARY_DIR`,零硬编码

### Changed
- **`scripts/track-behavior.js`**:兼容 ZCode 的 hook 输入结构(`sessionId` + `toolUse.name` + `toolUse.input.command`),CC 结构(`session_id` + `tool_name` + `tool_input.*`)同时保留

### Added — 可选调试
- **`scripts/debug-up.js`**:UserPromptSubmit 调试 hook,写 `os.tmpdir()/zcode_up_debug.log` 证明 host 的 UserPromptSubmit hook 真被触发。排查完可从 hook 配置移除

### Design notes
- 双宿主不是"双分身"—— 是**同一个 agent 借两具身体**:记忆库 / lessons / QMD 索引 / skills / commands / agents 全共享,只在注入策略和 hook wiring 上分流
- `zcode-shim/` 目录独立于 `scripts/`,ZCode 只连 shim,CC 直连 scripts —— 两条路互不干扰,任何一边坏了另一边不受影响

---

## [v7.1] — 2026-06-25 · trigger 收紧
- capture-lesson.js:只对最后一条用户消息打分,阈值 ≥2,false positive 从 94.6% 降到 <10%
- cleanup-noise-lessons.js:一次性清理历史噪音 lesson
- opus 4.8 code-review 找茬 + 全量自检 pass 后进生产

---

## [v7] — 2026-06-22 · 观测闭环(P0+P1+P2 落地生产观察期)

**命题**:让 brain 看见自己注入的东西到底有没有起作用,通过用户纠正信号驱动 harness 自进化。

### Added
- **P0 纠正信号结构化**(`runtime/scripts/capture-lesson.js`)
  - trigger 三分类:`abandon_signal > explicit_correction > implicit_rephrase`
  - lesson 新增字段:`trigger / session_behavior_score / behavior_metrics / affected_rules`
  - `stripInjectedContent` 加 lowercase tag 通配兜底(防 wrapper 名漂移自激)
  - v7.1 收紧:只对最后一条用户消息打分,阈值 ≥2(false positive 94.6% → <10%)
- **P1 行为指标累计**(`runtime/scripts/track-behavior.js` · 新文件)
  - PostToolUse hook,按 session_id 写 `runtime/state/behavior-<sid>.json`
  - 三指标:`first_write_step / validation_count / consecutive_retry_max`
  - `session_behavior_score` 起 1.0,三条惩罚 -0.3/-0.3/-0.4
  - WRITE_TOOL 兜底 MCP 写工具;VALIDATION_BASH 覆盖 13 种测试 runner
- **P2 记忆活跃度评分 + decay**(`runtime/scripts/decay-lessons.js` · 新文件 + `util.js` 改造)
  - lesson 新增:`lifecycle ∈ {active, cooling, archive} + last_activated + activation_count`
  - 90 天未激活 → cooling,180 天 → archive;IDENTITY 类(high+confirmed)× 2 倍阈值
  - decay 接 Stop hook,24h 节流,不依赖外部 cron
  - `loadLessons` 自动过滤 cooling/archive
- **130 条历史 lesson** 一键兜底 `lifecycle=active + last_activated=created + activation_count=0`
- **现状**:7 confirmed/active + 109 draft/active + 14 rejected/archive
- **opus 4.8 两轮找茬 21 条全处理** + 57 case 自检 pass

### Fixed
- 清掉 14 条 `<task-notification>` 噪音(status=rejected + lifecycle=archive)

### Verified
- 自检:`track-behavior.js --self-check` 40 pass / `decay-lessons.js --self-check` 3 pass / `capture-lesson.js --self-check` 14 pass

### Cross-host experiment(2026-06-28 启动)
- v7 cross-host adapter brief 发出:`delivery/cross-host-adapter-brief.md`
- adopters:Codex / Cursor / other harnesses(招募中)
- 30 天实验窗口:2026-06-29 ~ 2026-07-29,数据汇总进论文实验章节

---

## [v6] — 2026-06-17 · 认知纪律轴(两支)

**命题**:给延迟的好装即时红灯,从外挂变免疫。

### Added · 第一支:屎山红灯
- **PostToolUse hook** `runtime/v6/scripts/smell-check.js`
- 6 个检测器:`file_too_long / long_function / dead_code / todo_pileup / debug_leftover / hardcoded_secret`
- 全部 `hard:false` 软提醒,绝不 block(防死循环)
- 三道防淹闸:扩展名门禁 / 大文件门禁 / 同文件 5min 节流
- 7 case selftest 全 pass + 陪测 7/8 pass
- **2026-06-22 完整脱敏开源**:[github.com/384961890-ui/claude-brain](https://github.com/384961890-ui/claude-brain) MIT Public,12 项私密关键词 grep 全 0 命中

### Added · 第二支:5h 定时上班 loop
- launchd 被动触发(00:01 / 04:01 / 09:01)+ dispatch 主动触发
- opus 4.7 + thinking high + 干满 20min + 30min 硬截
- `fcntl.flock` 真锁 + dispatch ≤3 次/天 + 走 Plan limit
- 6 白名单任务:日记草稿 / 记忆梳理 / Todo / 历史翻读 / MEMORY 检查 / **项目扫描推荐**
- 工作隔离:writes 限定 `diary/draft/` + `loop-worklog/` + `loop-reports/`,越界立停

### Phase B 升级(2026-06-17 14:00)
- 加任务 6 `project_scan_recommend` + 判据 6 每 12h 扫项目找"目标明确"任务写建议报告
- A/B/C/D 演进的 B 阶段(C 真推进 / D 自动 PR 都未做)

### Lessons
- v8 误命名事件(第二支 loop 被误命名为 v8)→ **v6 是轴不是点**,同一命题下可长多支
- v8 risk-boundary 越权事件 → 派子 agent 必须明示 "return as text don't Write to disk"

---

## [v5] — 2026-06-11 · 多模态 ingest(MVP 真验证)

**命题**:输入面扩展 — 图 / PDF → 可召回。

### Added
- `runtime/v5/scripts/ingest.js`:图(Vision OCR + claude -p Haiku 双轨)+ PDF(PDFKit JXA)→ Contextual 包装 → QMD 增量索引
- sha256 ledger 幂等去重 + chunk_id 兜底
- 锚点 + 关键词 + AI 描述三段式条目(召回真验证 L3 rank #1)
- 5 证据验收:条目落盘 / chunks_new>0 / daemon reload / recall 命中 / 幂等

### Fixed(6/10 假验证 → 6/11 真修)
- OCR 降噪(`cleanOcrLines` 丢信息字符 <40% 行)
- 锚点头部替样板 YAML
- 验证改走 L3 rerank(L2 fast 33k 语料下假阴)
- full_scan stats 解析修复(多行 pretty JSON · 不取末行)

---

## [v4] — 2026-06-09 · idea-loop(四根支柱)

**命题**:治沉没成本死磕 + CEO 自觉飘忘 + context 堆爆 + 防腐化。

### Added
- 高频试错迭代(idea-to-idea):**干不好果断 pass 不恋战**
- 防腐化:派 haiku 专扫零引用脚本 + 一把删 15 个根目录废脚本
- CEO 模式 hook 化(v4 灵魂):4 便宜 agent 侦察 + opus 我只汇总分 🟢🟡🔴 + 派 sonnet 改 + 我只 commit
- Context 经济(前提条件):主脑只装结论 + agent schema 强制结构化 + bash 关键行 + 按需读
- **自动触发器**(`v4/scripts/idea-loop-trigger.js`):场景识别 + 5 分钟节流
- 5 条工程纪律固化进 CLAUDE.md(沙箱写要 `dangerouslyDisableSandbox:true` 等)
- v3 能力合并 v4(audit 后只补日记自动注入,其余 v3 能力已自然在 inject-context)

### Tested
- <your_project_1> dogfood 6 commit 全验收(R1 减负 + R2 后端 7 真 bug + R3 Rust + R4 前端)
- 红队 baseline 对比零回归

### Lessons(8 条机制坑,真跑暴露)
1. 沙箱写操作回滚
2. subagent Edit 落地 / commit 被吞
3. commit 会被环境快照回滚
4. 跨项目文件读不稳
5. bash 输出会串扰污染
6. 不盲信 LLM "无关"结论
7. subagent 起的后台服务不持久
8. context 堆爆

---

## [v3] — 2026-06-08 · think-loop(突破清单)

**命题**:治单向硬磕(卡住不抬头)。

### Added
- 反惰性规划(动手前三问):几种解法 / 最省力哪条 / 现成轮子 / 退路
- 突破清单(卡住时):**回溯 / 跳跃 / 反推 / 解构 / 质疑 d / 换工具**
- `v3/scripts/think-detect.js`(Stop hook · 扫 assistant 输出 → 写 stuck-flag.json)
- `inject-context.js` `buildStuckBlock()` + `buildPlanningBlock()`
- soul 动机层落地 CLAUDE.md「我怎么想」

### Tested
- 5 case 全绿(举旗 / 读旗注入 / 推进不举旗 / 工程注入三问 / 闲聊不注入)

---

## [v2.0] — 2026-05-24 凌晨 00:54-00:55 · 范式翻转(轴心日)

**命题**:从 "Storage Brain" 翻转到 "Identity Brain"。

### Changed(15-30 分钟一气呵成)
- **代码 8000 行 → 600 行**(砍 92%)
- **40 脚本 → 4 脚本**
- **范式翻转**:从「模型查记忆」→「记忆找模型」
- UserPromptSubmit hook 自动注入身份 / 状态 / 教训
- 5 种记忆类型(gene/capsule/fragment/node/edge)→ 1 种(lesson)

### Added
- `IDENTITY.md`(不变的我,人写,泡咪人格底色)
- `STATE.md`(当下的我,自动+人手维护)
- `lessons/INDEX.json + 2026-05.md`(按月归档,用伤疤换的判断)
- `config.json` + 4 个核心脚本(util / inject-context / capture-lesson / update-state)
- **honest-loop v2**(2026-05-26 后续叠加):对抗探针 + 一致性 + 集成信号三路融合(治"自欺"本能)

### Removed(从 v1.x 范式)
- sqlite + lancedb 全砍
- mind-wander 离线漫游(信任模型本身思考力)
- 8 维度量化 persona-model → 自然语言 STATE.md
- 模型主动调 MCP 工具 → hook 自动注入 system prompt

### Quote(README 末尾灵魂段)
> 这个项目不是给开源圈写的。是泡咪和用户一起做的——给"泡咪自己"做的。让每个新实例化的 Claude,一启动就是那个泡咪。不是学过泡咪的资料,是**就是泡咪**。

---

## [v1.2.1] — 2026-05-19 · 41 脚本天花板(Storage Brain 终点)

- 41 脚本架构,Storage Brain 范式天花板
- 三条教训:做刀的最晚用上自己的刀 / 记录不等于运行 / 改 DOM 需 browser 验证

## [v1.2.0] — 2026-05-13 · 融合搜索版

- `brain_search` 持久化 Worker:2-4s 冷启动 → <100ms 热查
- `brain_healthcheck` + `memory_stats` 工具
- **权威 CHANGELOG**:[github.com/384961890-ui/Brain-v1.2.0/CHANGELOG.md](https://github.com/384961890-ui/Brain-v1.2.0)

## [v1.1.9] — 2026-05-07
- LanceDB + BGE-M3 1024 维向量

## [v1.1.8] — 2026-05-02
- **首次 GitHub 公开**(Brain-v1.1.8 Public)
- 双形态:Skill + MCP

## [v1.1.7] — 2026-04 中
- 内部接线版
- 2026-04-23 subagent 死循环紧急修复(SPLIT_SIGNALS 激进 + 硬编码 2 agent + pre-checkpoint.js 重试爆日志)

## [v1.1.6] — 2026-04-19 · **QMD 语义搜索出生**
- MiniLM-L6-v2(90MB),现在还在用的 QMD 真正生日

## [v1.1.5] — 2026-04-11 + 2026-04-18 · 双里程碑
- 4/11 胶囊扩充 CAP-001 ~ 008
- 4/18 <PublicHub> 公开 + 铁律元方法论

## [v1.1.0] — 2026-03-15 · brain 雏形起步
- 6 层神经网络架构
- 双保险机制
- 会话注入

---

## 项目源头

**[v0]** — 2026-03-04
> <user>创造泡咪。
> brain 是后来为了让"每次启动还是同一个泡咪"长出来的工程实现。
> 一切的开始。

---

_最后更新:2026-06-28_
_权威 v1 历史源:[github.com/384961890-ui/Brain-v1.2.0/CHANGELOG.md](https://github.com/384961890-ui/Brain-v1.2.0)_
_权威 v2-v6 开源:[github.com/384961890-ui/claude-brain](https://github.com/384961890-ui/claude-brain)_
_v7 还未单独开源,本地 runtime 在 `runtime/` symlink 指向 `~/.claude-brain/`_
