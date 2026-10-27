---
id: DI-5
kind: feature
area: data-installer
needs: []
value: high
status: active
---

# Demo Builder installs datapacks itself, beside the service

Filed 2026-10-27. Plan: `.rptc/plans/datapack-engine/overview.md`.

The Data Installer service reads fine but no longer installs for us: since its 2026-10-27
commit "remove the postman backward compatibility params" it ignores the Commerce credentials
a caller sends, so every dry run and import fails "Pre-flight check failed for all configured
site types (accs, local)". The owner: the service is not something we can rely on.

Demo Builder gets its own install engine, written from scratch (their processors read as the
specification, never copied), behind the same buttons as the service engine, with one
setting choosing between them and each installed pack recording which engine installed it,
so removal always goes back through the same one. Catalog kinds first, then customers and B2B
(which completes Bodea), the rest only when a pack needs them.

High value: SCs cannot install any datapack until this exists or the service changes back.

## Shipped so far

- 2026-10-27  refactor(data-installer): every datapack write goes through an engine (DI-5 step 1) (`1a1aeffb2`)
- 2026-10-27  docs(plan): Demo Builder installs datapacks itself, beside the service (DI-5) (`4171d9f60`)
- 2026-10-27  docs(plan): the catalog spec read off the service, with Bodea's answers (DI-5) (`c3709948d`)
- 2026-10-27  refactor(types): CommerceGet and CommerceSend live in the shared Commerce wire types (`4fc5dabee`)
- 2026-10-27  docs(plan): store settings as a datapack kind, restored on removal (DI-5) (`d22807057`)
- 2026-10-27  feat(data-installer): the install record our engine writes as it creates (DI-5) (`5cbb59f26`)
- 2026-10-27  feat(data-installer): our engine installs and removes attributes and attribute sets (DI-5) (`d2575438b`)
