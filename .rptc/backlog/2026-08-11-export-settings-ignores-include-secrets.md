---
id: 2026-08-11-export-settings-ignores-include-secrets
title: export_project_settings ignores includeSecrets and reports a false negative
status: backlog
created: 2026-08-11
priority: high
---

# `export_project_settings` ignores `includeSecrets` and reports a false negative

## Provenance

Found in passing on 2026-08-11 while researching credential storage for the Data Installer
integration (`.rptc/plans/` → data-installer). Not part of that feature's scope. Every claim
below was read from source this session, and the whole chain was traced end to end.

Repo is **public** (`reference_repo_visibility`), which is why this is filed `high` rather than
`medium`.

## The defect

`includeSecrets: false` still writes secrets to the file **and** returns
`includesSecrets: false`. It is not merely a missing filter — the return value makes an
affirmative false statement, so a caller that checks the response is told the opposite of what
happened.

The MCP tool's own description promises the behaviour that does not exist
(`src/features/ai/server/actionDescriptors.ts:126-130`):

> "…component configs, and — by default — secrets… **Pass `includeSecrets:false` for a
> secret-free copy.**"

An agent asked for a secret-free copy produces a file containing
`ADOBE_COMMERCE_ADMIN_PASSWORD`.

## The chain (verified, no stripping at any hop)

| Hop | File:line | What happens to the flag |
|---|---|---|
| MCP row | `src/features/ai/server/actionDescriptors.ts:124-134` | documents `includeSecrets:false` as a secret-free copy |
| handler | `src/features/dashboard/handlers/dashboardHandlers.ts:1042-1044` | passes options through |
| service | `src/features/projects-dashboard/services/settingsTransferService.ts:301-314` | `const includeSecrets = opts.includeSecrets ?? true` → forwarded |
| wrapper | `src/features/projects-dashboard/services/settingsSerializer.ts:200-208` | forwarded again; note it **defaults to `false`** here (`:203`) |
| emit | `src/features/projects-dashboard/services/settingsSerializer.ts:128-156` | **`configs: project.componentConfigs \|\| {}` unconditionally (`:156`)**; `includeSecrets` is consumed only at `:154` to stamp `includesSecrets` |

`grep -nE "delete |redact|strip|omit|filter|ADMIN_PASSWORD|secret"` over
`settingsTransferService.ts` returns no stripping logic — only an unrelated `filters:` key at
`:43` and `:225`, and doc comments at `:280`, `:285`.

Note `createExportSettings` defaults `includeSecrets = false` (`settingsSerializer.ts:203`)
while `exportProjectSettingsToFile` defaults it to `true` (`settingsTransferService.ts:305`).
The two defaults disagree, which is worth resolving in the same change.

## What is exposed

Everything in `Project.componentConfigs` (`src/types/base.ts:64`), which is where Commerce
admin credentials live by deliberate design (`src/features/eds/handlers/edsHandlers.ts:143-147`
records that decision):

- `ADOBE_COMMERCE_ADMIN_USERNAME` / `ADOBE_COMMERCE_ADMIN_PASSWORD`
- any other plaintext values components declare

Secrets that already route through VS Code SecretStorage (App Builder component secrets,
GitHub and DA.live tokens, Helix keys) are **not** affected — they are not in
`componentConfigs`. The blast radius is exactly the plaintext-at-rest set.

## Why the tests did not catch it

`tests/features/projects-dashboard/services/settingsSerializer.test.ts:130-137` and `:386-395`
assert the **value of the flag** in the output, not that anything was stripped. A test that
pins a label will pass forever against a label.

## Goal / scope

Make `includeSecrets: false` mean it.

In scope:

1. Filter secret-bearing values out of `configs` when `includeSecrets` is false, rather than
   emitting `componentConfigs` wholesale.
2. Reconcile the two disagreeing defaults.
3. Tests that assert **absence** of the value, not the flag.
4. Re-read the MCP description against the new behaviour so the promise matches.

Out of scope: moving Commerce admin credentials into SecretStorage. That is the deliberate
decision at `edsHandlers.ts:143-147` and a much larger change. This item only makes the
existing opt-out honest.

## Execution plan

1. **Decide what "secret" means here.** There is no `type: 'secret'` marking on
   `componentConfigs` values the way there is for App Builder component env vars
   (`src/types/appBuilderComponents.ts:14-25`). Two options:
   - (a) Derive it from the component catalog: `src/features/components/config/components.json`
     already types `ADOBE_COMMERCE_ADMIN_PASSWORD` as `type: "password"`. Filter on that.
     **Preferred** — it is declarative and already maintained.
   - (b) A key-name denylist. Cheaper, but drifts the moment someone adds a field.
2. **RED**: extend the serializer suite to assert that with `includeSecrets: false` the
   serialized JSON contains neither the password key nor its value, for a project fixture that
   has one. Use `fake-test-pw-not-a-secret` per `reference_gitguardian_test_fixtures`. Assert on
   the *value* too, not just the key — a renamed key would otherwise slip through.
3. **GREEN**: implement the filter at the single emit site
   (`settingsSerializer.ts:156`), so both entry points inherit it.
4. Reconcile the defaults; pick one and document why.
5. Check the import/round-trip side: confirm a secret-free file still imports cleanly and
   prompts for the missing values rather than writing empty strings over good ones.
   `settingsTransferService.ts:174` and `:218` both call with `true`, so the local-copy path is
   unaffected — verify that stays true.
6. Re-read `actionDescriptors.ts:126-130` and adjust wording if behaviour differs from the
   promise.
7. Invoke the `gate` skill.

## Constraints

- Public repo: no real secret values in fixtures.
- `settingsSerializer.ts` is shared by the wizard-prefill path
  (`dashboardHandlers.ts:446`, `projects-dashboard/handlers/dashboardHandlers.ts:510`, both
  passing `true`) and the transfer path. Do not change behaviour when `includeSecrets` is true —
  those callers depend on getting everything.
- The MCP response shape `{ path, includesSecrets }` is already documented as never returning
  secret values; keep that.

## Kickoff prompt

> Read `.rptc/backlog/2026-08-11-export-settings-ignores-include-secrets.md`. `includeSecrets:
> false` currently writes secrets to the exported file and returns `includesSecrets: false`,
> which is an affirmative false claim. Fix it at the single emit site
> `src/features/projects-dashboard/services/settingsSerializer.ts:156`, deriving what counts as
> a secret from the `type: "password"` declarations already in
> `src/features/components/config/components.json`. Write the failing test first, asserting the
> secret's **value** is absent from the serialized output. Reconcile the disagreeing defaults at
> `settingsSerializer.ts:203` (`false`) and `settingsTransferService.ts:305` (`true`). Do not
> change behaviour when `includeSecrets` is true — three callers depend on getting everything.
