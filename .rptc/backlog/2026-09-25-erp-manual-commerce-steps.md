---
id: AB-26x
kind: feature
area: app-builder
needs: []
value: high
status: backlog
parent: AB-26
---

# Manual Commerce steps the pair depends on — are they required, and how does the SC learn?

Slice of [[AB-26]]. Filed 2026-09-25 from the owner: "we had to manually paste in the event
provider ID in order for the events to flow between systems. We should research whether or
not that's really required or whether it's a step in the starter kit that we missed. If it is
required, we need to communicate that to the end user somehow which needs to be designed." And:
a realistic integration that depends on the end user creating a custom order status "also
needs to be documented and communicated to them." **Lane 3 (research + design), then lane 1.**

## The steps as they stand (measured 2026-09-24 and 25)

| Step | Required? | Today |
|---|---|---|
| Fill the event **Provider ID** at Stores → Configuration → Adobe Services → Adobe I/O Events, then Execute Synchronization | It was blank after install; events flowed only after the owner filled it. Whether the installer should have set it is the research question | Nowhere in the extension or the guide |
| One **customer group per demo company** (a shared catalog assigned to the company) | Required for cart-time pricing (the webhooks see only the group); orders name the company directly | `docs/demo-setup.md` row (2026-09-25) |
| A **custom order status** assigned to Pending, named in "Order status when the ERP confirms" | Optional: blank means a note only | `docs/demo-setup.md` row (2026-09-25); the setting's description |
| **Priority** on every Commerce event subscription | Required on the sandbox (the batch cron does not run) | Done by the integration's config; explained in `docs/eventing.md` |

## Research to do (Provider ID)

1. Read Adobe's Commerce eventing docs for Cloud Service: what `bin/magento events:*` / the
   REST `eventing/updateConfiguration` and `eventing/eventProvider` calls set, and whether the
   Commerce extensibility starter kit's installer (`aio commerce:*` / App Management's
   onboarding) writes the provider id into the instance configuration.
2. Read the kit's onboarding scripts in this repo's `scripts/` and `@adobe/aio-commerce-lib-app`
   for a `provider` configuration write; compare with what Demo Builder's install does
   (`componentInstallationOrchestrator`, `appBuilderComponentRunner`).
3. Falsify on the instance: read `GET eventing/getEventProviders` and the configuration before
   and after a fresh add on a scratch instance or after `remove_integration` + add on Bodea.

## Design (to write once the research answers "required")

The SC must learn about a manual step **before it bites**, in the surface they are already in:

- **In the extension:** the integration tile's status (and `get_erp_record`'s health) reads the
  instance's eventing configuration and shows a plain "Commerce is not sending events: fill the
  Provider ID …" notice with the Admin path, until it is set — a check, not a paragraph. The
  install summary lists the manual steps with a checkbox each.
- **In the integration's Admin page:** a "Setup" card at the top of the Mapping tab that reads the
  same facts (provider id present, subscriptions priority, companies sharing a group, custom
  status present when the setting names one) and says what is left to do, with the Admin path.
- **In the docs:** `docs/demo-setup.md` stays the long form; the AI bundle's ERP skill gets the
  same list so an agent can check them.

The realistic-integration rule (owner): a demo may require Commerce preparation, but every
required step is written down where the SC works and checked by the software where it can be.

## Verification block

The research states, with sources, whether the provider id is set by any installer; every
required manual step appears in the setup guide AND is detected by a check the SC sees; the
optional ones are labelled optional with what they add.
