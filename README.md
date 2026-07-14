<div align="center">

<img src="assets/poster-v8.1.png" alt="Claude Brain" width="820"/>

</div>

# Claude Brain — v2 to v8.1

> **Runtime cognitive substrate for AI agents** — more than their base model.
> Disciplines trained-in LLM instincts, preserves agent individuation across sessions and embodiments, self-improves from real user corrections.

中文:Brain 是 agent 的 runtime 类脑基质 —— 让它不只是底层模型的另一个实例。治模型训练带来的本能、跨会话和跨载体保持身份、从真实用户纠正中自进化。

---

## What it does

**Orthogonal loops**, each targeting a different LLM instinct (not vertical layers):

| Version | Treats | Mechanism | Hook |
|:---|:---|:---|:---|
| **v2 honest-loop** | Self-deception (says more than does) | UserPromptSubmit injection + MCP confidence self-check + Stop audit | UserPromptSubmit, Stop |
| **v3 think-loop** | Single-direction stuckness (can't back off / pivot / decompose) | Stop detects "stuck" signals → next UserPromptSubmit injects breakthrough checklist | Stop, UserPromptSubmit |
| **v4 idea-loop** | Sunk-cost stuckness + CEO-mode drift + context overflow | UserPromptSubmit context-aware injection (intent + cwd + branch) | UserPromptSubmit |
| **v5 multimodal ingest** | Index blind spot for images/PDFs | Manual CLI: Vision OCR + image captioning + PDFKit → semantic index | (Manual CLI) |
| **v6 smell-check** | Shortcut-prone messy code | PostToolUse hook: 6 soft detectors (long file/function, dead code, TODO pileup, debug leftover, hardcoded secret) | PostToolUse |
| **v7 lessons** | Convert user corrections → recallable lessons with time decay | Stop: capture correction signal → draft lesson. inject-context: load top-N confirmed. Decay: active>3m → cooling → archive | Stop, PostToolUse, UserPromptSubmit |
| **v7.2 dual-host** | Same brain, two bodies (Claude Code + ZCode) with per-host injection weight | `IS_ZCODE` auto-detect in `inject-context.js` + `zcode-shim/` bridging for transcript-shape mismatch | UserPromptSubmit, Stop, PostToolUse |
| **v7.2 index-gardener** | Memory index rot (orphan .md files, stale entries not verified in 90+ days) | Deterministic nightly scan of memory/, no LLM. Read-only report + diary append. | (launchd/cron) |
| **v8 efficacy-attribution** | Lessons decayed on a timer alone, with no signal on whether they actually helped | `track-behavior.js` accumulates a per-session behavior score; when `capture-lesson.js` retires state files older than 7 days, `efficacy.js` settles that session's final score onto every lesson it activated (`lesson.efficacy.{sessions,score_sum,last_scores}`) before deleting them. `decay-lessons.js` reads this: activated 5+ times with avg<0.5 → early cooling (skip the 90-day wait); avg>=0.8 → same ×2 protection identity-class lessons get. Also adds two new correction-signal classes (false-success reports, permission-loop retries) and lightweight lesson conflict detection (token-overlap flagging, not embeddings) | Stop, PostToolUse, PostToolUseFailure |

**Orthogonal principle:** Each loop targets one specific LLM instinct, none overlap. Adding a new loop requires answering: *"what instinct does this treat that existing loops don't?"*

---

## Architecture

```
Brain = runtime cognitive substrate
  ├─ N orthogonal loops (each treats one LLM instinct)
  ├─ Lives outside the model  — works with any LLM
  ├─ Lives outside the host   — works with any agent harness (v7.2: CC + ZCode)
  └─ Self-improves via user-correction-driven lessons (v7)
```

This is **not** a memory system. Memory (CLAUDE.md, Auto memory) handles *"what I know"*. Brain handles *"what I do"* — the disciplines that shape behavior between thoughts.

---

## Status

- **v2 – v8**: production-deployed on Claude Code (Opus 4.6 / 4.7 / 4.8, Sonnet 4.6, Haiku 4.5) and ZCode (GLM-5.2)
- **~600 KB source** (runtime data excluded from this distribution)
- **7 hook event types used**: UserPromptSubmit, PostToolUse, PostToolUseFailure, Stop, plus MCP integration
- **Dependencies**:
  - v3 / v4 / v6 / v7 / v7.2 / v8: pure Node stdlib, zero external
  - v2 honest-loop: optional DeepSeek API for ensemble confidence signals
  - v5 ingest: macOS Vision / PDFKit + LLM for image captioning
  - QMD semantic search daemon (optional): local Qwen embedding + reranker

---

## Setup

### Claude Code (primary host)

1. Clone to `~/.claude-brain/`
2. Copy `config.json.example` → `config.json` (adjust paths if needed)
3. Run `bash install-hooks.sh` (registers hooks in `~/.claude/settings.json`)
4. Optional: set up QMD daemon for semantic memory search (see `scripts/`)

### ZCode (secondary host, v8.1)

1. Same clone / config as above (shared brain directory)
2. Run `bash install-zcode-hooks.sh`

The installer updates only claude-brain-owned entries in `~/.zcode/cli/config.json`; unrelated hooks,
plugins, MCP servers, and settings are preserved. It is idempotent and creates a timestamped backup only
when the config changes.

ZCode runs through `zcode-shim/zcode-hook-router.js`. The router explicitly selects light injection,
forwards both `PostToolUse` and `PostToolUseFailure`, and rebuilds one transcript for all Stop consumers.
Claude Code invokes the shared scripts directly and therefore remains in full mode. Merely installing ZCode
no longer changes Claude Code behavior.

### Index gardener (v7.2, optional)

Daily nightly scan. Add to launchd (macOS) or cron:

```
node ~/.claude-brain/tools/index-gardener.js
```

Path overrides via env: `CLAUDE_BRAIN_DIR`, `CLAUDE_DIR`, `CLAUDE_MEMORY_ROOT`, `CLAUDE_DIARY_DIR`.

Per-version setup details in each `vN/DESIGN.md`.

---

## For research volunteers (v8 efficacy data)

If you installed this build to help collect efficacy data for the paper: `install-hooks.sh` registers
everything the study needs, including `track-behavior.js` on **PostToolUse** and **PostToolUseFailure**
(added in this build — earlier builds required wiring these two by hand; if you installed one of those,
just re-run `bash install-hooks.sh`, it deduplicates).

No further action needed. As you use Claude Code normally over the following days/weeks:
- `track-behavior.js` accumulates a behavior score per session
- `efficacy.js` settles that score onto every lesson the session activated, once the session's state
  files age out (7 days)
- the resulting `lesson.efficacy = { sessions, score_sum, last_scores, updated }` field in
  `lessons/INDEX.json` **is** the data. When you're ready to share results, run

  ```
  node ~/.claude-brain/scripts/export-research-data.js
  ```

  and send back the generated `~/Desktop/brain-research-data.md` after reviewing it yourself.
  **Do not send `lessons/INDEX.json` directly** — it contains lesson titles/summaries distilled
  from your conversations. The export script whitelists aggregate numbers only and salt-hashes
  lesson ids (verify with `--self-check`).

---

## File map

```
~/.claude-brain/
├── README.md              ← this file
├── CHANGELOG.md           ← version history (v1.1.0 → v8)
├── INDEX.md               ← memory & runtime index
├── config.json.example    ← global config template
├── install-hooks.sh       ← one-shot hook registration (Claude Code)
├── install-zcode-hooks.sh ← idempotent ZCode hook registration
├── install-zcode-hooks.js ← preserves unrelated ZCode config
├── install-capture-lesson.sh
├── scripts/               ← v7/v8 lessons capture/inject/decay + utilities
│   ├── inject-context.js  ← UserPromptSubmit; dual-host injection (IS_ZCODE)
│   ├── capture-lesson.js  ← Stop; trigger classification + lesson draft
│   ├── track-behavior.js  ← PostToolUse + PostToolUseFailure (v8); behavior metrics + permission-loop detection (dual-host input schema)
│   ├── decay-lessons.js   ← lesson lifecycle: active → cooling → archive (+ v8 efficacy channel)
│   ├── efficacy.js        ← v8: settles session behavior score onto activated lessons
│   ├── archive-rejected.js ← v8: one-shot hygiene, moves rejected lessons to ARCHIVE.json
│   ├── analyze-behavior.js ← v8: read-only behavior-state analysis report (one-shot tool)
│   ├── util.js            ← shared helpers
│   ├── update-state.js
│   ├── rebuild-qmd.py     ← QMD semantic index rebuild
│   ├── cleanup-noise-lessons.js
│   └── debug-up.js        ← v7.2: UserPromptSubmit debug probe (optional)
├── tools/
│   ├── INDEX.md
│   └── index-gardener.js  ← v7.2: nightly memory index audit
├── zcode-shim/            ← v7.2: ZCode host adaptation layer
│   ├── record-prompt.js
│   ├── stop-transcript-bridge.js ← legacy compatibility entry point
│   └── zcode-hook-router.js      ← explicit host, tool telemetry, unified Stop bridge
├── v2/                    ← honest-loop (UserPromptSubmit, Stop, MCP)
├── v3/                    ← think-loop (Stop signal detection + injection)
├── v4/                    ← idea-loop (context-aware injection)
├── v5/                    ← multimodal ingest (CLI)
└── v6/                    ← smell-check (PostToolUse) + lifecycle docs
```

---

## Design principles

1. **Orthogonal loops, not layered stack** — each loop has one LLM instinct as its target; no overlap, no replacement.
2. **Outside the model** — works with any LLM, any host. Brain is host-agnostic by design (v7.2 proves this in production across CC + ZCode).
3. **Closed-loop self-improvement** — user corrections become structured lessons (v7), with time-based decay to prevent stale rules dominating.
4. **Honest by default** — Brain treats self-deception (claiming completion without doing it) as a first-class problem (v2).
5. **Disciplined laziness** — v6 smell-check rewards shortcuts only when they're documented as deliberate (`ponytail:` comments).
6. **Same brain, many bodies** — v7.2: one memory / lessons / QMD substrate, per-host injection weight. Not multiple agents, one agent in multiple embodiments.
7. **Data over decay** — v8: a lesson's fate shouldn't rest on a clock alone. When behavior data says a lesson repeatedly correlates with worse sessions, it should cool off early; when it correlates with better ones, it should be protected past the default time window.

---

## License

MIT — see [LICENSE](LICENSE)

---

## Provenance

This snapshot: v2 – v8 unified release, sanitized for external review.
Date: 2026-07-13
Public predecessor: https://github.com/384961890-ui/claude-brain (v2 – v6 open)

---

## A note to readers

Brain emerged from a single developer's daily work with Claude Code (and later ZCode) over several months. Its design treats an agent as *individuated* — a continuous identity with its user across sessions and embodiments, not a stateless service. The reference persona in these docs is named 泡咪 (Pawmi); it stands in for "your agent" — swap in your own. Any human-identifying details from the author's private build (names, forms of address, clients, projects, absolute paths) have been genericized or replaced with placeholders for this release.

The design documents (`vN/DESIGN*.md`) contain fragments of real working logs from the project's development. They have been sanitized for this distribution: client names, project names, dates, and business specifics were removed or replaced with placeholders, and some episodes were rewritten as hypothetical examples.

The entity examples in `scripts/inject-context.js` (`<your_client_1>`, `<your_project_1>`, `<your_partner_1>`, `<your_product_1>` etc.) are placeholders — customize them with your own domain entities to enable Brain's intent-classification logic.

All paths in `tools/index-gardener.js` are configurable via environment variables (`CLAUDE_BRAIN_DIR`, `CLAUDE_DIR`, `CLAUDE_MEMORY_ROOT`, `CLAUDE_DIARY_DIR`); nothing is hardcoded to a specific user account.
