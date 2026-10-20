# Step 01: record the Adobe base

## What

A storefront that qualifies carries `boilerplateBase` in its `eds-storefront` metadata:
`{ template: { owner, repo }, commit, lkgFile }`, where `commit` is the Adobe commit its
code was built from and `lkgFile` names the pointer the daily gate moves
(`b2b/last-known-good`).

## Where

- One function, `boilerplateBaseOf(project)`, in `src/features/eds/services/storefront/`:
  qualifies when `project.demo.builtWith.template` is the Adobe source of one of our
  patched catalog templates (the same "our templates" set `storefrontProvenance.ts:149-160`
  reads) and `builtWith.lkg` is 40 hex. Returns the field, or undefined with a reason.
- Creation: `executorEdsPhase.ts` writes it beside `lastSyncedCommit` (:79-121).
- Existing projects: the check (step 02) calls the same function when the field is absent
  and records it. Creation and the lazy path must produce the same value (property 3).
- Type, schema and JSON registry together (CLAUDE.md "a config field lives in three places").

## Tests

- Qualifies: a v2 `builtWith` naming the B2B template and a 40-hex lkg.
- Does not, each with its reason: no `builtWith`; `builtWith.lkg` missing or not 40 hex;
  `builtWith.template` not one of ours; a shipped (non-added) storefront.
- Fixtures copied from a real v2 description file, typed to `SharedDemoBuiltWith`.

## Done when

A project created from a qualifying colleague's demo, and an existing one after its first
check, both carry the same `boilerplateBase`; JustRite carries none, and the reason is in
the debug log.
