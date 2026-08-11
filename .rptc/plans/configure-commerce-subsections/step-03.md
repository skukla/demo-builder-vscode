# Step 03 — One Storefront tab instead of two single-control tabs

Depends on 02 only for the tab count to be worth quoting.

## Why

Two adjacent tabs, one control each, describing the same thing:

- **Adobe Assets** — EDS: `AEM_ASSETS_ENABLED`, a two-option Picker. Headless:
  `ADOBE_ASSETS_URL`, one optional URL.
- **Authoring** — a two-option radio (`da-live-classic` / `experience-workspace`), EDS only.

They are one concern: how this storefront authors and where its media comes from. And they
are actively coupled in a way the split hides — `AEM_ASSETS_ENABLED` needs the AEM
`repositoryId` from VS Code settings, and the only pointer to Extension Settings sits in
the **Authoring** tab's footer (`ConfigureSectionBody.tsx:114-127`). The prerequisite for
one tab's field is a link in the other tab.

## Change

Introduce a `storefront` group and move the assets vars into it:

1. `serviceGroupTransforms.ts`: add `{ id: 'storefront', label: 'Storefront', order: … }`
   with a `fieldOrder`. Slot it after the commerce/catalog groups.
2. `components.json`: `AEM_ASSETS_ENABLED.group` and `ADOBE_ASSETS_URL.group` →
   `storefront`. Leave the `adobe-assets` definition in place (unpopulated, like `mesh`).
3. Fold the hardcoded Authoring section into the same tab. It is not registry-derived
   (`configureSections.ts:160-162`) and it is `unvalidatedSection` with `requiredTotal: 0`,
   so it cannot simply become a group field — the tab body needs to render the service
   group **and** the authoring radio.
4. Move the Extension Settings link so it sits with the field that needs it.

`ConfigureSectionBody` already dispatches on section `kind`; this is a `serviceGroup` body
that also renders the authoring control when `isEds`. Keep the authoring value's existing
write path (component-instance `metadata.authoringExperience`, `configure.ts:409-428`) —
it does not move into `componentConfigs`.

## The naming question

"Storefront" is the wizard's word for the EDS area (`buildYourProjectAreas.ts`), so it is
consistent vocabulary rather than a new noun. On a **headless** project the tab holds only
`ADOBE_ASSETS_URL` and no authoring control — check the label still reads sensibly there
before committing to it. If it does not, the fallback is to keep two tabs and just move
the settings link; say so rather than shipping a label that only works on EDS.

## Tests

- EDS project: one Storefront tab holding both the assets control and the authoring radio;
  no separate Adobe Assets or Authoring tab.
- Headless project: Storefront tab holds the assets URL and **no** authoring radio.
- The authoring value still round-trips to `metadata.authoringExperience`, not to
  `componentConfigs` — control: it does not appear in a generated `.env`.
- `ConfigureScreen-rendering.test.tsx:179` pins an exact rail label sequence; update it
  deliberately and keep it exact.

## Done when

- EDS+ACCS is Project · Commerce · Storefront
- The assets prerequisite link sits with the assets field
- Authoring still writes where it always did
- `gate` green
