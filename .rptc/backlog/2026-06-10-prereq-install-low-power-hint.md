# Prereq install timeout — surface "check power state" hint to the user

**Filed:** 2026-06-10
**Origin:** Field case `v1.0.0-beta.113`. Colleague's aio-cli plugin install timed out at 180s and the post-install check at 10s on a critically low-battery MacBook. macOS aggressively throttles CPU + network + disk under low battery (sometimes 4-5x slower than baseline) — every install / verify timeout we set assumes a healthy power state. The error users see right now is "Command timed out after 180000ms," which doesn't suggest a fix. A one-line hint telling them to plug in and retry would resolve this case (and others like it) without code changes anywhere else.
**Status:** Ready — single message string change in one error formatter; pick up any time.

## Provenance

Her install log:

```
16:44:51 → 16:49:34 [Prerequisites] Completed step: Install Adobe I/O CLI (Node 20)   ← 4m 43s, succeeded
16:49:34            [Prerequisites] Installing plugin API Mesh Plugin for Node 20
16:52:34 [warning] [Command Executor] Command timed out after 180000ms
16:52:34 [warning] [Prerequisites] Failed to install plugin API Mesh Plugin for Node 20: Command timed out after 180000ms
16:52:45 [warning] [Command Executor] Command timed out after 10000ms                ← aio --version verify
16:52:55 [warning] [Prerequisites] Adobe I/O CLI installation did not complete
```

The aio CLI install itself took 4m 43s (vs the 60s `estimatedDuration` in `prerequisites.json`) — that's a ~5x slow-down. The api-mesh plugin install then couldn't finish in 180s, and the post-install verification couldn't finish in 10s. None of those timeouts are *wrong* on a healthy laptop. They're all unreachable on a throttled one.

The user-facing message right now is the raw Command Executor timeout. That's accurate but unactionable: nothing in the message hints "your machine is in a degraded state, plug it in." The colleague had to send the log over and have someone read it before "low battery" became visible.

## Goal / scope

Add a contextual hint to prereq install timeout errors so the user has one obvious thing to try before retrying. Three options ranked by scope:

1. **Static hint, always shown on install timeout** — append "If your laptop battery is low, plug it in and retry — macOS throttles CPU and network aggressively under low-power conditions, which causes installs to time out." to the formatted error. Cheap, always-correct, low signal-to-noise for the common case (it'll show even on healthy machines that timed out for other reasons, but it's a useful default).
2. **Battery-aware hint** — call `pmset -g batt` on macOS (or equivalent on other platforms) to detect low-battery state, then conditionally include the hint. Better targeting, more code, platform-specific.
3. **Detect throttling at install time** — instead of reactive messaging, surface a warning at the START of an install when battery is low ("Battery is at X%. Installs may take longer than usual."). Most useful but biggest code change.

Recommend **option 1**. It's the smallest diff with the largest user benefit: this lesson is hard-won (it took back-and-forth log triage to identify), and a paragraph in the error message saves that next time. The over-firing on non-battery timeouts is acceptable — "plug your laptop in" is never bad advice during a multi-minute install.

## Execution plan

1. Find the install timeout error formatter. Likely candidates: `src/features/prerequisites/handlers/installHandler.ts` (the install path that catches plugin install failures around line 332) and the AuthenticationErrorFormatter / similar surface for the "Adobe I/O CLI installation did not complete" message at line 456.
2. Append the hint to the user-facing message string. Don't replace existing context — the original "Command timed out after Xms" line stays for debugging; the hint goes on a new line below it.
3. Suggested copy:
   > **Hint:** macOS aggressively throttles CPU, network, and disk under low-battery conditions, which can push installs past these timeouts. If your laptop is unplugged or battery is below ~30%, plug in and retry the install.
4. Add one test asserting the hint string appears in the formatted error when a timeout error is raised through the install path.

## Constraints

- Don't try to detect battery state in this commit. That's option 2/3, and it doesn't pay for itself yet — the hint string alone resolves the field case without platform-specific code.
- The hint is install-specific. Don't add it to *every* timeout error in the codebase (token validation timeouts, polling timeouts, etc. have different root causes and different remediations).
- Keep the language Mac-specific only if the install handler's audience is Mac-only. If the prereq system runs on Windows/Linux too, generalize ("Operating systems may throttle CPU and network under low-power conditions" or similar).

## Kickoff prompt

```
Append a "check power state" hint to prereq install timeout errors (see
.rptc/backlog/2026-06-10-prereq-install-low-power-hint.md).

Find the error formatter at `src/features/prerequisites/handlers/installHandler.ts`
around the plugin-install failure warn (line 332) and the "installation did not
complete" warn (line 456). When the formatted error is a timeout, append a
hint on a new line:

  "Hint: macOS aggressively throttles CPU, network, and disk under low-battery
   conditions, which can push installs past these timeouts. If your laptop is
   unplugged or battery is below ~30%, plug in and retry the install."

Don't replace the existing technical message — the timeout details stay for
debugging; the hint goes on a new line below. Don't add platform detection
or battery state checks in this commit (separate backlog item if needed).
Add one test asserting the hint appears in the formatted error on timeout.
~15 minutes.
```
