---
id: DI-16
kind: question
area: data-installer
parent: EDS-1
needs: []
value: high
status: open
---

# Will a multi-site datapack still install through the Data Installer service?

Filed 2026-11-15. The owner, on hearing that the service puts a whole pack into one website:
"I'm also really concerned when we do eventually support multi site. Our packs are not going to
be compatible with the Data Installer service. That's something I really wanna make sure to
explore."

Part of the multi-site fast follow ([[EDS-1]]), alongside several datapacks per project
([[DI-15]]). Closes when we know which multi-site shapes a pack can take and still install
through the service, and what we do for the ones that cannot.

## What the service does today (read 2026-11-15)

Read from a local copy of the service's source taken 2026-10-01. The repository is no longer
readable from our account, so this may be behind.

- **One install, one site.** An install takes one website code and one store view code, both or
  neither (`actions/processor/processDataPack.js:209`).
- **It rewrites every row to that site.** The import config replaces whatever a row names with
  the install's one site (`config/data_processors_import.json`): a product's websites, a product
  row's website, store and store view, a cart rule's websites, a customer's website and store, an
  attribute label's store view, stock's sales channel. Tier prices go to website 0 (all
  websites). Categories go under the store's root category.
- **Its install record has no website.** A record is keyed by Commerce instance, pack name,
  version and type (`actions/utils/installationTracker.js:55`). Installing the same pack into a
  second website overwrites the first record.
- **The same SKUs on two websites move rather than share** (inferred, not yet run live): the
  second install replaces each product's website list with its own website.

So a pack holding data for several sites installs as if it held one: everything lands on the site
the install names. Several packs with different SKUs, one install per website, is the shape the
service fits.

## Our engine today

Demo Builder's own engine copies the service's model: one website and store view per install,
chosen at install and locked after (`importRequest.ts`, `useImportScopes.ts`), pack values written
at the default scope (`buildDatapackEngine.ts:131`).

## What to explore

1. **The shapes.** Which multi-site demos SCs actually need: a brand per website (different
   SKUs), one catalog shared across websites (same SKUs, per-website prices or assortment), a
   translation layer on a store view ([[DI-15]]'s French example). Each one is a different
   pack shape.
2. **Which shapes survive the service.** For each, does a pack (or a set of packs) install
   through the service unchanged? A brand per website likely does, as several packs. A shared
   catalog likely does not: the second install moves the products.
3. **Where compatibility is decided.** Options to weigh, not chosen:
   - our packs stay one site each, and multi-site is always several packs ([[DI-15]]);
   - a multi-site pack is ours only, installed by our engine, and the service installs it as a
     single-site pack (or refuses it);
   - a pack format with per-site layers that the service sees as several packs.
4. **Export the other way.** What a multi-site store exports as, and whether the service's
   export (which also reads one site) can produce it.
5. **Test it live** on the test store with a second website before deciding: install the same
   pack into two websites through the service and record what moves.

Owner rule that bounds the answer: we never ask the Data Installer team to change their service;
gaps are solved on our side.
