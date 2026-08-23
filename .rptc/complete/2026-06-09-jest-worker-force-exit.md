---
id: 2026-06-09-jest-worker-force-exit
title: Jest worker process force-exits during parallel test runs
status: backlog
created: 2026-06-09
priority: medium
---

# Jest worker process force-exits during parallel test runs

> ## CLOSED 2026-08-23 — diagnosed to the mechanism; the leaks that existed are fixed; the residual warning is not a test leak
>
> **Two real leaks were found and fixed** by auditing every suite's live handles
> at file end (probe in the shared setup files, 250ms settle, all 1130 suites):
>
> - `commerceStoreDiscovery.test.ts` — two error-path tests queued ONE
>   `mockResolvedValueOnce` while the SUT's `Promise.all` fires THREE fetches;
>   calls 2–3 fell through the `jest.spyOn(globalThis, 'fetch')` to the REAL
>   fetch. Four live requests per run; each held a TLSSocket + an in-flight DNS
>   lookup for seconds (`tls.connect` creates the socket object before DNS
>   resolves, and a nonexistent `.test` name takes seconds to fail).
> - `componentManager-install-git-clone.test.ts` — the install-by-tag path calls
>   `fetchLatestReleaseTag`, which hit the LIVE GitHub API (`api.github.com`
>   404'd and the code fell back to the configured tag, so the test passed while
>   making a real network call). Now mocked as a 404 — same fallback, offline.
>
> **The residual warning is NOT caused by test code — pinned, not assumed:**
>
> - After the fixes, every one of the 1130 suites returns to the baseline handle
>   set (worker IPC + stdio) within 250ms of finishing. Nothing leaks.
> - The warning fires from jest-worker's `FORCE_EXIT_DELAY = 500` — a HARDCODED
>   wall-clock deadline (verified in jest-worker 30.2.0, same in 27) between the
>   end-of-run END message and worker exit. The child never calls
>   `process.exit()`; it must drain its event loop. At `maxWorkers: 75%`, twelve
>   workers tear down simultaneously while the main process aggregates results.
> - A SIGTERM-handler dump was installed in the workers (jest's force-exit sends
>   SIGTERM before SIGKILL, so the handler fires exactly on the force-exited
>   worker). On a warned run, the dump NEVER RAN: the laggard's loop was blocked
>   (final-suite teardown / GC under CPU contention), too busy to service a
>   signal — not idling on a leaked handle. `--detectOpenHandles` agreeing
>   (nothing found) now makes sense: there is nothing to find.
> - Rate is machine-state-sensitive: 3/8 uninstrumented runs warned post-fix
>   (~baseline 44%); the same suite then went 0/10 under light instrumentation.
>   Do not read a few clean runs as "fixed" or a warned run as a regression.
>
> **Standing guidance:** the warning does not indicate a leak in this repo's
> tests unless a handle audit shows one (recipe in `tests/README.md`). The only
> lever that reduces the rate is fewer workers — rejected: 25% costs ~2× the
> wall clock to silence a benign line. The 500ms deadline is not configurable.

## Symptom

When running broad Jest sweeps in parallel (e.g. across multiple feature directories), the run finishes successfully but Jest emits:

```
A worker process has failed to exit gracefully and has been force exited.
This is likely caused by tests leaking due to improper teardown. Try running
with --detectOpenHandles to find leaks. Active timers can also cause this,
ensure that .unref() was called on them.
```

All tests pass. The warning doesn't fail CI. It does add ~5-30s to the wall-clock time as Jest waits before force-exiting workers, and it obscures any genuine new leakage that might be introduced later.

## What we know

- **Pre-existing.** Observed today (2026-06-09) on multiple branches that had no overlapping changes: PR #44 merge verification on develop, the BYOM Phase 1 ship, and the auth-fix branch. The warning was present in all three contexts.
- **Single-suite reproduction.** The warning also appears when running just `tests/features/mesh/commands/deployMesh-storage.test.ts` in isolation, so the leak isn't from cross-suite state contamination.
- **`--detectOpenHandles` reports nothing.** Running the same sweep with that flag finds zero open handles. This means the leak is something Jest's tracker doesn't see — typically a timer set up via a path the tracker doesn't instrument (e.g., inside a mocked module that wasn't fully cleared), or a Promise that never settles.
- ~~**Possible smoking gun.**~~ **DEAD — the file no longer exists.** This named a
  `setTimeout(…, 180_000)` stored in a `timeoutIdRef` inside the `useMeshDeployment` hook
  (then under `src/features/mesh/ui/steps/`), reached via `act()` warnings from its test.
  There is no `useMeshDeployment` anywhere in `src/` today (verified 2026-08-13), so the
  hypothesis cannot be checked and the investigation steps below that depend on it are void.

  The line reference is deliberately not repeated here: it would keep §4 of
  `rptc-hygiene-scan` reporting a hit that everyone already knows about, and a scan with a
  permanent known-false entry is one people stop reading.

  Kept rather than deleted because the SHAPE is still the thing to look for — an
  un-`unref`'d long timer whose component unmounts first — but do not go looking at that
  path. Cite a symbol next time: a line number in this repo has a half-life of about a day,
  and this one outlived its whole file.

## What we ruled out

- BYOM Phase 1 ship (`d859e0ff`): didn't introduce the warning; it was there beforehand.
- AI context update (`871023df`): same.
- Auth fix branch: same. Three new test files added today, none use timers.
- The auth fix's new module-level imports (`projectAppBuilderPredicate.ts`, dynamic imports of `ComponentRegistryManager`): all pure / synchronous classes with no module-level timers, intervals, sockets, or listeners.

## Investigation steps

1. **Confirm the 180s timer is the source.** Add a `console.log` at the top of `useMeshDeployment.ts:211`, run `tests/features/mesh/ui/steps/useMeshDeployment.test.tsx` standalone, see if the log fires after the test reports done.
2. **Check the cleanup path.** Verify `useMeshDeployment`'s unmount handler clears `timeoutIdRef.current`. If it does, check whether the test ever reaches the code path that sets the timer in the first place (the `DEPLOYMENT_SUBMITTED` dispatch on line 208).
3. **Add `.unref()` if confirmed.** Calling `.unref()` on the timer lets the process exit even if the timer is still scheduled. Acceptable defense even if the cleanup path is correct.
4. **Audit other long-lived timers in test-reachable code.** Same pattern likely exists elsewhere.

## What this would fix

- Cleaner CI logs (no false-alarm warnings).
- ~5-30s faster broad sweeps.
- Genuine new leakage would be visible in CI instead of hidden behind a pre-existing warning.

## What this would NOT fix

- Test correctness — all 2,391+ tests already pass.
- Anything user-visible.

## Effort

~30 min to investigate + confirm, ~10 min to fix if the timer is the source. Could be longer if there are multiple leak sources.

## Priority

Medium. Not blocking any feature work. The warning's noise floor obscures genuine new leakage, which is a real-but-future risk to test signal quality.
