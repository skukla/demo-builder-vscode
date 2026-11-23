---
id: DI-13
kind: question
area: data-installer
needs: []
value: med
status: open
---

# The same pack in both stores, with different data: which one does an SC get?

Filed 2026-11-06 at the owner's ask, for the source-adapters work
([DI-12](2026-11-05-datapack-sources-as-adapters.md),
[research](../research/datapack-source-adapters/research.md)).

## The question

Demo Builder's datapack store and the Data Installer's database can both hold a pack with the same
name and version, and the two copies need not hold the same data. What should the adapter plan do
with such a pair: in the list, at install, at removal, and when one copy changes?

## It is already happening

Checked live 2026-11-06 (`find_datapacks`, `get_datapack`):

- **`luma@eds-compatible`** is in both. The Data Installer's holds the original Luma, products as
  `product_export` (11 data types). Ours is the DI-8 rebuild: products as product records, the
  VIP customer group added, size and yes/no values corrected (12 data types).
- **`venia@eds-compatible`** is in both. The Data Installer's lists `products` but holds no such
  item; its products are `product_export` only. Ours is the DI-8 rebuild.
- Ours also has **`luma@import-form`**, which the Data Installer does not.

Today the list shows one card per pack, and when both stores hold it the card is the store's
(2026-11-03, "a pack in both shows once, as the store's"). So the Data Installer's copy of Luma and
Venia is invisible in Datapacks, and its "Data Installer Datapacks" filter shows only the 5 packs our
store lacks. An SC cannot see that two different Lumas exist, or pick the other one.

## What depends on the answer

- **Identity:** whether a pack's name and version mean one set of data, or only one label.
- **The list:** one card or two; how a difference is shown.
- **Install:** which copy is read. Removal is not affected: it works from the install record.
- **Keeping in step:** the Oct 27 plan copies service to store one way and never overwrites a pair
  the store has, so once a pair differs it stays different.
- **Copy to the Data Installer** and the service's own installs: a pack we change and copy back
  would replace what other teams install.

## Recommendation

A name and version should mean one set of data. When a pack we rebuild differs from the Data
Installer's, ours gets its own version name (Luma's rebuild as, say, `luma@demo-builder`), and the
list shows each copy under its own source rather than hiding one. Then nothing is silently shadowed,
both copies stay installable, and neither store ever overwrites the other's pair. Detecting a
difference automatically (comparing a fingerprint of each copy's items) is worth doing only if pairs
keep colliding after that rule.

## Not decided here

Whether to rename the two existing collisions now, before beta.153's team-pack marking (plan s7),
or after.
