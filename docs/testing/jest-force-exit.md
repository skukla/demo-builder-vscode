# Jest worker exit: `--forceExit` and the "failed to exit gracefully" warning

## Summary

Two related things, one page:

1. The `test*` scripts in `package.json` pass `--forceExit` so the **main** jest
   process never hangs after a run. Cheap insurance; kept.
2. Full runs intermittently print `A worker process has failed to exit
   gracefully and has been force exited`. **Diagnosed 2026-08-23: this is not a
   test leak.** Do not go hunting for one on sight of the warning — audit first
   (recipe below).

## The 2026-08-23 diagnosis

Full record: `.rptc/complete/2026-06-09-jest-worker-force-exit.md`.

- A live-handle audit of **all 1130 suites** (probe in the shared setup files,
  250ms settle) found exactly two leaks — both tests making REAL network calls
  (an under-mocked `Promise.all` fetch fan-out in `commerceStoreDiscovery`, and
  a live GitHub API call in `componentManager-install-git-clone`). Both fixed.
  After the fixes, every suite returns to the baseline handle set (worker IPC +
  stdio) within 250ms of finishing.
- The residual warning comes from jest-worker's `FORCE_EXIT_DELAY = 500` — a
  **hardcoded** wall-clock deadline between the end-of-run END message and
  worker exit (verified in jest-worker 30.2.0). The worker never calls
  `process.exit()`; it must drain its event loop, and at `maxWorkers: 75%`
  twelve workers tear down at once while the main process aggregates results.
- On a warned run, a SIGTERM-handler dump installed in the workers **never
  executed**: the laggard's event loop was blocked in final-suite teardown/GC,
  too busy to service a signal — not idling on a leaked handle. This is also
  why `--detectOpenHandles` reports nothing.
- The rate is machine-state-sensitive (~44% of full local runs, unchanged by
  the leak fixes). A few clean runs do not mean "fixed"; a warned run does not
  mean "regressed".

The old version of this page blamed real `setTimeout` calls in
`parallelExecution.test.ts`. That test has used fake timers for months; the
claim was stale.

## When to actually investigate

Investigate only if the warning becomes *reliable* (every run) or CI wall-clock
degrades. The audit that settles it in one run:

```ts
// Append to tests/setup/node.ts AND tests/setup/react.ts, run the full
// suite once, then REMOVE. Any suite reporting more than
// handles=[Pipe|Socket|Socket] after the settle is a leaker.
const REAL_SET_TIMEOUT = global.setTimeout.bind(global);
afterAll(async () => {
    await new Promise((r) => REAL_SET_TIMEOUT(r, 250));
    const handles = (process as any)._getActiveHandles?.() ?? [];
    // eslint-disable-next-line no-console
    console.error(
        `[LEAK-PROBE] ${expect.getState().testPath} :: handles=[${handles
            .map((h: any) => h?.constructor?.name)
            .join('|')}]`,
    );
});
```

Redirect the run to a file (never pipe jest), then:
`grep LEAK-PROBE <file> | grep -v 'Pipe|Socket|Socket]'`. Pair it with a
positive control: temporarily add `setInterval(() => {}, 60000)` to any one
test and confirm the probe flags that suite.

A leaked pair of `Socket` handles usually means an unclosed client connection
(each connection is two handles in-process: client + accepted end). A
`TLSSocket` or `GetAddrInfoReqWrap` means a REAL network call escaped a mock —
check for `mockResolvedValueOnce` feeding a `Promise.all` fan-out, and for
`jest.spyOn(globalThis, 'fetch')` fallthrough.

## Why not "fix" the residual warning?

- The 500ms deadline is not configurable, in child-process or worker-threads
  mode (both set the warning flag the moment the timer fires).
- Fewer workers reduce contention but `maxWorkers: 25%` costs ~2× wall clock
  (35s vs 18s measured) to silence a benign line. Rejected.
