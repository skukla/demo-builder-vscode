# Configure: what it should do, and where it falls short

Researched 2026-10-13 at `9107c703b` on `loop/2026-10-05-release-candidate`. Asked by the
owner: "Configuring a project is used more often than editing one, so we need to nail down
what configuring will do and make sure that it is solid." Three read-only audits (what Save
does, history and tests, agreement with the other doors), then the findings marked
**checked** were re-read by hand. **Agent** means an audit read the code and it was not
re-checked; **inferred** means nobody traced it end to end.

## What Configure should do (proposed contract)

1. **It shows the project as it is now**, every time it opens or is revealed.
2. **Save writes what the SC changed, and nothing else.** A field the SC did not touch is
   not sent, so a window opened earlier cannot put old values back.
3. **Save is whole or says exactly what it did.** No secret written for a save that is then
   reported as failed.
4. **Every saved change says how it takes effect**, and the follow-up (Republish, Redeploy
   Mesh, Restart) really applies it and reports truthfully.
5. **There is one save.** The agent's `configure_project` goes through the same code as the
   button, so a change made by an agent is detected, applied and offered the same way.

Today it meets none of these fully.

## Where it falls short, worst first

### A. Changes that silently revert or never take effect

1. **A reopened Configure window can undo changes made elsewhere.** (checked state, inferred
   end to end) Reopening re-sends the data without remounting the screen
   (`useConfigureSections.ts:72-76`). Only `componentConfigs` is re-seeded; the project name
   is held in `useState` seeded once (`useProjectNameField.ts:53`), and so are the authoring
   choice and block-library ticks. After a rename elsewhere, Save sees "old title ≠ current
   name" and renames back; authoring is always sent for Edge Delivery projects
   (`useConfigureSave.ts:109`), so it flips back.
2. **Save sends every value it loaded.** (agent) Only integration settings and block
   libraries are protected. A store-scope change an agent made while Configure was open is
   overwritten; the config of an integration removed meanwhile is brought back.
3. **An agent's settings change never marks the storefront out of date.** (checked)
   `configure_project` marks only the mesh stale (`configureProjectTool.ts:336`) and never
   calls `detectStorefrontChanges`, so the storefront tile stays green while `config.json`
   keeps the old store codes. It also does not regenerate the component `.env` files.
   (agent)
4. **An agent's store scope on a PaaS project writes the SaaS keys.** (agent)
   `storeScope.ts:31-53` always writes `ACCS_*`; PaaS reads `ADOBE_COMMERCE_*_CODE`. The scope
   looks applied and nothing reads it. `create_project` shares the helper.
5. **The Restart prompt goes quiet for the rest of the session** once closed. (agent) It has
   no Later button, closing it marks it shown, and the re-arm resets only the mesh and
   storefront prompts. Later saves say "saved successfully" while the running demo keeps the
   old `.env`. The mesh-only prompt says "and restart demo" and does not restart.
6. **Republish from Configure can report success when nothing changed live.** (agent) It
   passes no DA.live session (`configure.ts:643-651`), and a CDN still serving the old config
   comes back `success: true`.

### B. Save blocked with no visible cause

7. **A required stored secret can disable Save while its field looks fine.** (checked)
   Validation ignores the secret flags (`configureFieldValidation.ts:35-45`); the field row
   hides the error for a stored secret and shows "Saved — type to replace"
   (`StoreConfigFieldRow.tsx:85-96`). It bites when no `.env` holds the value (inferred), and
   only the rail tab's error mark hints at it.

### C. Half-saves

8. **Secrets are written before the save can fail.** (agent) `migrateDeclaredSecrets` writes
   to the keychain first; a later failure leaves the new (or deleted) secret in place for a
   save the SC was told failed.
9. **If `.env` regeneration fails, no follow-up is ever offered** (agent): the manifest is
   saved, the screen says "Failed to save", and the prompts never run. The post-save prompts
   also run with no error handling (`configure.ts:393-400`).

### D. Secrets on the screen

10. **Real secret values likely reach the webview.** (checked read path, inferred content)
    `loadExistingEnvValues` reads each component's `.env` raw (`configure.ts:515-563`), and
    those files are written with secrets put back in. That contradicts the screen's own
    premise that it cannot see the keychain.

### E. Untested and undocumented

- No real Configure save has ever been tested end to end: every test uses fakes, and every
  Configure row in both release test plans is empty. Row 3.4 of the 2026-10-10 plan is stale
  (it tells the SC to tick a library in Edit, which is now locked).
- No document lists the current tabs (Project, Connection, Business Structure, the service
  groups, Block Libraries, Authoring). ADR-003 still says Connection and Business Structure
  are one tab; ADR-004 cites an `AiConfigurationTab.tsx` that does not exist.
- About 30 fixes since October 2025 (list in the history audit), most of them a value not
  loaded, not saved or not applied.

## What would fix most of it

Two structural changes cover A1 to A4, C8 and much of E:

1. **Send only what changed.** The screen tracks touched fields already (`touchedFields`);
   Save sends those plus the name and authoring only when they differ from what was loaded.
   Re-seed every field on re-open.
2. **One save service on the extension host**, called by the button and by
   `configure_project`. It validates, writes secrets last (after the manifest), detects mesh
   and storefront staleness, regenerates `.env`, and returns the follow-ups. The agent tool
   then gets the same detection the button has, and the PaaS/SaaS key choice lives in one
   place.

The rest are small, separate fixes: the Restart prompt's Later and re-arm, the DA.live
session on Republish, secret-aware validation, not sending secret values to the webview.

Then a live check of a real save on a scratch project, row by row, which no one has done.
