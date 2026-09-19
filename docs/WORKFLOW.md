# Working with Claude Code on this project (human guide)

## The session loop (one milestone per session)
1. Open a new session in this folder. First prompt: `Read docs/PLAN.md and do M<n>. Plan first.`
   (CLAUDE.md loads automatically; the docs load only when needed.)
2. Press **Shift+Tab** into Plan Mode for anything touching more than one file. Correct the plan, then approve.
3. Let it build. After each working step: `commit this`.
4. At about 60–70% context (check with `/context`), or when the milestone is done:
   `Update docs/PLAN.md (tick boxes, score log, Next session note) and commit.` Then `/clear`, or start a new session.
   This written handoff beats auto-compaction, which loses detail.

## Token and context efficiency
- **Be specific:** name the file/function/email ("`normalize_port` in `sdoc/normalize.py` fails on email_059").
  Vague prompts make Claude explore, and exploring burns tokens.
- **Don't paste big logs.** Paste the error line + 5 lines around it. Scripts should print summaries.
- **Never ask Claude to "look through the data".** Ask for a script that summarises it.
- **Rewind instead of arguing:** press Esc twice to go back to before a bad turn, rather than stacking corrections.
- **Match the model to the job:** Opus for planning, architecture, nasty bugs; Sonnet for routine implementation and UI
  tweaks. Lower effort for trivial edits.
- **Subagents** for wide searches ("find everywhere X is used"). They return a summary and keep your main context clean.
- **Few MCP servers / plugins.** Each one adds tool definitions to every session. Disable connectors you don't use
  here (e.g. screenpipe, Chrome) in the app's connector settings.
- `/compact focus on <topic>` manually at a natural break if you must continue in the same session.
- `/context` shows what's using context; `/cost` or the usage view shows spend.

## Tools to set up
| When | Tool | Why |
|---|---|---|
| Now | GitHub CLI (`winget install GitHub.cli`) | Claude can create the repo, push, open PRs |
| Now | Context7 MCP: `claude mcp add --transport http context7 https://mcp.context7.com/mcp` | Current docs for FastAPI, Supabase, Next.js, so no outdated APIs |
| Built in | `/code-review`, `/simplify` | End of each milestone |
| Built in | `/security-review` | Before submission (API keys, Supabase access rules) |
| Day 2 | `frontend-design` plugin (Anthropic official marketplace) | UI that doesn't look generic |
| Day 2 | shadcn/ui (component library, not a skill) | Accessible, good-looking components fast |
| Day 2 | Built-in browser pane | Claude screenshots and checks its own UI |

## Useful prompts
- "Run the pipeline and score, add the row to the score log, and tell me the top 3 error sources."
- "Explain why email_0NN got <X> (show the parsed fields and evidence). Don't change code yet."
- "/code-review then fix only the high-confidence findings."

## Git habits
Commit after every green step (tests pass / score doesn't drop). Git is your undo button and Claude's memory.
