# How tech-case-studio asks for permission, and why we cannot

Compared 2026-08-25, after building the elicitation path. The studio solved this
problem first, so the question was whether we picked the wrong mechanism.

**We did not — but only because of an architectural difference, and if that
difference ever closes, theirs is better.**

## Two different mechanisms

| | tech-case-studio | Demo Builder |
|---|---|---|
| Mechanism | Claude Code's OWN permission system, intercepted | MCP elicitation, from inside our server |
| Flags | `--permission-prompt-tool stdio` with `--input-format stream-json --output-format stream-json` (`sidecar/src/claude-cli-provider.ts:243-252`) | none — it is a protocol capability |
| Covers | **every tool Claude uses** — Write, Edit, Bash, and MCP tools alike | **only Demo Builder's tools** |
| Who renders | the studio, as its own permission cards | Claude Code, however it chooses to |
| Requires | owning BOTH ends of the stream | nothing |

The studio's route arrives as a `control_request` with subtype `can_use_tool`,
carrying `request_id`, `tool_use_id`, the tool name and its input — the same
message the Agent SDK answers internally through its `canUseTool` callback. Their
`parsePermissionRequest` recognises it and their UI answers it.

## Why we cannot use it today

**It requires driving the process.** `--permission-prompt-tool stdio` only means
anything when someone is reading and writing that stdio stream, which is why it
appears beside `--input-format stream-json` in their spawn.

The extension launches `claude --continue` into a **VS Code terminal**. Claude
Code owns that stdio; the producer types into it. We own the command line — so
we could pass the flag — but there would be nobody on our side to answer the
request, and the run would stall.

So the two mechanisms are not competing options at the same level. **They belong
to two different architectures**, and which is available depends on one thing:
whether you own the stream.

## What this actually is: evidence for a decision already on the backlog

`.rptc/backlog/2026-08-24-own-the-chat-surface.md` records the option of
rendering Claude Code's stream in our own UI, and says permission handling is the
hard part rather than rendering. This comparison is the concrete version of that
argument:

- Own the stream, and `can_use_tool` becomes available — **covering every tool,
  not just ours.** An agent running `rm -rf` through Bash is currently invisible
  to Demo Builder's gate. That is a real gap and elicitation cannot close it.
- Do not own it, and elicitation is the only mechanism there is.

Worth stating plainly, because it is the strongest argument in that item and it
was not in it: our consent gate protects **our** tools. Anything Claude does with
its own tools passes without our knowledge, whatever we build with elicitation.

## What to borrow regardless

**Session allow keyed by CATEGORY, not by exact tool.** `permission-allow.ts`
groups Edit with MultiEdit, Glob with Grep, so one decision covers a kind of
action — "broad enough to remove repeat nagging, still an explicit,
session-scoped human decision".

Ours is per-tool, and deliberately: the two grantable tools (`republish`,
`sync_content`) do genuinely different things, so a shared category would grant
more than the user agreed to. But if the grantable set ever grows past a handful,
their coarser keying is the pattern to reach for rather than a longer list.

**Both refuse to persist.** Theirs "resets when the opportunity changes; it is
never persisted"; ours dies with the window. Two independent designs landing on
the same rule is worth noticing.

**A trap they hit that we already have.** Their `user-model.test.ts` notes that
`permissions.allow` entries "would auto-approve Write/Edit before the permission
card saw them" — which is exactly the situation measured here on 2026-08-24: the
producer runs `defaultMode: auto` with no allowlist, so Claude Code approves
everything and OUR dialog is the only checkpoint that fires. Same hazard, found
independently, and it is the reason the gate has to be server-side rather than
configuration.


## OWNER DECISION 2026-08-25: auto-approve stays on

Turning Claude Code's own permission checks back on would close most of the gap
without touching our code. **The owner declined, and the reason is sound: the
interruption cost is real.** A producer building a demo is interrupted enough.

So this is settled, and it changes what is worth building:

**Prevention is as good as it is going to get.** Our gate covers our tools, aimed
at the sixteen that are irreversible or reach other people. Claude's own tools —
Bash, Write, Edit — run unasked, by choice.

**Which promotes VISIBILITY from nice-to-have to the actual mitigation.** If you
cannot prevent it, you can at least see it afterwards. And the thing that would
give that is already scheduled: task A of the `opentelemetry/` sub-plan is to
read what a `claude_code.tool` span contains, and **those spans cover Claude's
OWN tools** — the exact set our recorder is blind to.

That is a real change to why that sub-plan matters. It was filed as "durable
capture, useful for measuring the surface over time". It is now also the only
after-the-fact record of what an agent did with the tools nobody asked about.
Worth doing sooner than it was.

**What is NOT worth doing**, recorded so it is not re-proposed: restricting what
Claude may do (`--disallowedTools` on the spawn). We control the launch, so it is
technically available — and the skills we ship need exactly those abilities.
Blocking Bash to guard the producer would break the thing it is guarding.
