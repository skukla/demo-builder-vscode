# Step 01 — Capture the boilerplate and the lineage of every storefront

## What is read, and from where

| Signal | Link (GitHub) | Zip | Shipped brand at creation |
|---|---|---|---|
| Boilerplate name + version | `package.json` at the repository's default branch (raw read, the probe already fetches files) | the zip's `package.json` | the template's `package.json` at the pinned commit |
| `template_repository` | GitHub repository record (`getRepository` gains the field beside `is_template`, `parent`) | — | — (we are the template) |
| Fork parent | already read (`forkParent`) | — | — |
| Which canonical, if any | match `template_repository`/parent/`builtWith.template` against the shipped storefronts' `templateOwner/Repo` and the ledgers' `canonical` | package name only | known |

## Where it lands

- `AddedDemo` (the Welcome card, user settings): `boilerplate: { name, version }`,
  `lineage: { templateRepository?, forkParent? }`. Cards added before this ship without them;
  the probe fills them on the next add or when the card is opened.
- The project's EDS instance metadata beside `templateOwner`, `templateRepo`,
  `lastSyncedCommit`, `lkgSource`: `boilerplate` at creation and after each reset.
- `SharedDemoDescription` version 2: `builtWith` (step 02 says what it carries).
- The add dialog's "What we found in this demo" table gains a row; the completion card
  gains a line. Both in SC words; never the field names.

## Pins that move

`edsConfigFromStorefront.test.ts` (the ONE list of storefront-derived fields), the
`sharedDemoProbe` tests (fixtures captured from a live repository answer, per the live-probe
rule), `describeProject` tests, the settings-file schema test for the card shape.
