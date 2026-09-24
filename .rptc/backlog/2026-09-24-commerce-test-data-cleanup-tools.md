---
id: AB-29
kind: feature
area: app-builder
needs: []
value: med
status: backlog
---

# Commerce test data cleanup tools

Filed 2026-09-24 (owner: "I do think we want to build out tools to help clean up test
data"), during the ERP round-trip validation on Bodea.

## What happened

The owner had lost the password of the one storefront user attached to a B2B company, the
sandbox delivers no email (so no reset link and no welcome mail), and the plain way out was
to delete the old customer and company in Commerce Admin and recreate them. Asked to do that
through the agent surface, the answer was: nothing to call. Demo Builder has ONE Commerce
read tool (`run_commerce_query`, shopper-facing GraphQL, which cannot even see a B2B company)
and no Commerce write tool at all. `reset_datapack` removes what a datapack installed, not
records an SC made by hand; the ERP integration's `erp/detach` undoes only what the
integration itself wrote. Two of the afternoon's reads (`get_erp_record`,
`get_erp_order_trace`) reach companies and orders only through the ERP integration, so a
project without that integration still cannot see them.

The gap is real and general: SCs rebuild demos constantly (principle 1), and the leftovers of
a rehearsal — test customers, companies made for a credit story, orders placed to show an
ERP round trip — have no in-app way back to zero.

## Shape (design, to be confirmed before code)

- **Entity.** A new family of Commerce record tools, reads first, then confirm-gated deletes,
  on the project's Commerce backend. Not part of the ERP integration: it must work on any
  project with a Commerce backend.
- **Credential path — the question that decides the effort.** Commerce REST needs an admin
  bearer (PaaS) or an IMS S2S token from a credential subscribed to `ACCS-REST-API` (ACCS).
  The extension already mints the S2S identity for app-management deploys
  (`resolveAppManagementEnv` in `appBuilderComponentRunnerDeps.ts`), and `commerceStoreDiscovery.ts`
  already holds the PaaS admin-token call, so both halves exist; what does not exist is one
  Commerce REST client the tools share. PaaS admin username/password is a `needsUser`
  handoff, never a parameter (the `discover_store_structure` precedent).
- **Reads:** `list_commerce_customers` (search by email/name, paged),
  `list_commerce_companies`, `list_commerce_orders` (by customer/company/date). Reads first
  so a delete names what it will remove.
- **Deletes, each `confirm: true` and in `AGENT_ALERT_COPY`:** `delete_commerce_customer`,
  `delete_commerce_company` (Commerce refuses to delete a company admin while the company
  exists — order the two, and say so). **Orders cannot be deleted over the API** (the ERP
  detach doc records this); offer cancel + archive, and state plainly that the row stays.
- **Reversal (principle 1).** A delete is irreversible; the tool must say so in its
  consequence line and answer what it removed. Consider an export-before-delete
  (`start_datapack_export` already captures customers/companies) so a rehearsal's records can
  be put back as a datapack.
- **Not in scope:** deleting products or catalog structure (that is the datapack's job).

## Open questions for the owner

1. Does cleanup belong in the extension, or in the data-installer service (which already
   owns "remove what I installed" and has Commerce credentials)? The extension can call the
   service; the service cannot see an SC's hand-made records unless told about them.
2. Which entities first: customers + companies (this afternoon's blocker), or orders too?
3. Should a delete require the record to have been created after the project was (a
   "test data" test), or trust the SC?
