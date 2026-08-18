# An agent cannot tell CDN lag from lost work, and it guesses badly

## Provenance — and a false alarm, disproved

2026-08-18. A colleague's AI agent, working in a Demo Builder storefront project
(`jogosset/agilent-b2b`), reported that "a background process on this project
(labeled `chore: sync config.json with mesh endpoint`) is periodically
force-pushing and rewriting main's history, silently discarding real commits",
and that it had "wiped out actual bug fixes twice now" — a `.hlxignore` fix and a
button fix in `commerce-b2b-negotiable-quote.js`.

**None of that happened.** Verified against both repositories:

```
gh api "/repos/{owner}/{repo}/events" → each PushEvent's before/head
gh api "/repos/{owner}/{repo}/compare/{before}...{head}" → .status
```

Every push on `jogosset/agilent-b2b` AND `jogosset/agilent-2`, across
2026-08-14 → 2026-08-18, returns `ahead` with `behind=0`. A rewrite would show
`behind > 0` or `diverged`. The chain is unbroken: each push's `before` is
exactly the previous push's `head`. **No branch was ever force-moved, and no
commit was ever discarded.**

The two "wiped out" files are intact and were never reverted:

| file | commits ever | reverted? |
|---|---|---|
| `.hlxignore` | 3 — initial, then two `AI: sync files` 90s apart | no |
| `blocks/commerce-b2b-negotiable-quote/…js` | 2 — initial, then one `AI: sync files` | no |

Both recent edits to `.hlxignore` are the agent's own — the second is it
"restoring" work that had never been lost.

**What actually happened** is in the first line of the agent's own message:
*"Not live yet — that's just normal propagation delay from the push a few seconds
ago."* It was verifying against the DEPLOYED SITE, not git. It hit CDN
propagation lag, talked itself out of the correct explanation, re-applied the
fix, then read our minified `dist/extension.js`, found the one string matching
the commit message it kept seeing (`ConfigSync`), confirmed that function was
innocent, and constructed a mechanism anyway. It never ran `git log`. One command
would have ended it at minute one.

Do not re-open this as a force-push bug. Re-run the compare check above first.

## What IS worth fixing

Three things, none dramatic, ranked by how well the evidence supports them.

### 1. The publish/sync tools know the answer and throw it away

`configSyncService` publishes, polls the CDN, and records `cdnVerified:
true|false` — logging "may need a few more seconds to propagate" when it times
out. That fact dies in the debug log. The agent that needed it never sees it.

Return it from the agent-facing tools (`sync_storefront`, `republish`) so each
call answers for itself:

- published, confirmed live on the CDN → go look
- published, not yet served → normal, not lost work, check again shortly

Better than a standing warning about lag in three ways: it is true for THIS call
rather than a general caution, it arrives at the moment the agent is about to go
look, and it costs nothing because we already compute it.

**Do not invent a duration.** If the message says how long we waited, it must be
the real polling budget read from the code.

### 2. `diagnose-demo` has no entry for "my change isn't showing"

The generated troubleshooting skill exists to route a symptom to the check that
answers it, and this symptom — the one that cost an hour and produced a false
bug report — is not in it. Add: *if your change is not on the site, check `git
log` before concluding anything. If your commit is there, your work is safe and
the site is behind; publishing takes time to reach the CDN and that delay is not
data loss.*

Generated-skill change → bump `AI_CONTEXT_VERSION`, or existing projects never
receive it (see the `ai-context-authoring` skill).

The tool response (1) catches this at the source; the skill catches the agent
that publishes some other way or looks later. Different moments, both needed.

### 3. `sync_storefront` strands the agent when it loses the race

On a non-fast-forward, `storefrontSyncService` throws `PushRejectedError` with
"Pull and rebase, then retry" — manually. The agent then pulled and **merged**,
which is where the two `Merge branch 'main'` commits in `agilent-b2b` came from.
The data was safe; the recovery was dumped on the caller, who resolved it in a
way our own message did not ask for.

Worth noting the divergence was OURS: `ConfigSync` pushes `config.json` through
the GitHub API while the agent holds a local clone. Two of our own writers on one
branch.

Fix: on a "remote moved" rejection, `git pull --rebase` and retry once.

**Two constraints.** Only retry that cause — a ruleset rejection (secret
detected) carries the same shape and replaying it changes nothing; the code
already tells them apart. And a rebase can conflict: on conflict, abort cleanly
so the working copy is exactly as found, and report. Leaving an agent's checkout
half-rebased is worse than the problem being fixed. Concentrate the tests there.

This is the symmetric twin of `commitTreeToBranch` (`efac22fe`), which already
re-reads and retries on the extension side. Same failure, same remedy, currently
one side only.

## Outcome — all three SHIPPED 2026-08-18

Done in the stated order.

**2 — `diagnose-demo`.** New "Is your work still there?" section plus a symptom-table
row routing straight to it. It says to run `git log` before concluding anything, reads
both answers, and carries the `gh api .../compare` check that settles a rewrite claim
outright. `AI_CONTEXT_VERSION` 14 → 15, so existing projects pick it up on the next
activation sweep.

**1 — `cdnVerified` surfaced.** `describeCdnPropagation` (`configSyncService.ts`) turns
the flag into one sentence and is returned as `cdnStatus` from `republish` and
`sync_content`. The wait it quotes is `CDN_VERIFY_BUDGET_SECONDS`, derived from the
polling constants rather than typed — the "do not invent a duration" constraint made
structural. It grew a third branch the design did not have: a publish that FAILED is not
propagation delay, and telling that caller to wait would send it off to wait forever.

`sync_storefront` runs no CDN verification (it publishes code, and `verifyConfigOnCdn`
only checks config.json), so there was no flag to return. It reports the pushed commit
sha instead — the same job, done with the fact that path actually has.

**3 — rebase and retry.** In `toolHandlers.syncStorefront` (`retryAfterRebase`), NOT in
`syncAndPublish`: the extension wrapper already layers its own merge-editor recovery on
that service, and the agent path was the side that had none. `PushRejectedError` now
carries `reason: 'non-fast-forward' | 'ruleset'`, so the retry branches on a typed field
rather than on message text. `rebaseOntoRemote` aborts on any failure and reports
`'aborted'`; one retry, never two.

**A bug the tests caught mid-flight.** The retry re-enters `syncAndPublish` with
`skipCommit`, which reports `committed: false` — and the handler keyed "Nothing to
commit" off `committed`. A successful recovery would have told the caller its work had
evaporated at the exact moment it had just been saved. Now keyed off `pushed`.

**A fourth fix, found while writing up the third.** The extension-side
`handlePushRejected` rebased on EVERY `PushRejectedError`, ruleset ones included. First
reported here as "a wasted round trip" — that was wrong, and tracing the path corrected
it. What the user actually got from the dashboard tile was: progress reading *"Remote has
new commits — pulling and rebasing…"* when the remote had not moved; a clean no-op rebase;
the same rule refusing the same push; and then the dialog **"Push failed after resolving
conflicts"** — naming conflicts that never existed and that nobody resolved. The accurate
diagnosis (push protection found a secret; the content has to change) was on the error the
whole time and reached only the debug log, because `showError` displays its first argument
and logs the second (`baseCommand.ts:110`). This is the exact loop the `isRulesetRejection`
branch was added to stop; that fix corrected the wording and the flow kept routing around
it.

Now gated on `reason`: a ruleset rejection skips the rebase flow entirely and is reported
as itself, after the progress notification closes (same reason `reportSyncResult` is).
Four tests, three of which were confirmed to fail with the gate removed.

## Order

2, then 1, then 3. (2) is nearly free and addresses what actually went wrong.
(3) touches files on disk in a user's project and is the only risky one.

## Kickoff prompt

> Read `.rptc/backlog/2026-08-18-agent-cannot-tell-cdn-lag-from-lost-work.md`.
> An agent working in a generated storefront project could not tell CDN
> propagation lag from lost commits, guessed wrong, and filed a false bug report
> about force-pushing (disproved — see the file; do not re-open it). Do the three
> fixes in the stated order: surface `cdnVerified` from the agent-facing publish
> and sync tools, add the git-first entry to `diagnose-demo` (bumping
> `AI_CONTEXT_VERSION`), then rebase-and-retry in `storefrontSyncService` with a
> clean abort on conflict.
