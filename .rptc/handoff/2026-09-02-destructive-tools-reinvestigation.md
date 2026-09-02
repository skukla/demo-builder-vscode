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

**Recommendation: gate both.** Keep `destructiveHint: true`, add `confirm: true`, and
replace the comment with what is actually true — that they overwrite live content, that
re-running is safe, and that the gate is about the first run rather than the second.

Against it: republish is a routine, frequently-used recovery step ("the lightweight retry
for a prewarm that failed at creation", per its own code comment), and a gate makes the
agent path two calls instead of one. That is a real cost and it is the reason this is a
decision rather than a fix.

## Separate lead found while reading — not part of the question

`republishStorefrontConfig` writes `config.json` with a direct
`fsPromises.writeFile(configJsonPath, ...)`. It does not go through the ADR-013
hash-and-skip seam in `generatedFileWriter.ts`.

This repo's second stated property is that a user's own edits are never overwritten, and
it says specifically that "a writer that calls `writeFile` directly has quietly opted out
of that". Whether that applies here depends on something I could not settle by reading:
whether `config.json` is meant to be hand-editable at all, or is purely generated output
that republish exists to regenerate. If it is generated-only, this is fine as written and
worth a comment saying so. If a consultant may hand-edit it, republish silently discards
that.

Not filed as a defect — filed as a question with the file:line to check.
