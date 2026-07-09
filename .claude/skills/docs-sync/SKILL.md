---
name: docs-sync
description: >
  Sync dub-deck's documentation set (README.md, CLAUDE.md, docs/ARCHITECTURE.md,
  docs/decisions.md, docs/handoff.md) with the current code and decisions. Each doc has ONE
  purpose and MUST NOT duplicate another. Run after a feature lands, a migration is added, files
  move, or decisions are made in conversation. Triggers: "update the docs", "sync docs",
  "docs-sync", "the docs are stale", "keep docs up to date".
---

# docs-sync — keep dub-deck's docs current and non-redundant

Five docs, five jobs. A fact lives in exactly one of them; the others point to it. When you
update, first decide *which* doc owns the fact, put it there, and make sure it did not get
copied into a second doc.

## The contract — one purpose per doc

| Doc | Audience | Owns (the ONLY place this lives) | Never contains |
|-----|----------|----------------------------------|----------------|
| **README.md** | Humans / GitHub visitors | What the app is, feature highlights (user-facing), install/run/build steps, supported formats, per-OS data-location summary table | Agent gotchas, decision rationale, file-by-file source map, migration internals |
| **CLAUDE.md** | AI agents (auto-loaded) | Requirements checklist (✅/🔜 source of truth), CRITICAL gotchas that bite, conventions, commands, short "key decisions" summary that **links to** decisions.md | Full decision rationale (link instead), the source-tree map (link to ARCHITECTURE.md), install prose |
| **docs/ARCHITECTURE.md** | Anyone needing "where is X" | Source-tree map, runtime data locations, **data model + current migration version**, Rust command table, build outputs, code conventions | *Why* a choice was made (link to decisions.md), user-facing feature copy, in-flight task state |
| **docs/decisions.md** | Future agents/humans | Dated, append-only log of **decision + why**. The single home of rationale | How-to steps, file maps, current task status |
| **docs/handoff.md** | Cross-machine continuity | **Current** in-flight state, what's done/not-done, manual test checklists, per-machine setup (yt-dlp/ffmpeg) | Durable rationale (→ decisions.md), the permanent architecture map (→ ARCHITECTURE.md) |

Redundancy rule: if the same sentence would be true in two docs, it belongs to the one whose
"Owns" column covers it; the other links (`see docs/decisions.md`) rather than restating.

## Procedure

1. **Find what changed.** `git log --oneline -15` and `git diff --stat` since the docs' last
   update. Note new/removed files under `src/`, `src-tauri/`, new migrations, new commands, and
   any decisions made in the conversation that are not yet in decisions.md.
2. **Verify against code, never memory.** Confirm each claim before writing it:
   - Migration version: `grep -n "version:" src-tauri/src/lib.rs` → highest wins.
   - Data-model columns: read the migration `sql:` blocks (they are the schema of record).
   - Rust commands: `grep -nA1 "#\[tauri::command\]" src-tauri/src/lib.rs`.
   - Files: `ls src/features src/lib` — retired files (e.g. AddSourceDialog) must leave the map.
3. **Update each doc for its column only:**
   - **decisions.md** — append any new decision as `YYYY-MM-DD — decision — why` under the right
     section. Append-only; never rewrite or delete a past decision (history is the point).
   - **ARCHITECTURE.md** — reconcile the source tree, data model, migration version, and command
     table with step 2's findings. This is the doc that rots fastest.
   - **CLAUDE.md** — flip requirement bullets ✅/🔜 to match reality; move shipped items out of
     "Next up"; keep gotchas accurate. Do not paste rationale — link decisions.md.
   - **README.md** — refresh feature highlights and the data-location table for the current
     feature set. Human tone; no internals.
   - **handoff.md** — rewrite "Current state" to what is actually in flight, refresh the test
     checklist, bump "Last updated".
4. **De-dup pass.** Re-read the five docs; if a fact appears twice, delete it from the doc that
   does not own it (per the table) and leave a pointer.
5. **Report.** List which docs changed and the notable facts corrected. Do not commit unless the
   user asks (project rule: commit only when explicitly requested).

## Guardrails

- Dates are absolute (`YYYY-MM-DD`), never "recently"/"last week".
- decisions.md is append-only. The other four are edited in place.
- Verify a file/command/flag still exists before documenting it; a doc that names a deleted
  symbol is worse than silence.
- Follow the repo's writing standards (no hype, no em-dashes-as-prose, state facts once).
