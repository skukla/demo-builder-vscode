---
id: DI-7
kind: feature
area: data-installer
needs: []
value: low
status: backlog
---

# Datapack images: how a pack carries its product images

Filed 2026-10-30 from datapack-engine step 11 (owner, 2026-10-29: images become their own item).
What was known before is in step 05's "Left out, and later"
(`.rptc/plans/datapack-engine/step-05-capture-and-repeat-installs.md`).

## What is known

- **No pack carries images today.** The Data Installer's export removes `media_gallery_entries`
  and keeps the `image`, `small_image`, `thumbnail` and `swatch_image` attributes as file paths of
  the store they came from; nothing downloads or uploads a file. `product_images_import`
  (`/V1/async/bulk/products`) is defined in the service's endpoints and used by nothing
  (`.rptc/research/datapack-engine/export-spec.md` §6).
- **Demo Builder's engine does the same on purpose**: pack form leaves `media_gallery_entries` out
  (`packForm.ts`), install sends the paths as they are (`productsKind.ts`).
- **On the ACCS sandbox, images are AEM assets, not Commerce media.** A product's images are
  `asset_role_*` attributes holding AEM delivery URLs (`media_type: asset-image`). Measured:
  CitiSignal's gift card on the sandbox, read 2026-10-30, carries exactly that (`GET products`, `type_id` eq `giftcard`; `GIFT_CARD_6` in
  `tests/helpers/commerceSalesRuleFixtures.ts`, images trimmed there). An earlier session noted,
  and this item did not re-check, that product image writes there answer 403 while the AEM
  Assets integration is on.

## Still open

1. How today's demo storefronts get their images (AEM Assets URLs on ACCS, files on PaaS), before
   any pack carries them.
2. Whether an ACCS pack should carry the `asset_role_*` URLs as they are (they point at one AEM
   environment, chosen per org by `demoBuilder.daLive.aemAuthorUrl`) or not at all.
3. Removal: an uploaded file, or an asset link, needs its own undo (rule 1).

**Recommended:** answer question 1 on two live demos (one ACCS, one PaaS) first; nothing waits on
this, since every pack installs and removes without images today.
