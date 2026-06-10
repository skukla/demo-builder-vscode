---
id: 2026-06-09-jest-worker-force-exit
title: Jest worker process force-exits during parallel test runs
status: backlog
created: 2026-06-09
priority: medium
---

# Jest worker process force-exits during parallel test runs

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
- **Possible smoking gun.** During the `--detectOpenHandles` scan, `tests/features/mesh/ui/steps/useMeshDeployment.test.tsx` emitted React `act()` warnings on `useMeshDeployment.ts` lines `203` and `208`. Three lines later, the hook starts a `setTimeout(... 180_000ms)` and stores its ID in a ref:

  ```ts
  // src/features/mesh/ui/steps/useMeshDeployment.ts:211
  timeoutIdRef.current = setTimeout(() => {
    dispatch({ type: 'TIMEOUT' });
  }, 180_000);
  ```

  If the test unmounts before this timer fires AND the cleanup path doesn't clear it (or the dispatch fails because the component is gone), the worker stays alive until the 180s timer fires. Plausible source — not yet confirmed.

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
