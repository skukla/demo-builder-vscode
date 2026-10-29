# Step 07 — One consent prompt, not three

Depends on step 03. Gated on a live run.

## Measured 2026-10-06 — nothing to build

- **The premise was wrong: there are never three of OUR prompts.** The chain asks the chat
  first and opens the modal only when the chat cannot be asked (`'unavailable'`), so Demo
  Builder raises one prompt per destructive call. The agent's own approval is the only
  other one.
- **Copilot CLI** identifies as `clientInfo.name: "copilot-cli"` (1.0.91) and declares
  `elicitation: { form, url }`. Headless `copilot -p` answered a stub server's elicitation
  with `decline` at once — the call refuses, it does not hang (stub at the time in a temp
  dir; same shape as the 2026-08-28 `claude -p` measurement).
- **VS Code** identifies as its product name (`clientInfo.name` = `nameLong`, "Visual Studio
  Code") and renders a form elicitation as a question carousel in the chat panel. Its
  Autopilot auto-answers the model's own `ask_user` tool; the local MCP elicitation path has
  no such branch (read in the 1.140 workbench bundle, not yet watched live).
- **Skipping our ask for Copilot would remove the only prompt that survives Autopilot and
  `--allow-all`**, the levels `demoBuilder.ai.permissions` now offers. So the chain stays as
  it is for every client; at the `ask` level a destructive call gets the agent's generic
  approval plus ours, which names the blast radius. Recorded in ADR-025.

Still owed, live: one destructive call from the VS Code panel and one from interactive
Copilot CLI, counting the prompts. Both touch real resources, so they run with the owner.

## The problem (as first written)

A destructive tool can now be confirmed three times: Copilot's own MCP confirmation (it asks for
any tool not marked `readOnlyHint`), our elicitation ask in the chat, and our modal dialog. Three
prompts for one delete is worse than one, and it trains people to click through.

Today's chain (`inExtensionMcpServer.ts`): the call must carry `confirm:true` AND the tool must
have an `AGENT_ALERT_COPY` entry; then the setting, then elicitation, then the modal.

## Behaviour

- The server reads `clientInfo` at `initialize` and records which client it is serving.
- For a Copilot client, the in-chat elicitation is skipped: Copilot has already asked, in its own
  UI, before the call arrived. `confirm:true` and the modal stay as the backstop — the modal is
  what names the blast radius in our words.
- For Claude Code, nothing changes.
- The consent rules themselves — which tools ask, what the dialog says — do not move. This is
  about how many times the same question is put.

## Keep in mind

- `readOnlyHint` is what makes Copilot skip its own confirmation, so a read tool wrongly marked
  writable becomes a prompt on every call. The existing annotation test is the guard.
- The modal belongs to the window that owns the socket; with two windows open it can appear
  beside the wrong project. That is a pre-existing wart worth writing down here.
- The consent behaviour we ship was measured only against Claude Code
  (`consentViaChat.ts`, `inExtensionMcpServer.ts`). The live run replaces an assumption.

## Checks

- Unit: with a Copilot client identity, elicitation is not attempted and the modal still is; with
  Claude, the chain is unchanged.
- Live: run a confirmed tool from Copilot agent mode and count the prompts; run one from
  `copilot -p` (no interactive chat) and confirm it refuses rather than hanging.
