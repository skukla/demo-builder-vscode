---
id: AB-13
kind: feature
area: app-builder
parent: AB-9
needs: []
value: high
status: active
---

# An installed integration takes an update: new code, then Commerce brought to it

Found 2026-09-17 when the ERP integration moved orders from a webhook to an event: nothing in
Demo Builder brings a changed integration to a project that already has it. Update and Redeploy
deploy whatever is in the clone (neither fetches), the updates feature stops at the files, and
with `@adobe/aio-commerce-lib-app` 1.x an installed app answers "already installed", so a new
event or a changed webhook never reaches Commerce.

The design and steps are in `.rptc/plans/integration-updates/overview.md`: the integration moves
to lib-app 2.x (which upgrades an installed app when `metadata.version` changes), Demo Builder
fetches the newer code on Update, reports what the install pass did and records the installed
version, offers a confirmed reinstall when Commerce refuses to upgrade in place, and shows when
an update is available. Bodea is the first live test.

Filed 2026-09-17.

## Shipped so far

- 2026-09-17  docs(plans): updating an installed integration (AB-13); AB-11 narrowed to an optional note (`6639e5f7e`)
- 2026-09-17  feat(app-builder): an App Management install says what it did — installed, upgraded, already current or refused — and records the version (`f72c4a9b7`)
- 2026-09-17  feat(app-builder): updating an integration fetches its newer code, installs it and redeploys, keeping the SC's edits (`73cfc8204`)
- 2026-09-17  feat(app-builder): an integration Commerce will not upgrade in place can be reinstalled, only then (`100cac2c0`)
- 2026-09-17  feat(app-builder): Update fetches an integration's newer code, and the card says when there is some (`e3bebf76a`)
- 2026-09-17  test(app-builder): the update handler suite loads its shared mocks before the handler (`602ee0094`)
- 2026-09-17  fix(updates): an update is no longer refused over a file the extension itself rewrote (`34e5f23dc`)
- 2026-09-18  fix(integrations): a failed card with newer code offers Update, not Retry (`0b2357b3d`)
- 2026-09-18  feat(integrations): an integration and its ERP update together, from either card (`6a4ba391b`)
