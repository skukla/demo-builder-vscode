# Step 07 — One consent prompt, not three

Depends on step 03. Gated on a live run.

## The problem

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
