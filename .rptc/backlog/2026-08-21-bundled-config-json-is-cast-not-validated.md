# Bundled config JSON is cast to its declared type, never validated

**Filed:** 2026-08-21 · **LARGELY DONE same day** — see Progress below; one
scoped remainder.

## Progress 2026-08-21

The investigation found the repo already had the vocabulary this item was
going to introduce: `*.schema.json` files exist beside NINE configs (not
five), and `tests/templates/` already validated demo-packages against its
schema with Ajv. So the design decision went to the house pattern —
**JSON Schema + Ajv contract tests, not Zod** (reuse-first; a Zod layer would
have been a third shape vocabulary).

Shipped:

- `tests/templates/config-contracts.test.ts` — auto-discovers every
  `*.schema.json` under src/ and validates the sibling real JSON (count-pinned
  at 9 so discovery can't go vacuous; also checks the data's `$schema`
  pointer resolves). New configs join by existing.
- `ajv` promoted to a direct devDependency (tests were importing it as a
  TRANSITIVE dep of the MCP SDK — an SDK bump could have broken the suites).
- First run surfaced four real rots, all fixed:
  1. `components.schema.json` was not even parseable JSON (trailing comma) —
     it had never validated anything. Rewritten for the v3 sectioned
     structure it never learned (strict at root/section level, deliberately
     shallow per-entry — the alignment tests own the per-entry field
     vocabulary).
  2. `prerequisites.schema.json`'s `installConfig` oneOf described three
     retired install formats, none of them the step-based one every entry
     uses — and its variants overlapped, so ANY object failed oneOf.
     Replaced with a mirror of `PrerequisiteInstall`/`InstallStep`.
  3. `ai-defaults.schema.json` forbade the `$schema` key its own data
     carries.
  4. `components.json` `selectionGroups` had grown four groups
     (stacks/brands/addons/tools) that no code reads and the interface never
     declared — the alignment test's hand-copied set had drifted along with
     the data. Dead keys deleted; interface, code, data, schema and
     alignment set now all agree on the four consumed groups.

## Remaining (the item stays open for this)

The interface↔schema link is still prose: each schema now SAYS "mirrors
<interface>" but nothing checks it, so the two can drift the way the
alignment sets did. Options unchanged from below (generate one from the
other); worth doing only if a schema↔interface drift actually bites — the
contract tests now catch the data-side drift, which is the class that had
shipped bugs.

---

**Filed:** 2026-08-21
**Origin:** The boundary-cast audit's first triage (all 55 sites opened). This
is the largest surviving cluster: ~16 `as unknown as <DeclaredType>` casts on
imported config JSON.

## The claim

Every bundled config file — `components.json`, `demo-packages.json`,
`stacks.json`, `block-libraries.json`, `app-builder-components.json` — is
imported and cast to a hand-written interface. Nothing checks that the JSON
actually satisfies the interface: not tsc, not a test, not a loader. Edit a
config file into a shape the interface forbids and the first failure is at
runtime, in whatever feature reads the drifted field.

## Measured 2026-08-21 — the casts are LOAD-BEARING, not lazy

Probe: replacing `blockLibrariesConfig as unknown as BlockLibrariesConfig`
with a plain typed assignment fails to compile:

> Types of property 'type' are incompatible — the JSON literal gives
> `type: string`, `BlockLibrary` wants a literal union.

`resolveJsonModule` can never produce literal-union types, so tsc structurally
CANNOT verify these imports. Deleting the casts is not the fix; the suppressed
check can only be recovered at RUNTIME.

Sites (from the audit; grep `as unknown as` over `src/` to re-derive):

- `componentRequirementsTool.ts:47`, `configureProjectTool.ts:58` (components.json → `Record<string, unknown>`)
- `skillsWriter.ts:73` + `:237` (components.json → `RawComponentRegistry`)
- `agentsMdSections.ts:40`, `demoPackageLoader.ts:50`, `edsResetParams.ts:200/224`,
  `storefrontNameMigrationForProject.ts:122` (demo-packages.json → `DemoPackagesConfig` / `StorefrontConfigSource[]`)
- `demoPackageLoader.ts:202/227`, `meshCatalogDerivation.ts:65` (stacks.json → `StacksConfig` / row slice)
- `meshCatalogDerivation.ts:55` (components.json mesh slice)
- `blockLibraryLoader.ts:17` (block-libraries.json → `BlockLibrariesConfig`)
- `appBuilderComponentCatalogLoader.ts:33` (app-builder-components.json → `AppBuilderComponentsCatalog`)

## Why this class has already cost money

The mocked-vs-bundled-JSON trap (`webview-test-authoring` §5) exists because
tests mock these loaders while production reads the real file — so a config
edit that breaks the declared shape passes every suite. The wizard-steps
`enabled` bug (finding 3 of the payload-typing item) was this class end to
end: config lost a field the interface implied, nothing failed until every
wizard step silently vanished.

## The fix shape (investigation first)

Two viable designs — pick ONE per file, don't mix:

1. **Config-contract test suite**: one jest suite that imports each bundled
   JSON and validates it against a Zod schema derived from (or replacing) the
   hand-written interface. Cheap, zero runtime cost, catches drift at CI time.
   Zod is the house standard (global CLAUDE.md).
2. **Validate at load**: the loaders (`ConfigurationLoader` already exists as
   a seam) parse with the schema and fail loudly. Catches drift even for
   configs users can override; costs a runtime dependency on the schema.

Open questions the investigation must answer:
- Which interfaces are ALREADY wrong about the JSON? (The validation will
  surface every existing mismatch on day one — budget for divergences, the
  payload-typing pass found seven beyond prediction.)
- Do any of these configs get loaded through `ConfigurationLoader` at runtime
  anyway, making option 2 nearly free for them?
- `wizard-steps.json` already has a hand-rolled guard
  (`isWizardStepDefinition`) — fold it into whichever design wins rather than
  keeping a third mechanism.

## Constraints

- Do NOT weaken the interfaces to `string` to make the casts removable — the
  literal unions are the valuable part; they type every consumer.
- A schema and an interface that can drift apart is the same disease one
  layer up: derive one from the other (`z.infer`) or generate.
