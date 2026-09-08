---
id: PL-52
kind: fix
area: platform
needs: []
value: med
status: backlog
---

# A hook-proof suite fails under full parallel load and refuses pushes

Split out of [[PL-34]] on 2026-09-08 so it does not close with it. PL-34's
done-condition never covered this, and burying a recurring failure inside a
shipped item is how it stops being anybody's.

**Four occurrences in one day, and the fourth cost something.**

`tests/hooks/rule-proofs.test.ts` reports two cases of
`11-jest-redirect.proof.sh` as `expect=pass got=BLOCK` — "correct redirect order"
and "no redirect at all". Every time, it passes 3/3 immediately afterwards when
run alone, and the next full gate is green at 1559 suites.

On the third occurrence it fired inside the **pre-push hook** and REFUSED a push
whose tree was green. The very next `npm run gate` passed, and the retried push
went through with no change to the tree. That is the exact failure [[PL-41]] was
filed to prevent: a gate that fails for a reason unrelated to the change teaches
people to re-run rather than read, which is how a real failure gets waved through.

**What has been ruled out.** A same-session edit to the router's pre-filter was
suspected on 2026-09-08 and is not the cause: `11-jest-redirect.proof.sh` contains
no `tests/sop` or `tests/helpers` string, so the token added that day cannot reach
it. Earlier occurrences also predate that edit.

**What is known.** It only happens under a full parallel run. The failing cases are
the ones that expect *no* block, so something is making the router block a payload
it should pass, or making the proof read a block that did not happen. Both failing
cases run the router as a subprocess from a shell script, inside a jest worker,
while up to a dozen other workers are doing the same.

**Recorded as an observation, not a diagnosis.** No falsifying command exists yet,
and this repo's rule is that a proposed cause needs one before it is written down.

## Where to start

The shape suggests contention rather than logic, so measure before theorising:

- Run `rule-proofs` alone with `--maxWorkers` forced high, and separately with the
  full suite, and see whether the failure tracks worker count rather than content.
- The router writes once-per-session marker files under `${TMPDIR}`. Two suites
  running proofs concurrently share that namespace, and a marker written by one
  could suppress or alter another's expected outcome. `11-jest-redirect` is
  `rule_once=0`, so this should not apply — which is worth confirming rather than
  assuming, because the sibling proofs run in the same directory.
- `jest-concurrent` reads a live process list unless `DBV_JEST_PS` is set. During a
  full run, real jest workers ARE in that list. If any proof invokes the router
  without that seam, its result depends on what else is running.

## Done when

The failure is either reproduced deliberately and fixed, or shown to be impossible
and the two cases re-pinned with the reason. A fourth occurrence with no diagnosis
is not a state this can stay in — it is already teaching a re-run reflex.

## Related

[[PL-41]] states the principle. [[PL-34]] carries the first three sightings in its
log.
