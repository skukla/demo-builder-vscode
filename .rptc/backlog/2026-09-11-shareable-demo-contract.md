---
id: EDS-13c
kind: chore
area: eds
parent: EDS-13
needs: [PL-56a]
value: high
status: built
---

# The shareable-demo process, published: how to make a storefront addable

Filed 2026-09-11 by the owner: the description file a shareable storefront carries is a
published contract, not an internal convenience. The file's SHAPE is defined once, as the
storefront slice of the portable-project contract ([[PL-56a]], decided the same day: one
contract, not two). This item publishes the PROCESS on top of that shape, so both
[[EDS-13a]] (read it) and [[EDS-13b]] (write it) point colleagues at one page.

## What gets published

In `docs/` where SCs and colleagues can find it:

1. **The file.** Its name (to settle; must not collide with the project manifest
   `.demo-builder.json`), where it lives (repo root), and its fields: exactly what a
   shipped catalog entry may say and nothing more: name, description, icon, store codes,
   B2B flags, mesh posture, default block libraries. Validated by the same schema as
   `demo-packages.json` (one schema, two places it can live), pinned by the same
   config-contract tests.
2. **The process.** What makes a storefront shareable: content site published with an
   index; the file present (optional but recommended); the repo reachable by the people you
   share with; template flag optional and what it buys.
3. **The ownership line.** The colleague owns the storefront; the extension owns the
   integration contract (config.json and flags, fstab.yaml, .env, Config Service,
   block-library install, PDP URL encoding). No Demo Builder patches are applied to a shared
   storefront; the five load-bearing ones are dry-checked and reported.
4. **What "Add a demo" reads when the file is absent**, so a colleague knows the fallback.

## Why it is high value

Nothing waits on the doc as prose, but the file's name and fields are the interface both
halves are built against; deciding them here keeps [[EDS-13a]] and [[EDS-13b]] from
inventing two.

## Shipped so far

- 2026-09-13  docs(eds): the how-to for sharing a demo (`744301d8a`)
- 2026-09-13  chore(backlog): log the how-to on the publish-process item (`f477610db`)
