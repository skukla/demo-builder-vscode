# Step 02 — Close the three setup-time silent successes

**Research rec 3. Blocks release. Independent of step 01.**

Each of the three is a case where setup already knows PDPs will not work and the user is
told the run succeeded.

---

## 2a — Render the `warning` the webview already receives

`storefrontSetupHandlers.ts:417` sends
`{ ...(overlayFailed && { warning: BYOM_OVERLAY_REGISTRATION_FAILED_MESSAGE }) }`.
`StorefrontSetupStep.tsx` contains **zero** references to `warning` — it destructures
`{ message, githubRepo }` only. The full sentence is written, sent, and dropped; the user
sees only the changed `message`.

**Change:** render it. Use the step's existing notice convention rather than inventing
one — check what `StorefrontSetupStep` already has for non-fatal state before adding a
component (`reuse-first`).

**Test:** payload with `warning` renders the text; payload without it renders no notice.
The second case is the control — without it a component that always renders passes.

---

## 2b — Report BYOM-off as a caveat, not as success

`storefrontSetupPhase3.ts:285` — `if (edsConfig.byomOverlayUrl && !registered)`. When
`demoBuilder.byom.enabled` is false, or `overlayUrl` fails validation
(`edsHelpers.ts:235-237` — non-https, non-loopback, or >2048 chars), `byomOverlayUrl` is
undefined, so the guard skips, no flag is set, and the run ends on
`"Storefront setup completed successfully!"` for a storefront that can never serve a PDP.

**Change:** distinguish three outcomes, not two.

| Overlay configured? | Registered? | Report |
|---|---|---|
| yes | yes | success |
| yes | no | existing failure path (unchanged) |
| **no** | n/a | **new:** success *with* a caveat naming why PDPs will not render |

Word the caveat for the two distinct causes — deliberately disabled vs. a URL that failed
validation. The second is a misconfiguration the user can fix; the first may be intended.
Do not reuse `BYOM_OVERLAY_REGISTRATION_FAILED_MESSAGE`; it says "was not registered",
which is wrong here — there was nothing to register.

**Test:** three cases matching the table, asserting on the completion payload. The
"configured + registered" row is the control.

---

## 2c — Consume `Pdp404InstallResult`

`installSmart404Handler` returns `{ installed, reason }` (`pdp404HandlerPublisher.ts:35`).
Both call sites bare-`await` it — `storefrontSetupPhase2.ts:109`,
`edsResetRepoHelper.ts:301` — and the type has no consumer in `src/` or `tests/`. Every
skip path (no `scripts/delayed.js`, unparseable overlay URL, GitHub commit failure)
reaches only the debug log while the run reports Complete.

**Change:** capture it and fold `installed: false` into the same caveat channel as 2b.
Keep the step non-fatal — that is deliberate (`pdp404HandlerPublisher.ts:110-115`) and
should not change. This is about reporting, not about failing the run.

Both call sites, not one. The reset path is the one users hit when repairing a broken
storefront, so a silent skip there is the worse of the two.

**Test:** a skip reason reaches the completion payload from each call site; an
`installed: true` run produces no caveat (control).

---

## Sequencing note

2b and 2c both add a caveat to the completion payload. Do 2b first and let 2c join the
channel it establishes, rather than building two.

## Done when

- All three report through one caveat channel.
- `StorefrontSetupStep` renders it.
- Each has a passing test **and** a passing control.
- `gate` green.
