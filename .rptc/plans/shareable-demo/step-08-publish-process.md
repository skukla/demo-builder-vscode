# Step 08 — Write the how-to for sharing a demo

Item: [[EDS-13c]]. Decision: D10 (a published contract). Depends on the contract step (portable-demos/step-01-contract).

**Reuse:** section I of `../portable-demos/reuse-map.md` lists every existing thing this step is built from and how (use as is / add to it / make it shared / build new). A new file, hook, shape or word not in that section names the row it replaces and why.

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
6. The words: "demo" on the grid, "storefront" in the Storefront area, and why.

Pinned: the doc's field list against the schema by the config-contract test family (a doc
that names a field the schema does not have goes red); `cited-identifiers.test.ts` for
every path and setting key it names.

## Built (2026-09-13)

`docs/systems/sharing-a-demo.md`, written for an SC and for the colleague on the other
side of the link, in that order: what "Add a demo" needs (the two link forms, a readable
repository, a named content site with a published index under one of the three paths, the
default branch), the description file with its field table and a complete example, what is
read when there is no file (the four repository files and the rules, as the probe applies
them), the ownership line (no patches, the five dry-checked behaviours in the caveats'
words, the files Demo Builder writes into each project), copies and forks (the default,
the template flag, the history warning), what happens after the demo changes (updates,
rename, deletion, Change source), the words, headless demos, and the agent's tools. It says
to send the link, not a zip, ahead of step 10.

Two things the plan listed are stated as they are now, not as planned: the file is written
by hand until step 09's "Share this demo" exists (the page does not promise the button),
and the words section explains "demo" and "storefront" without the dialog copy quoting it.

Pinned by `tests/templates/sharing-a-demo-doc.test.ts`: the field table names exactly
the description file's schema fields; the example validates against the schema; the file
name, the three index paths, the three canonical storefront files and the company drop-ins
the page names are the code's own constants. The existing doc pins (cited identifiers,
module references, the docs index) cover the setting key, the paths and the index entry.
`project-file-format.md` links to the page from its shared-demo section.
