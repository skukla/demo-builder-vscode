# Step 7: The release-time resolver; the hand-kept numbers go

**The resolver** (`scripts/resolve-node-version.mjs`, `npm run node:resolve`). Reads every
source Demo Builder ships, from the catalogs themselves so the list cannot drift:

- `components.json` entries with a git `source` (the meshes; the ingestion tool, skipped and
  named while [[DI-4]] is open: its repo is private);
- `app-builder-components.json` entries (`source.owner/repo`);
- the storefront repos in `demo-packages.json` that Demo Builder runs locally (`headless-paas` ->
  citisignal-nextjs; EDS storefronts run nothing locally, `skipNpmInstall`);
- npm packages: the `aio-cli` prerequisite and its plugins (`prerequisites.json`), the
  `ai-defaults.json` MCP server packages.

For each it reads `package.json` `engines.node` (GitHub contents API; npm registry `latest`),
then applies the rule (lowest LTS major every range accepts, newest patch; LTS list from
`https://nodejs.org/dist/index.json`). It writes
`src/features/components/config/node-version.generated.json`:
`{ node: "24", sources: [{ id, from, range }] }` so a reviewer sees why. It FAILS, writing
nothing, when the ranges do not overlap (naming the ranges that block) or a required source is
unreadable. `--check` compares without writing. A source with no range takes the shared Node and
is listed as such.

**The register reads it.** `nodeRequirements.ts` keeps its functions; each answers the generated
`node`. An outside entry (step 8) still carries its own.

**Deleted (no soft deprecation):** `nodeVersion` in `components.json`,
`app-builder-components.json`, `ai-defaults.json`; the field in their three schemas and three
types; anything reading them directly (`ComponentRegistryManager` mappings,
`componentInstallation`'s metadata write takes the register's answer instead).

**Enforcers.** `node-versions-from-catalogs.test.ts` becomes "a Node version appears only in the
generated file". A new offline test pins that the generated `sources` list equals what the
resolver would read from the current catalogs (same source-listing function, no network), so a
component added without re-resolving fails the build.

**Release.** The `cut-release` skill runs `npm run node:resolve -- --check` and stops on a
difference.

**Tests:** the rule on fixed inputs (overlap, no overlap, a ceiling, a source with no range,
lowest-not-newest); the source list from the real catalogs; the register returns the generated
value.
