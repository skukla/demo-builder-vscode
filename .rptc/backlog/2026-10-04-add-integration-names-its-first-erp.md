---
id: AB-67
kind: fix
area: app-builder
needs: []
value: med
status: built
---

# An agent cannot name the first ERP when it adds the ERP integration

Filed 2026-10-04, found re-adding the Justrite pair through the agent surface.

`add_integration` takes `id`, `source`, `name`, `instanceId`, `apis` and
`refreshCli` — nothing for the integration's text settings. The ERP integration's
catalog entry declares `ERP_DISPLAY_NAME` (label "ERP name", default "Acme ERP"),
and the bound ERP takes its name from it (`nameFromEnvVar`). So an agent-driven add
always produces "Acme ERP".

That name cannot be fixed afterwards, by design: the owner fixed an ERP's name at
add time on 2026-09-25 (demo-erp `1554681`) because a rename would have to move
through the ERP, both Demo Builder tiles, the Commerce Admin menu and the Adobe
workspace while every internal id stays on the first name. `set_integration_settings`
refuses it ("The name is fixed when the pair is added") and `rename_integration`
refuses an ERP ("Only integrations can be renamed"). The only recovery is remove
and re-add — a cloud teardown and a 15-minute redeploy — and the re-add then has
to be done by a person, through the add dialog, which does ask.

`add_erp` (the SECOND and later ERPs) already takes a `name`; only the first ERP,
which arrives with the integration, has no way in.

## The fix

Let `add_integration` take the entry's text settings at add time (e.g. `settings:
{ ERP_DISPLAY_NAME: "Justrite ERP" }`), validated against the catalog entry's
`envSchema` the same way the add dialog validates them, and say in its description
that the ERP's name is fixed once added. Human and agent surface then agree.

Undo: unchanged — `remove_integration` already removes the pair.

## Shipped so far

- 2026-10-05  Built. The handler already named the first ERP from add_integration's name (the same field the add dialog fills); the tool just never said so. Fixed the tool and name-field descriptions (name names the first ERP; cannot change after add), removed a stale comment claiming an add_integration preflight, pinned the deploy argument with the real resolver and catalog. No settings field added: it would be a second door to the same value. Gate green.
