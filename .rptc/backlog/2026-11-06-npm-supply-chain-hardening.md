---
id: PL-94
kind: chore
area: platform
needs: []
value: high
status: active
---

# Harden what we take from npm, and act on the advisories already in the tree

Filed 2026-11-06. The owner is wary of npm after the recent attacks on the registry, raised when a
CSV parser was proposed for the export-to-datapack tool (we wrote our own instead).

## Where we stand (measured 2026-11-05)

- 22 runtime packages declared in `package.json`; with what they pull in, 569 packages in the
  runtime tree (`package-lock.json`, entries not marked `dev`). 49 dev packages on top.
- **Already protecting us**: the lockfile pins every version; CI installs with
  `npm ci --ignore-scripts` (`.github/workflows/ci.yml`), so install scripts, the usual route for the
  recent attacks, never run there.
- **Gaps**: no `.npmrc`, so a local `npm install` runs install scripts; no automated scan (no
  `npm audit` step, no Dependabot); `^` ranges let an `npm install` that rewrites the lockfile take
  a version published minutes earlier.
- **Removed the same day**: `crypto-js` (nothing read it), `axios` (our code never imported it;
  Adobe's Console library brings its own), `@types/uuid` and `uuid` (Node's `crypto.randomUUID`).
  The lockfile change was deletions only.

## `npm audit --omit=dev`, 2026-11-05: 34 advisories (1 critical, 18 high)

The ones that touch what this extension does, from the audit's own titles:

| Package | Advisory | Fixed in | Why it matters here |
|---|---|---|---|
| `adm-zip` (direct) | "Crafted ZIP file triggers 4GB memory allocation"; "extraction follows destination symlinks" | 0.6.1 (outside `^0.5.16`) | It reads datapack zip files SCs load. `readDatapackZip` has its own unpacked-size guard; check whether that guard runs before adm-zip allocates. We read entries in memory and do not extract to disk, so the symlink one is a lead to confirm, not a finding. |
| `@modelcontextprotocol/sdk` (direct, pinned 1.29.0) | OAuth client credentials to a server-chosen authorization server; experimental tasks not tied to their session | 1.32.2 | Runs the in-extension agent server. The second also says this SDK version already has "tasks", which answers part of [[AI-78]]. |
| `zod` (direct) | memory exhaustion validating oversized constrained collections | 4.6.7 (a major) | Validates pack rows and tool inputs. |
| `proxy-addr` (critical, transitive) | IP spoofing via IPv4-mapped IPv6 trust subnet | in range | A server-side Express dependency; check whether anything we run trusts proxies at all before treating it as ours. |

Most of the rest come in through Adobe's libraries (`aio-lib-ims`, `aio-lib-state` via `@azure/cosmos`)
and the MCP SDK's server dependencies (`body-parser`, `@hono/node-server`).

## Proposed, each needing the owner's go (an upgrade is new code from npm)

1. `.npmrc` with `ignore-scripts=true`, so local installs match CI.
2. A CI step that fails on a new high or critical advisory in the runtime tree, with a ledger for the
   ones judged not to apply, the way the other SOP gates work.
3. A waiting period before taking a newly published version. Find out first which mechanism our
   npm supports. Not checked: whether npm has a minimum-release-age setting, or whether we pin exact
   versions and update deliberately.
4. Upgrade `adm-zip` to 0.6.x after reading its changelog, and the MCP SDK to 1.32.x. Both are
   direct, both have a fixed version, and both sit on paths that read input from outside.
5. Triage the rest: which advisories reach code this extension runs, and which sit in server code
   it never starts.

## Shipped so far

- 2026-11-05  chore(deps): drop crypto-js, axios, @types/uuid and uuid (`f196c2f25`)
