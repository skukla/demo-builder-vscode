# Step 05: keep the base honest

## What

The base must describe the code actually in the repository, or the next update replays a
change already applied.

| Event | `boilerplateBase.commit` |
|---|---|
| Reset | back to `project.demo.builtWith.lkg` (Reset returns the code to the colleague's head) |
| Change demo source | recomputed from the new source's `builtWith`, or removed |
| Save as demo package | written into the new package's `builtWith.lkg`, so the next colleague inherits the current base |
| The colleague's track brings in their own boilerplate update | **D4, open** |

## D4: the open question

When the colleague updates their own storefront to a newer boilerplate and the SC takes
"Changes from …", the SC's code moves to a newer Adobe base without our record moving.

Options:

- **A. Re-read the base from the colleague's repository after each colleague-track update**,
  if their repository carries its description file with `builtWith`. Exact, but only works
  when the colleague's repository records it. Needs a check of where a v2 description file
  lives (in the repository, or only in the exported file).
- **B. Leave the base, and let the 3-way apply absorb the replay.** Adobe's change applied
  twice mostly applies cleanly or reports a conflict. Never silent damage, but noisy.
- **C. Hide the Adobe row after a colleague-track update until the SC resets.**
  Safe and simple, loses the feature where it matters.

Recommended: **A where the description file is in the repository, else B.** To be confirmed
with the owner before step 05 is built.

## Tests

One per row of the table, asserting the recorded commit after each event.
