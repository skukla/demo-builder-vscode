# Step 01 — Capture the boilerplate and the lineage of every storefront

## What is read, and from where

| Signal | Link (GitHub) | Zip | Shipped brand at creation |
|---|---|---|---|
| Boilerplate name + version | `package.json` at the repository's default branch (raw read, the probe already fetches files) | the zip's `package.json` | the template's `package.json` at the pinned commit |
| `template_repository` | GitHub repository record (`getRepository` gains the field beside `is_template`, `parent`) | — | — (we are the template) |
| Fork parent | GitHub repository record (`getRepository` gains `parent` beside `is_template`; `forkParent` was removed with the copy, shareable-demo step 11) | — | — |
| Which canonical, if any | match `template_repository`/parent/`builtWith.template` against the shipped storefronts' `templateOwner/Repo` and the ledgers' `canonical` | package name only | known |

## Where it lands

- `AddedDemo` (the Welcome card, user settings): `boilerplate: { name, version }`,
  `lineage: { templateRepository?, forkParent? }`. Cards added before this ship without them;
  the probe fills them on the next add or when the card is opened.
- The project's EDS instance metadata beside `templateOwner`, `templateRepo`,
  `lastSyncedCommit`, `lkgSource`: `boilerplate` at creation and after each reset.
- `SharedDemoDescription` version 2: `builtWith` (step 02 says what it carries).
- The add dialog's "What we found in this demo" table gains ONE row ("Built on Adobe's
  boilerplate 4.0.1"); the completion card gains one line and the door "See the storefront
  report". Cards carry nothing more (decision 7); the rest is the report (steps 04, 07).

## Pins that move

`edsConfigFromStorefront.test.ts` (the ONE list of storefront-derived fields), the
`sharedDemoProbe` tests (fixtures captured from a live repository answer, per the live-probe
rule), `describeProject` tests, the settings-file schema test for the card shape.
