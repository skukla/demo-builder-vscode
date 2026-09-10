# Reinvestigated: are `republish` and `sync_content` destructive?

Asked for after the overnight loop flagged that two tools declare themselves destructive
while their own file explains they are safe to re-run and the "same class" as a third tool
that declares itself NOT destructive.

**The short answer: the annotations are RIGHT, the comment is WRONG, and the thing that
actually needs a decision is neither of those — it is the missing confirmation.**

## What each of the three actually does

| Tool | Where | What it does | Additive? |
|---|---|---|---|
| `sync_storefront` | `src/mcp-server.ts:207` | "Git add, commit, and push changes in the storefront directory" | **Yes** — a commit adds; nothing is replaced |
| `republish` | `src/features/ai/server/storefrontTools.ts:64` | Regenerates `config.json`, writes it into the component, pushes to GitHub, publishes to the Helix CDN | **No** — overwrites |
| `sync_content` | `src/features/ai/server/storefrontTools.ts:123` | The five-step pipeline: EDS site config → config.json → code → permissions → publish all site content to the CDN | **No** — overwrites |

Verified by reading `republishStorefrontConfig` and `republishStorefrontContent` in
`src/features/eds/services/storefront/storefrontRepublishService.ts`. Neither DELETES
anything — there is no unpublish, no teardown, no `rm` on either path. Both OVERWRITE:
the repo's `config.json`, and whatever is currently live on the CDN.

## So the annotation is correct

MCP's `destructiveHint` means "may perform destructive updates" as opposed to "performs
only additive updates". Replacing live customer-facing content is a destructive update
even though nothing is deleted, and even though re-running produces the same result. That
is what `idempotentHint` is for, and no tool in this repo uses it.

`destructiveHint: true` on both should STAY.

## The comment is what is wrong

`storefrontTools.ts` says they are "idempotent (safe to re-run), so [they need] no confirm
gate — same class as the existing `sync_storefront` tool."

`sync_storefront` commits and pushes to a git branch. `republish` and `sync_content`
overwrite what visitors are served. They are not the same class, and citing the additive
one is where the justification for skipping the gate comes from.

This is the failure mode this repo already names: *a comment describing what another
module does is a claim, not documentation*. Nothing kept it true, and it suppressed the
question below.

## The decision that is actually open

**Two tools that overwrite live customer-facing content can be called by an agent with no
confirmation.** Every other tool in this repo that writes to a live Adobe, GitHub or
DA.live resource is gated — `delete_page`, `reset_eds_project`, `migrate_storefront_name`,
`set_site_admin`, `delete_github_repo` and the rest all require `confirm: true`.

Being idempotent is a good argument for it being SAFE TO RETRY. It is not an argument for
it being safe to start unasked: the first run is the one that replaces what is live, and
"you can run it again" does not restore the previous content.

**RESOLVED 2026-09-02: both gated.** The owner's condition was that an agent must still
be able to work without interaction, and it can — see below.

**Recommendation was: gate both.** Keep `destructiveHint: true`, add `confirm: true`, and
replace the comment with what is actually true — that they overwrite live content, that
re-running is safe, and that the gate is about the first run rather than the second.

Against it: republish is a routine, frequently-used recovery step ("the lightweight retry
for a prewarm that failed at creation", per its own code comment), and a gate makes the
agent path two calls instead of one.

## Why gating them does NOT require a person

The `confirm` field is a parameter the AGENT supplies — the code calls it "the
agent-supplied honor-system parameter". It is not a human-presence check. What it buys is
that an unconfirmed call answers with what WOULD happen, and that the confirmed call
carries the marker the consent layer keys on.

Whether a human is asked is a separate, controllable layer
(`inExtensionMcpServer.ts`), in this order:

1. `demoBuilder.ai.requireAgentConsent` is OFF → proceed, logged as "consent pre-granted"
2. otherwise ask in the CHAT (MCP elicitation), because that is where the person is looking
3. otherwise the native VS Code modal, which is the floor

So an unattended run with that setting off is unaffected: the agent passes `confirm: true`
itself and nothing prompts. The setting's own description already says exactly this —
"Turn off for unattended/headless use".

The ordering in step 1 is load-bearing and was paid for: headless `claude -p` DECLARES
elicitation support and then auto-declines it (measured, 12ms refusal), so a chat-first
order turned a standing grant into a guaranteed refusal and two journeys built green but
could not tear down.

## What shipped

- Both tools take `confirm` and refuse without it, naming the target — `delete_page`'s
  pattern, and the reason is the same: a consent prompt saying only "Republish" tells
  nobody what is about to be replaced.
- The gate sits BEFORE the credential checks, so the refusal explains itself rather than
  answering "sign in first" to someone who has not been told what the tool does.
- Both descriptions rewritten. The same file already carried a note that the write tools'
  names are ambiguous in a dialog, and the two it picked as examples were these two.
- The file comment claiming they are the "same class as sync_storefront" is corrected.

## Separate lead found while reading — ANSWERED, not a defect

`republishStorefrontConfig` writes `config.json` with a direct
`fsPromises.writeFile(configJsonPath, ...)` rather than through the ADR-013 hash-and-skip
seam. I raised it because this repo's second stated property is that a user's own edits
are never overwritten, and it says specifically that a writer calling `writeFile` directly
has opted out of that.

**Closed the same day, and the lead was wrong twice over.**

The owner confirmed `config.json` is not meant to be hand-edited: it is generated entirely
from the project's own configuration, and regenerating it is what a republish IS. There is
no user edit to preserve, so a plain overwrite is correct.

The rule was also mis-applied. The hash-and-skip seam is scoped to the generated AI bundle
— every one of its callers is under `aiBundle/`, and CLAUDE.md says "generated-BUNDLE
write", not "every generated file". Nothing bans direct writes elsewhere, and no enforcer
was bypassed.

The answer is now a comment at the write site, so the next person to notice a bare
`writeFile` next to a rule about not clobbering edits finds the reason instead of filing
this again.
