# State

`StateManager` owns the project manifest — `.demo-builder.json` in each project
directory — and the extension's own persisted state.

## The manifest shape, which is not what you would guess

Fixtures get this wrong constantly, so copy it from a real file rather than writing
it from memory:

- **`componentInstances` is a RECORD keyed by component id**, not an array. A fixture
  inventing `components: [...]` typechecks cleanly, because the field is optional,
  and fails the moment a real accessor touches it.
- The **frontend port** lives on the instance whose `type` is `frontend` — there is
  no top-level `frontendPort`.
- The **mesh** is found by `subType: 'mesh'` on an instance whose `type` is
  `dependency`.
- **`appBuilderComponents`** is the keyed map of deployables
  ([ADR-011](../../../docs/architecture/adr/011-app-builder-deployables.md) D3). The
  singular `meshState` / `appState` fields on older manifests are legacy read-only;
  they migrate on load and forward-migrate on first save.

Read one before writing a fixture:

```bash
python3 -c "import json; print(list(json.load(open(
  '$HOME/.demo-builder/projects/<name>/.demo-builder.json'))['componentInstances']))"
```

## One instance, always

`StateManager` is constructed exactly once, in `extension.ts`. It builds
`RecentProjectsManager` and holds caches; a second instance forks all of it silently.
That is why it is on the construction ledger in
`tests/sop/architecture-rules.exemptions.json` as a ruling rather than debt.

## Single source of truth

A value lives in exactly one place. The rule exists because the mesh endpoint was
once stored twice and the two copies disagreed — see
[state-ownership.md](../../../docs/architecture/state-ownership.md), which was
written after that bug.

## Related

- [`@/core/base`](../base/README.md) — hands `stateManager` to every command
