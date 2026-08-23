# What does a datapack removal actually delete?

> ## ANSWERED 2026-08-22 — pack-scoped, by the cheaper route
>
> Asked the Data Installer service owner directly (the route this item itself
> named as cheaper than the experiment): **a removal is pack-scoped and cannot
> clear an instance** — data a user created by hand is out of its reach. The
> experiment is superseded; the answer is verbal, not measured, but it comes
> from the person who owns the behaviour.
>
> **Pack-scoped branch applied same day:** the reset removal prompt now says
> "anything you added by hand stays" (`edsResetUI.ts`,
> `confirmSampleDataRemoval`) — the expectation gap was the real risk and the
> prompt now closes it with a statement that is a fact rather than a guess.
>
> **Successor item:** since removal can never produce a clean instance, the
> "clean slate" want moved to its own item —
> [`../backlog/2026-08-22-instance-wipe-option.md`](../backlog/2026-08-22-instance-wipe-option.md):
> an explicit option to wipe as much data from the instance as the service
> allows.

**Filed:** 2026-08-17, from the reset sample-data work.
**A question, not a defect. One experiment answers it.**

## Provenance

Raised while deciding what reset's prompt should say. The hoped-for behaviour was
"reset gives me a clean instance" — and it is unknown whether it does.

Split out of [`../complete/2026-08-17-reset-should-restore-sample-data.md`](../complete/2026-08-17-reset-should-restore-sample-data.md)
rather than left inside it. That item is archived as done, so its open question
would never surface again: an entry that reads as finished stops being re-read,
which is the exact rot the second 2026-08-13 sweep found in the other direction.

## The question

`startDelete` sends the SAME body as an import — datapack id, version, data
types, target, instance — differing only by `operation_mode: 'delete'`
(`dataInstallerWriteClient.ts`). So the extension asks for a pack-scoped
removal. What the SERVICE does with that is not visible from this repo:

- **If it deletes the records that pack defines**, then data a user created by
  hand survives, and reset can never give a clean instance. The prompt's wording
  ("remove the sample data this project imported") is then exactly right, and
  anyone expecting a wipe is wrong in a way nothing tells them.
- **If it deletes everything of those data types**, then a removal takes the
  user's own products with it. The prompt is then understating what it does, in
  the destructive direction, on an operation with no undo.

Both are plausible. Neither is established. **The two readings differ on whether
a user loses their own work**, which is why this is worth an hour.

## The experiment

On a throwaway instance, or one whose contents nobody minds:

1. Import a pack (any pack with `products`).
2. In Commerce Admin, create ONE product by hand. Note its SKU.
3. In the Data Installer, open that pack → tick `products` ONLY → Remove data… →
   confirm.
4. Look for the hand-made SKU.

Present → pack-scoped. Absent → type-wholesale.

**Do not infer it from a reset run.** Reset removes what the project recorded and
resets the storefront in the same operation, so a missing product has two
possible causes. The Data Installer's own removal isolates the variable.

## What to do with each answer

- **Pack-scoped** — the current wording is honest and nothing changes in code.
  Consider saying so out loud in the prompt ("data this pack imported; anything
  you added by hand stays"), since the expectation gap is the real risk.
- **Type-wholesale** — the removal prompt understates a destructive act and must
  say what it takes. That is a copy fix with real urgency, not a feature.

## Constraints

- **Not answerable by reading this repo.** The behaviour lives in the Data
  Installer service. The other route is asking its author, which is cheaper than
  the experiment if they are around.
- **No undo.** Step 3 is irreversible on whatever instance it runs against.
- The removal is per-type, so ticking `products` alone keeps the blast radius to
  one type.

## Kickoff prompt

> Read `.rptc/backlog/2026-08-17-what-does-a-datapack-removal-actually-delete.md`.
> Run the four-step experiment on a throwaway instance, or ask the Data Installer
> service's author directly. Then apply the matching branch under "What to do with
> each answer" and record the result in this file before archiving it — the answer
> is the artifact, not the code change.
