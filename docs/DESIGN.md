# Design — Shitcode Red-Light

> Why this hook exists, why it's mounted where it is, and why it never blocks.

## The core idea

LLMs (and humans) write shitcode for the same reason: **the code runs now, so the
reward is immediate — and the cost of bad structure is in the future, where it's
invisible.** "Just make it work" is an instant payoff; clean architecture pays off
later, to someone else, maybe never to you.

A linter doesn't fix this. A linter produces an error list you scroll past. The
motivation to cut a corner is untouched.

**Shitcode Red-Light translates the delayed cost into an immediate signal — right
at the second you write the code — and forces a conscious binary choice:**

> (1) fix it now, or (2) write one line on *why you're not*.

It treats the *motivation*, not a metric. Hand-waving costs more than just doing it.

## Why PostToolUse — the gap analysis

A coding agent typically has two natural intervention points, and **neither covers
the moment shitcode is actually born:**

| Hook point | When | Problem |
|:---|:---|:---|
| Pre-prompt reminder (UserPromptSubmit) | before you touch code | **too early** — generic "write clean code" gets drowned out |
| Session-end audit (Stop) | after the session | **too late** — the shitcode already exists |
| **Shitcode Red-Light (PostToolUse)** | **the second a source file is written** | **fills the gap** |

Shitcode accumulates one "eh, good enough" at a time. The red light sits at exactly
that second: write a file → mechanical check → on a hit, force the binary choice.

## Why it never blocks (the hard-won rule)

PostToolUse must **never** use `decision: block`.

A PostToolUse hook fires *after* the tool call — the file is already on disk.
`decision: block` does **not** roll back the written content. It just tells the
model "that step was rejected," which drives a retry of the same write → file
unchanged → hook fires again → **infinite loop until tokens run out.**

So every finding here is a **soft injection** (`hookSpecificOutput.additionalContext`).
Even a detected secret is surfaced loudly (🔴) but **not blocked** — better a loud
warning than a crash loop. True hard-blocking belongs in a future **PreToolUse** hook,
which fires *before* the write and can legitimately refuse until the input is fixed.

## The six detectors

All are pure functions `(ctx, cfg) => Finding | null` — zero side effects, zero deps,
unit-testable, language-agnostic approximations (no AST — that's too heavy and violates
the "keep the hook light" principle).

1. **hardcoded_secret** *(checked first — highest risk)* — strong patterns (`sk-`,
   `AKIA`, PEM blocks, `gh_` tokens) reported directly; weak `key=...` patterns require
   entropy + exclude placeholders (`your-`, `process.env`, `changeme`, `<...>`).
2. **file_too_long** — the most reliable, language-agnostic shitcode signal.
3. **long_function** — one contiguous code block over the threshold; "pile it into one
   function" is the most classic shortcut. Approximated by splitting on blank/comment
   lines and excluding data/import lines.
4. **dead_code** — large blocks of commented-out code (the "can't bear to delete it"
   hoarding); exempts the header banner and JSDoc docs.
5. **todo_pileup** — TODO/FIXME markers past a threshold; "later" rarely comes.
6. **debug_leftover** — leftover `console.log`/`debugger` in non-test files (one may be
   legit; a pile looks like residue).

## Three anti-flood gates

A signal that becomes noise gets ignored — which is the same as not existing. So:

1. **Gate** — only inspect source extensions; skip docs/config/data/deps, the tool's
   own dir, and any private paths you list (notes, journals, memory stores).
2. **Large-file gate** — skip files over 512KB (generated bundles shouldn't be linted
   line-by-line).
3. **Throttle** — at most one light per file per N minutes (default 15), written
   atomically so concurrent sessions don't corrupt the throttle file.

And on each hit, only the 1–2 heaviest findings are shown; the rest collapse into one
line. The message is engineered to make hand-waving expensive, not to be exhaustive.

## Roadmap (not yet shipped)

- PreToolUse hard-block for secrets (refuse the write before it lands)
- `dirty_naming` / `deep_nesting` detectors (held back — high false-positive rate)
- per-task "good vs bad" code examples injected before work starts (models imitate
  examples far better than they follow rules)
- relax `debug_leftover` for CLI/bin scripts (their `console.log` is real UI output)
