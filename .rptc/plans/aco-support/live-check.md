# ACO live check: the owner's part, as a checklist

**For:** the first live run of ACO support (PL-60), on the merge rehearsal branch
`loop/2026-10-31-aco-merge`, after beta.153 ships. Every step here touches live Adobe
resources, so it is yours to run. Each step says what it settles and what to send back.

**What it settles** (the loader branch's "Unverified" list, `step-02-loader-and-config.md`):

1. The Developer Console's name for the ingestion API, and whether it needs a product profile.
2. What ingestion answers: the status on success, what a bad row does, and what deleting a
   key ACO never took answers.
3. Whether the storefront needs `AC-Environment-Id`, which Demo Builder does not send.

## Before you start

- Your ACO sandbox instance, with **one catalog view** made in ACO Studio (no API makes them).
- A scratch CitiSignal Edge Delivery project (CitiSignal is the package that offers ACO).
- The Debug Logs channel open ("Demo Builder: Debug Logs").

## Steps

**1. Load the build.** In the dev worktree: check out `loop/2026-10-31-aco-merge`, run
`npm run compile`, then "Developer: Restart Extension Host".

**2. Turn ACO on** (Configure, ACO tab). Tick it, fill tenant, region, environment, catalog
view and locale, then Save. Demo Builder subscribes the ingestion API on the project's
workspace credential.
- *Settles 1.* If it fails, send the dialog's message and the Debug Logs block: it names the
  services the Console listed, which is how the API's real name gets pinned.

**3. Load an ACO pack** (Data Installer: `aco_citisignal_new`, Import).
- *Settles 2.* Send the result screen and the Debug Logs lines starting with the ingestion
  calls: they show the status codes, and whether any row was refused.

**4. Look at the storefront.** Republish, then open a category page and a product page.
- *Settles 3.* If products are missing, send the browser console's network errors for the
  catalog calls. A complaint about the environment means the header is needed.

**5. Remove the pack** (same dialog, Remove data). Expect every row deleted by its key, and
the storefront's catalog empty after a republish.
- *Also settles 2* (the delete answers). Send the result screen.

**5b. Clear demo data, ACO part** (after step 5, with a few stray products loaded some other way).
Ask the agent for `check_demo_data` with `aco: true`, then `clear_demo_data` with its token.
- Settles whether the storefront search answers without a token through the project's view, and
  (re-run the check a few minutes later) how long ACO takes to finish deleting. Send both answers.

**5c. Two questions from the 2026-10-31 audit** (`.rptc/research/aco-support/audit-2026-10-31.md`):
- Does ACO's admin GraphQL accept the project's ingestion credential (the service lists catalog
  views and price books there)? If yes, the SC can pick the view from a list, and the clear can
  remove every price book's prices.
- Load a pack with a configurable product and look at a category page: do its variants show as
  separate products? If yes, the export should hide them.

**6. Turn ACO off** (Configure, untick, Save). The API is unsubscribed and the pair forgotten;
the credential itself stays, as you decided. The project is back to zero.

## What comes back to me

The messages and log blocks from steps 2 to 5. Each unverified point becomes either a pinned
fact in the code and its tests, or a small fix (the header, a status code), as slice 12 of
PL-60's plan.
