# Step 05 — Make the shared action report its own version

**From the 2026-08-10 research follow-up. Cross-repo. Not release-blocking.**

## Why

Answering "does the deployed action match HEAD?" on 2026-08-10 took credential discovery,
an `aio runtime action get`, an epoch-ms timezone reconciliation, and a git-log comparison
— and two false paths on the way (`--code` returns a binary-bundle error that greps as
"gate not deployed"; `action list` prints a zoneless datetime that reads as *before* the
commit if you assume UTC).

That cost is paid again every release, and only by someone who knows the other repo exists
and has its `.env`. Meanwhile every storefront is registered against an overlay URL with
no version in it, so a redeploy in `accs-discovery-service` silently changes behaviour for
every storefront at once (research §4, mode 10).

Make the deployed artifact state its own identity and the question becomes a request.

## Two halves

### 5a — action side (`accs-discovery-service`, separate repo, separate PR)

Have `render-pdp` answer a version probe. It already handles GETs safely and already
returns 404 for non-PDP paths (`actions/render-pdp/index.js:45`), so this is a new branch
in existing dispatch, not a new action.

- Source the value at **deploy** time, not from a hand-maintained constant — a version
  someone must remember to bump is the same problem in a new place. `package.json` version
  plus the git SHA, injected via the build, is the shape to aim for.
- Return it for a reserved path (e.g. `/__version`) that cannot collide with a real PDP.
  `parse-path.js` already rejects anything not shaped `/products/{urlKey}/{sku}`, so the
  reserved path must be handled before that guard.
- Response should carry the SHA, the package version, and the deploy timestamp. Keep it
  cheap and uncached, or cached far below the 5-minute template TTL.

This is the load-bearing half. Without it 5b has nothing to read.

### 5b — extension side (this repo)

Add a version leg to the storefront probe and print it in the diagnostics report:

```
  Overlay action: accs-discovery/render-pdp @ 9207b91 (deployed 2026-07-12)
```

Rules, same as every other leg:

- **Degrade, never fail.** An action that predates 5a returns 404 for `/__version`. That
  is "unknown", not a red verdict — most deployments in the field will be exactly this for
  a while.
- Do not compare against an expected version. The extension does not know which revision
  it wants, and inventing an expectation creates a false red on every legitimate action
  deploy. Report the fact; a human compares.
- GET only.

## Sequencing

5a ships and deploys first. 5b is worthless until a deployed action answers, and shipping
5b alone means every user sees "unknown" with no way to change that.

Neither blocks the release. Both make the *next* release's version question free.

## Tests

5b: version returned → rendered line; 404 → "unknown", no red verdict (**control**);
malformed body → "unknown", no throw. GET-only assertion extended to the new leg.

5a: tested in its own repo.

## Done when

- `GET {overlayUrl}/__version` returns a SHA sourced from the build.
- Diagnostics prints it, and prints "unknown" against an action that does not answer.
- `gate` green.

## Note for whoever picks this up

`accs-discovery-service/.env` carries `AIO_RUNTIME_NAMESPACE` and `AIO_RUNTIME_AUTH` for
`285361-249darkllama-stage` — the namespace baked into the default `overlayUrl` in
`package.json:336`. That is how the deploy state was read on 2026-08-10. It is also a
credential in a sibling repo: do not copy it here, and do not echo it. **This repo is
public.**
