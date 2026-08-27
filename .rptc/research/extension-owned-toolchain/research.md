# Extension-owned toolchain — the bare-metal-minimum principle

**Date:** 2026-08-27 (evening, owner + loop session)
**Trigger:** the starter-kit "cannot build with Adobe's latest CLI" incident —
which turned out to be a stale dependency tree inside a version-current global
aio install (see the retraction on AB-1d, and PL-6).

## The owner's principle (design north star, stated 2026-08-27)

> Keep the surfaces the extension must maintain on the user's bare-metal
> system at an absolute minimum, while owning what belongs to the extension
> rather than to the system as a whole.

A tool belongs on bare metal only when the user genuinely shares it with the
rest of their system AND our management of it can stay additive or check-only.
Anything that is really an implementation detail of the extension — the user
never asked for it, only for our features to work — belongs in
extension-owned storage, versioned and updated as deliberate release acts.

## The current bare-metal surface, classified

All five prerequisites install into the user's global system today
(`prerequisites.json`, read 2026-08-27):

| Tool | Verdict under the principle |
|---|---|
| git | SYSTEM. Users own it. Check + bootstrap-if-absent only. Correct today. |
| fnm | SYSTEM (bootstrap). The smallest global footprint that buys version isolation for everything it manages. Correct today. |
| node | Already follows the principle: additive per-version store, extension selects per invocation (`useNodeVersion`), user default untouched. The model citizen. |
| aio CLI + plugins | **MISPLACED.** A mutable global the extension depends on for correctness and mutates, yet purely our implementation detail from the user's view. Belongs to the extension. |
| homebrew | The DEEPEST global footprint, present mainly to bootstrap the others. Audit whether it can become optional (fnm has a curl installer; macOS ships git via Xcode CLT). Not urgent; deserves the question. |

## The evidence chain that exposed the misplacement (all measured live)

1. The kit failed `aio app build` with 3× webpack "Self-reference dependency
   has unused export name" — on aio-cli 11.1.2, npm's latest.
2. A clean-room clone + their pinned Node reproduced it → wrongly ruled
   "Adobe's problem". **Retracted**: the owner's "make sure we test with the
   latest CLI" prompted a fresh `npm install -g @adobe/aio-cli` — SAME
   version, but its freshly resolved tree carries webpack 5.110.0 (vs 5.107.2
   frozen at the old install date), and the build passes. Version-number
   equality cannot detect this staleness class (PL-6).
3. Consequence: as long as our deploys run on a mutable global we do not own,
   someone else controls whether "first try" works.

## Options examined (with the owner, in order)

- **A. Signature pre-flight** (webpack version floor check): a one-off wearing
  a general name; floor rots; enumerate-bugs-forever. Rejected.
- **"Keep prerequisites updated"**: right instinct, wrong triggers — version
  compare is blind to the class (proven above), scheduled refresh is blind in
  both directions AND moves users to always-latest = always-untested. The
  safe form of "keep updated" for mutable globals is evidence-triggered.
- **B. Consent-gated refresh-and-retry** inside the add flow: on a
  toolchain-class build failure, ask once, refresh the global CLI, retry
  within the same operation. Generic (responds to failure, predicts nothing),
  first-try preserved from the user's chair (retry is internal), ~half a day.
  Mutates the user's global — with consent, as a bridge.
- **C. Extension-owned pinned CLI** (THE principle executed): one managed
  `@adobe/aio-cli@<pin>` in `~/.demo-builder/tools/aio/<version>/`, ensured
  on demand (same shape as `ensureFnmNodeVersion`), invoked by the extension's
  own operations. Sign-in shared for free — aio config lives in
  `~/.config/aio`, keyed to the home dir not the binary (verified).
  Residual honesty: npm resolves transitive deps at install time, so the pin
  controls the version, freshness comes from install recency; if drift ever
  bites, refreshing OUR copy needs no consent (B becomes trivial inside C).

## The staged plan (agreed shape)

The ARTIFACT is extension-wide — one managed CLI, one pin, core-level beside
the executor. ADOPTION is incremental:

1. **Slice 1**: the facility + App Builder deploys adopt it (where the
   evidence and release pressure are). ~1 day.
2. **Slice 2**: mesh + Console operations migrate — needs its own live
   verification pass, PLUS plugin pinning (api-mesh, commerce plugins install
   per-CLI) and the executor's `startsWith('aio ')` Adobe-command detection
   fixed for full binary paths. ~2–3 days.
3. **Payoff**: retire `aio-cli` from the user-facing prerequisites screen —
   the extension brings its own; a global install becomes optional.
4. Alongside (this epic): the install LEDGER for the remaining bare-metal
   tools, and the homebrew bootstrap audit.

## End state under the principle

Bare metal: git, fnm, additive node versions — nothing mutable, nothing that
is really ours. Extension-owned: the CLI + plugins (pinned), all npm tooling
(already isolated in `.demo-builder-mcp/`), everything under `~/.demo-builder`.
The "a global tool rotted underneath us" class becomes structurally impossible
for everything the extension owns.
