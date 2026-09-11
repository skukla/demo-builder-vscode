# Step 08 — Publish the process: how to make a storefront addable

Item: [[EDS-13c]]. Decision: D10 (a published contract). Depends on the contract step (portable-demos/step-01-contract).

## What gets written, in `docs/systems/`

1. The description file: `demo.demo-builder.json` at the repo root, where it goes, what it may say (exactly the
   catalog's fields, with the schema linked), and that it is optional.
2. The process: publish the content site with an index; keep the default branch `main`;
   optionally flag the repo as a template and what that buys; make the repo reachable by the
   people you share with.
3. The ownership line (D4): what the owner of a storefront is responsible for; what the
   builder writes into every storefront it creates from theirs; that no Demo Builder patches
   are applied and the five load-bearing ones are dry-checked and reported.
4. What "Add a demo" reads when the file is absent, so a colleague knows the fallback.
5. That SCs who add your demo keep a fork of it by default, with your full history: do not
   share a repo whose history carries a secret.
5. The words: "demo" on the grid, "storefront" in the Storefront area, and why.

Pinned: the doc's field list against the schema by the config-contract test family (a doc
that names a field the schema does not have goes red); `cited-identifiers.test.ts` for
every path and setting key it names.
