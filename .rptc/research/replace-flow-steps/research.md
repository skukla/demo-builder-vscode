# Restoring a version: what actually runs, measured (walk F107 to F113)

Owner, 2026-11-09: "step back and look at all the steps that need to occur in this process and how
to communicate them … look at the logs to see what's going on … rather than just guessing."

Source: the Debug Logs of the live Restore Version run on Scratch 1028, 2026-11-09 15:31 to 15:50
local, restoring My Luma's Nov 9, 1:56 PM version (`20261109-185605`) over the 9:15 AM version
(`20261109-141504`), with one changed product saved first. Every time below is read from a log line.

## The timeline

| Clock | Step | Took | What the log shows |
|---|---|---|---|
| 15:31:28 | Restore Version pressed | | `Opening …185605: the version its card showed`, then 15 ms later `Opening …141504: the version this demo uses` |
| 15:32:27 | Import pressed: the changes check | 47 s | `read back 2046 products in 28.2s` … `read back 1 coupons` (to 15:33:14) |
| 15:33:14 | The question waits on the SC | 6 min | (the owner, taking screenshots) |
| 15:39:36 | Save and Import: what the demo uses | 16 s | `what the demo uses: products in 14703 ms` |
| 15:39:52 | The save reads the store | 26 s | `capture: read 2048 products in 3 ms` (reused), then each type to 41.9 s |
| 15:40:18 | The save writes the library | 10 s | `create-datapack → 201`, 15 × `add-data-item`, `saved to the library at 52.0 s` |
| 15:40:28 | The save reads the store back | 36 s | `read back 2046 products in 24.0s` … `read back 1 coupons` |
| 15:41:04 | The job starts | | `Saved the store's copy … as …203932` |
| 15:41:05 | **The window closes** | | `Opening …203932: the version this demo uses` |
| 15:41:05 | (nothing logged) | 2 min 21 s | no line at all until the first delete |
| 15:43:26 | The old data comes out | 41 s | 11 × `deleted 200 of 200 products in one import`, done by 15:44:07 |
| 15:44:07 | Compare the store with the new version | 9 s | `comparing the store with the datapack` |
| 15:44:16 | Install | 3 min 47 s | `created attribute set Top` … `set 1901 stock quantities` (15:48:03) |
| 15:48:11 | Record what was installed (read back) | 40 s | `read back 2046 products in 28.2s` … `read back 1 coupons` |
| 15:48:51 | The install check | 19 s | `Install check: read 2048 products in 14.8 s, compared in 4.4 s` |
| 15:49:14 | The screen reads the store again | ~40 s | `Opening …185605: the version this demo uses`, then another `read back 2046 products in 26.6s` |

Working time, leaving out the SC's six minutes: about 11.5 minutes. Installing the data itself:
3 min 47 s. **The store was read in full five times** (the check, the save, the save's read-back,
the install's read-back, the install check), plus once more by the screen afterwards, and once
for two minutes that the logs do not explain.

## Why the window closed (a defect, verified)

The save moves the project's record onto the version it made (`…203932`). The screen re-reads the
project, and the flyout's own rule (walk F77: open on the version this demo uses) moves the flyout
to `…203932`. The import window was mounted only while the flyout showed the version being
imported (`detailToImport` in `DatapackCatalogView.tsx`, added for Version History the same day),
so it unmounted: the window closed a second after the job began. The job ran on; only the window
went. The same rule fought Restore Version at 15:31:28: it moved the flyout back to 9:15 AM fifteen
milliseconds after Restore moved it to 1:56 PM, which is the pause the owner saw (F107).

## What the SC is actually waiting for

The engine's steps, read off the code and the log, grouped by what an SC would recognise:

| The SC's step | What runs | Necessary? |
|---|---|---|
| Checking for your changes | read the store, compare with the version in use | yes, when the demo has a version Demo Builder installed |
| Saving your changes (if chosen) | what the demo uses, read the store, write the library | yes; but its read repeats the check's, minutes later |
| | read the store back to update the record | **probably not**: the store has not changed since the save read it. Why it reads back is to be confirmed in the code before cutting it |
| Removing the current data | the unexplained 2 min 21 s, then the deletes (41 s) | the deletes yes; the gap unknown until it is timed |
| Installing the new version | compare (9 s), install (3 min 47 s) | yes |
| | read the store back to record what went in | **to confirm**: it may need ids Commerce assigned; if the install's answers carry them, it is not needed |
| Checking the store matches | read 2,048 products (19 s) | yes; it could be the one read that also records |
| (after the window) | the screen reads the store again | to find out; probably the header's Save Changes check |

## What the window shows today against what runs

Today's rows: Preparing Import, Your Changes, Current Data, eleven data types, Finishing Import.
Preparing Import spins from the start though the save runs first; Your Changes shows the save's
stages, some of which repeat what the SC just watched ("Reading from Commerce"); Finishing Import
spins through two full reads the SC does not know about; and the 2 min 21 s gap shows as Current
Data with no count.

## Proposal (for the owner, before any code)

1. **The window never closes itself.** It is mounted for the import it was opened for, whatever
   the flyout shows. The import window reads its own version's data types, so Restore Version opens
   it at once (F107) and the flyout is not moved at all.
2. **Five steps, in the order they run, each a row the SC recognises:** Checking for Your Changes,
   Saving Your Changes (only when chosen), Removing the Current Data, Installing (the data types,
   as rows), Checking the Store. Preparing and Finishing are folded into the step they serve.
3. **Cut the two read-backs** (36 s and 40 s) if the code confirms they only re-read what was just
   written, and make the install check the one read at the end.
4. **Time the 2 min 21 s** with step clocks like the save's, before deciding anything about it.
5. **Find the read after the window**, and drop it if it is the header check re-running for nothing.

## What the code says about each read (2026-11-09, after the owner's go)

| Read | Code | Verdict |
|---|---|---|
| The save's read-back (36 s) | `rebaseRecord` in `recordFingerprints.ts`, called by `saveStoreChanges` (`saveStore.ts`) to move the record onto the version saved: `copiesByKind` reads every recorded object from the store again | **Redundant, to prove by test.** It re-reads what `capturePack` read moments before, through the same converters (`productPackForm`, `categoryPackForm`, `attributePackForm` in both `capture.ts` and `storeCopies.ts`). Hashing the captured rows instead needs a test showing both give the same hashes on the memory store first |
| The install's read-back (40 s) | `recordFingerprints.ts`'s module note: "One read after the writes, rather than Commerce's answer to each write … reading back is the one way every kind is hashed alike" | **Needed.** It records how Commerce stored each item, which is what later tells the SC's edits from the pack. But the install check reads all 2,048 products again 10 s later (`checkAfterInstall`): it can reuse the read-back's products |
| The 2 min 21 s gap | `runInstall` (`engine.ts`): `elsewhere` (other websites holding the pack), `deps.readPack` (the whole new version from the library), then `removePack` (`runPack.ts`): `settlePending`, `decideRemovals` (reads the store to keep containers holding the SC's things), then `takeBackAll`, whose non-product runs logged nothing | **Unknown split.** Each of those now logs its time (`jobClock.ts`: `Install of …: read the datapack in …`, `Removal of …: decided what to take back … at …`, `took back N <kind> in …`). The next live install or removal gives the numbers |
| The read after the window (≈40 s) | 15:49:14 the flyout moved to the version now in use, which is the version imported, so `detailToImport` mounted the import window again, on its form, and `useImportChanges` compared the store with it (`preview-datapack-changes`) | **The same defect as F113**, from the other side: the window came back by itself and compared for nobody. Goes when the window stops following the flyout |

## The design the owner chose (2026-11-09)

The clickable mockup is `mockup.html` beside this note. Owner: "I think this is right. Or at least
it's the best option we've seen."

- Before the question: the import window, titled for the import, waits on "Checking for your
  changes" at the question's width. The question comes only when something changed: the changes as
  a two-column list per data type, Import Without Saving at the left, Cancel and Save and Import at
  the right.
- The run is steps, each named as what it does, in the order it runs, shown only when it applies:
  **Save Your Changes**, **Remove the Previous Version** (or Previous Datapack), **Install the
  Version from Nov 9, 1:56 PM** (or Install My Luma), **Verify the Import**. The data types sit
  under Install in two columns, each with its own spinner. Preparing and Finishing are gone: reading
  the new version is Remove's first line, recording what went in is Verify's first line.
- The window is mounted for the import it opened for and never closes on its own; the ending stays
  on the steps.
- Owner, on the labels: "Current Data" was "a terrible label"; the rows are steps, so they name the
  step; "Checking the Store" was not the right language for the last one. Verify the Import was
  proposed in its place.
- Owner agreed **Verify the Import** after the reuse check: the verb is the house word for
  confirming a result (Clear Demo Data's "Verifying demo data", storefront setup's "Verifying AEM
  Code Sync"), and its lines reuse the import's own words: "Checking the products against the
  datapack" while it runs (`CHECK_PHASE`, `engine.ts`), "Checked 2,048 products against the
  datapack: all match" when done (the ending's note today). Steps are named as steps, not with an
  "-ing" stage word, because they stay on screen after they finish.

## The timers, live (2026-11-09 17:01 to 17:17, Scratch 1028)

**Importing the same version again** (walk step 3), job 22:04:44Z: `checked other websites in 0.0 s`,
`read the datapack in 0.0 s` (the shared pack cache from the form's own read), `using the comparison
made 66 s ago`, install check 14.1 s; 25 s in all; nothing sent, no "Took out" line, all 2,048 match.

**Remove Data** (walk step 4), job 22:14:29Z, 3 min 5 s:

| Step | Time |
|---|---|
| Settle what an earlier run left half made | 0.0 s |
| **Decide what to take back** (2,197 objects, 0 kept) | **134.8 s** |
| Take back the coupons | 3.7 s |
| Take back the products and gift cards (11 bulk deletes) | 18.1 s |
| Take back the rest (customer groups, customers, rules, categories, sets, attributes) | 28.3 s |

Before the confirm, Remove Data's own changes check read the store for about 47 s (17:11:40 to
17:12:27), so the SC waited about four minutes in all.

**The 2 min 21 s is `decideRemovals`** (`removers.ts`). It asks, one container at a time and in
order, whether anything not being removed sits inside it: for each of Luma's 39 categories a
category read plus a search of its products by `category_id` (the root holds all 2,046, a page per
hundred), for each of its 8 attribute sets a search by `attribute_set_id`, for each cart rule its
coupons. Sequential, because a kept child keeps its container (`decisionOrder`), and paged searches
on the big containers. Options, to measure before choosing: (a) run the independent containers'
searches several at once, keeping the order only where one depends on another; (b) one read of the
instance's products (`sku`, `attribute_set_id`, category links) and decide locally, about 20 to 50
pages instead of roughly 150 calls.

The per-run log names a run by its first object's kind (`took back 2048 giftcards` was products and
gift cards; `took back 51 customer_groups` was six kinds): to name every kind in the run.

## Built (2026-11-09, not yet re-measured live)

- The keep decision reads up to five containers at once (`removers.ts`, `fewReadsAtOnce.ts`): on a
  Luma-sized test store the same 153 reads in 33 rounds. Estimate, not a measurement: 134.8 s x
  33/153, about 30 s, if Commerce answers five at once as fast as one.
- The save's read-back (36 s) is gone for products, gift cards and attributes: the record is built
  from the capture (`recordReuse.test.ts`).
- The install check (14.8 s) reuses the read-back's products after a first install; a reinstall that
  wrote nothing still reads them.
- The removal's per-run log names every kind it took.
- The window as steps, fixed to its import, Remove Data in the More menu (the UI half, F107 to F118).
