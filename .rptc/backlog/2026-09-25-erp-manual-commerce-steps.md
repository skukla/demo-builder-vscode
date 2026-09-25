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

## Research findings (2026-09-25, sources named; the live falsification is still open)

**Adobe says the field is required.** The "Configure Adobe Commerce" eventing page
(developer.adobe.com/commerce/extensibility/events/configure-commerce/) lists *Adobe I/O Event
Provider ID* as required, "must be populated before saving", alongside the workspace
configuration and the instance id, and says the provider must be created first. The eventing
REST reference (…/events/api/) shows `PUT eventing/updateConfiguration` accepting `provider_id`
with the other five keys. The same page: "You must enable cron so that Commerce can send events",
and the `event_data_batch_send` cron sends standard events (up to 59 s) while the
`commerce.eventing.event.publish` consumer sends priority events within a second.

**The installer does not set it.** App Management's library (`@adobe/aio-commerce-lib-app`
2.0.0, `createCommerceEvents` → `configureCommerceEventing`) writes `enabled`, `environment_id`,
`instance_id`, `merchant_id` and `workspace_configuration`, creates the Commerce event
provider, and subscribes each event with its own `provider_id`. It never writes the general
`provider_id`. So the blank field is a gap between the installer and Commerce's documented
requirement, not a step this repo's onboarding skipped (the kit has no onboarding script; the
installer is the onboarding). Demo Builder's install does not touch eventing configuration
either (grep of `src/features/app-builder`, 2026-09-25).

**What we measured does not settle whether it matters for us.** Filling the field and running
Execute Synchronization and Send Test Event did not make events flow on 2026-09-24; marking the
subscriptions priority did. Two readings fit: the general provider id feeds the cron path only
(which does not run on the sandbox anyway), or it is needed and was simply not sufficient. The
falsifying experiment is cheap and reversible and needs the owner's say-so because it can stop
the demo's events: blank the field in Admin, save, change a product, watch the registration's
debug tracing; then paste it back. Until then, treat the field as required (Adobe's word).

**Recommendation.** Whatever the experiment says, the extension should stop depending on a
paste: after install, read the provider the installer created (`GET eventing/eventProvider`)
and write it with `PUT eventing/updateConfiguration` — the call the installer already makes,
with the one key it omits — then run the synchronization. Keep the manual instruction as the
fallback in the setup guide, and show the check on the tile and the Admin page (design below).
Note for Adobe (public wording only): the App Management installer configures eventing without
the general provider id that Commerce's own configuration page marks required.

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

## Shipped so far

- 2026-09-25  Owner 2026-09-25 (D4): manual steps live on the integration's Commerce Admin page, where they can be done and then dismissed. Each step: what to do and why, a link to the Admin page where it is done, a check that ticks it automatically when the integration can verify it (e.g. the 'Confirmed in ERP' status exists; how to read order statuses over REST is unverified) or 'Mark as done' when it cannot, and 'Dismiss' for a merchant who does not want it. Done/dismissed kept in the integration's own state; 'Show dismissed' brings them back (reversible). Real-merchant steps only (today: the custom order status; the provider id is automated by D2). Demo-only steps (a shared catalog per priced company) go on Demo Builder's ERP tile checklist, the setup guide and the AI bundle, not in the integration. Email step dropped: Commerce sends none until configured.
- 2026-09-25  Owner 2026-09-25, superseding today's earlier D4 entry: the setup checklist and its checks live in Demo Builder, not the integration. The ERP pair's tile/detail panel shows each step (what, why, a button opening the Commerce Admin page, an automatic read-only check where possible, Mark as done, Dismiss); checks run when the dashboard opens and on 'Check again'; done/dismissed saved in the project, cleared by reset; an agent tool reads the same list. Steps today: the 'Confirmed in ERP' order status (check method unverified) and a shared catalog per priced company. The integration carries no setup code; its README gains an 'After you install' section for the order status, because a prospect handed the integration reads the code, not a demo screen.
