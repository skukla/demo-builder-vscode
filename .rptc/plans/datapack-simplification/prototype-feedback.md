# Prototype Feedback Log

One row per scenario. The owner gives a verdict and his reason in his own words.
`decisions.md` (plan step s10) is written from this log, never from memory.

Verdicts: **Pass** · **Fail** · **Change** (passes once the noted change is made)

## J1 — Window Conventions

Prototype: `mockups/flow/proto-j1.html` (http://127.0.0.1:26839/proto-j1.html)

| ID | Scenario | Click path | Judge | Verdict | Owner's words | Date |
|---|---|---|---|---|---|---|
| J1.1 | Clear, variant A: sized for the tallest content | Sizing **A** → Clear Demo Data → tick a store | Empty space, growth, scrolling, button position | **Fail** | "Both of these are the worst possible experience. We have a massive modal for no reason to the end user on that first step. And then on the second, we have content that scrolls." | 2026-11-11 |
| J1.2 | Clear, variant B: sized to what shows first | Sizing **B** → Clear Demo Data → tick a store | Same | **Fail** (by the same reasoning: the preview scrolls) | Covered by J1.1: content that scrolls is rejected | 2026-11-11 |
| J1.3 | Clear, variant C: what shows first plus a fixed area for the late part | Sizing **C** → Clear Demo Data → tick a store | Same | **Fail** (by the same reasoning: empty space before ticking, and the area scrolls) | Covered by J1.1 | 2026-11-11 |
| J1.4 | Clear in two steps: choose stores, then review what will be cleared. Height changes only between steps | Sizing **J1.4** → Clear Demo Data → tick a store → Next → Back | Each step fits its content; no growth within a step; no scrolling; the step change itself | **Withdrawn** | Built on the store picker the plan removes (overview.md, Phase 6 item 3); the owner caught it. Replaced by J1.6 and J1.7 | 2026-11-11 |
| J1.5 | Clear in one step with a one-line summary; the full list opens as a second step | Sizing **J1.5** → Clear Demo Data → tick a store → Show What Will Be Cleared → Back | Same, plus whether one line is enough to decide | **Withdrawn** | Same as J1.4 | 2026-11-11 |
| J1.6 | Clear Demo Data as planned: no picker. Waits while it reads, then opens at its final size with one line per data type (what happens, where it came from, a few names; what is kept, and why) | **Clear** menu → Clear Demo Data | Is one line per type enough to decide? The window size (551px measured, no growth, no scrolling) | Pending | | |
| J1.7 | Clear Commerce Instance as planned, two steps: choose websites (each names the projects using it), then review per type, the warning and the "I understand" box | **Clear** menu → Clear Commerce Instance → tick websites → Next → Back | Same, plus the step change (434px, then 703px with all three websites) | Pending | | |
| J1.8 | Either Clear window with the data types down the left and the chosen type's records on the right (the Save From Store layout), read-only and searchable | Panel layout **Types and records** → either Clear window → click a type | Every record worth a wider window (659px; 802px for three websites) and a long list scrolling inside its pane? | **Change** (see J1-3) | "Yes" (meant as interest, not a pass; corrected below) | 2026-11-11 |

### J1 Walk, Step by Step (`journeys.md`)

Step ids use a hyphen (J1-1) so they never collide with the scenario ids above (J1.1).

| Step | Question | Verdict | Owner's words | Date |
|---|---|---|---|---|
| J1-1 | The Clear menu's two names: Clear Demo Data, Clear Commerce Instance | **Pass** | "Yes, the names are right. Pass." | 2026-11-11 |
| J1-2 | One line per data type: enough to decide? | **Change** (grey detail and names removed; one line per type stands as the confirmation) | "Far too noisy. All of the extra information in the gray should be removed at the least. If this is a confirmation dialogue, then I suppose this approach is fine. But if we want to offer the SC the ability to spot check the data being removed, then we need another experience to allow them to browse it per data type. (Hence why I mentioned the rail-based experience)" | 2026-11-11 |
| J1-2 (spot check) | Types on the left, records on the right, so the SC can spot-check, instead of J1-2’s confirmation? | **Change**: combine them. The summary is the window; the records are an optional spot check from it. (Logged as a pass by mistake, then corrected.) | "I didn't say that was cleared. I want to see if we should think about combining the summary view with an optional spot check view." | 2026-11-11 |
| J1-3a (four follow-ups) | Summary with an optional spot check | **Change**, four items. 1 done: every grey detail line struck. 2–4 open, to settle together | 1: "The added by hand comments are noise we don't need. Strike all similar comments." 2: "In the categories view here, we need to be able to discern the category tree structure visually. This is a reusable challenge." 3: "I'm trying to decide whether this kept line is AI noise or not." 4: "What happens when the list on the left expands its container. Is there anything we would reuse to address that?" | 2026-11-11 |
| J1-3a | Categories as an indented tree; a filtered match keeps its parents | **Pass** | "Pass" | 2026-11-11 |
| J1-3b | Kept records tagged Kept at the bottom of the list | **Change**: badge better than a sentence, but unseen at the bottom of a long list. Agreed fix: the left column says "2 kept" in the house notice colour (`.text-notice`); a Removed / Kept switch (`ViewSwitcher`) above the list; the Kept view groups records under their reason | "A list of customers that has to be scrolled to the bottom won't be noticed. I agree that the kept badge is better than a line of text, though." Then, on the fix: "What do we do if the list of kept records is long, though?" and "We need to make sure to use the colors in the existing design system." Agreed: "Yes" | 2026-11-11 |
| J1-3b (second pass) | Removed / Kept tabs; "10 2 kept" in the left column | **Change**: tabs good; the count said four times and "10 2 kept" are noise. Made: the count only in the left column; the heading, tab counts and list count gone (`SearchHeader` `hideCount`); a verb line only when more than "removed" ("Closed, never deleted"); kept shown as the house `StatusDot` (notice) with "2 kept" on hover | "We have the count of records to be removed on the record types down the left-hand side. We also state the number … at the top of the right-hand column. This makes it feel noisy to me. We say 10 customers like three times here." "10 and 2 kept as drawn on the left-hand side is noisy and an overload for the eye. Using the tabs to show the kept versus removed records is good though." | 2026-11-11 |
| J1-3b (third pass) | Layout differs by type: the verb line, tabs on one type only | **Change**, made: the verb line is gone from the spot check (the summary says what happens); Removed / Kept tabs on every type, Kept greyed out when nothing stays. Every type can have kept records (`wipePlan.ts` lists a kept case for each). `ViewSwitcher` gained `isDisabled` per view, with a test | "I still see hint text in the right-hand columns, which throws off a consistent layout. The addition of the kept tab also throws off a consistent layout because the other screens don't have that." "Is it possible for all types to have kept records? If it is, then we can make this add." | 2026-11-11 |
| J1-3b (keep reasons) | Why a record stays, worded per case | **Change**, settled and built: one fixed list of reasons for every type, the basic fact only: Used by Another Demo, Owner Unknown, Protected Setting, Already Closed, Left Open. A failed read is not a reason; it is a problem with Retry (engine change, for the build phase: today `wipePlan.ts` files some failed reads as left) | "It feels less like software and more like a one-off AI solution. Can we standardize this somehow?" On orders: "Can't be closed reads like an error, but it's not an error." "It needs to be more generic. A commerce SC is not going to know these particulars. We just need to give them the basic fact they need to know." | 2026-11-11 |
| J1-3b (kept layout) | Kept records under reason headings | **Change**, built: name and reason columns, same row height as Removed, sorted by reason then name; no headings, no column headers | "I don't think this display works. It causes layout shift. Would a table with a reason column work better?" Agreed: "ys" | 2026-11-11 |
| J1-3b (headers and tab dot) | Columns unlabelled; nothing ties the left column's dot to the Kept tab | **Change**, built: column headers on both tabs (Name; Name and Reason), one row the same height; the Kept tab wears the same notice dot when its type has kept records, so an available Kept differs from a greyed-out one. `ViewSwitcher` gained `marker` per view, with a test; its one CSS rule waits in the prototype page for the build phase's visual baseline | "This is better for sure. I'm still not sure whether the tables need column headers, just for labeling purposes, to be clear. I'm also wondering if there's enough of a call out between the orange dot on affected data types and the kept column..." Agreed: "yes" | 2026-11-11 |
| J1-3b | The spot check as a whole | **Pass**, with one change made: the kept dot moved after the count, in a fixed slot on every row, so the counts and the dots each line up | "I think this is good. The last question I would have is, should we move the dots to the right of the column so that the counts and the dots all line up with each other?" Agreed: "Yes." | 2026-11-11 |
| J1-3b (order rule) | An order the engine leaves open ("Left Open") | **Agreed, shown for approval**: every demo order ends Canceled or Closed; when it cannot be canceled, invoice what is not invoiced, then refund it all offline (Experience League: "Closed … an order was assigned a credit memo and the customer has received a refund"; "you must generate an invoice before creating a credit memo"; "an offline refund … for any payment method"). The orders spot check's first tab reads Closed. The one exception, a payment under review (PayPal fraud filter, PaaS only), stays open and needs the SC: an orange line under Orders on the summary, and "Payment Under Review" in orange in Kept. Build phase: the rule lives in two repos (`wipeOrders.ts` and the ERP integration's `reset-rule.js`); a shared test table of order states keeps them one, a shared package if it keeps changing. Needs the live test on the test store, with the owner's go | "If we have an order that belongs to the demo and the data is being removed … part of that process would need to close out the existing orders, right?" "Keep in mind that the same order rule applies for a case when an ERP integration is being removed." "Check the commerce documentation to see when and how an order can be closed." "I agree with this, but now I need to see what that would look like for the SC before I can approve it." | 2026-11-11 |
| J1-3b (problems and their fixes) | Already-closed orders listed as kept; no way to the fix | **Agreed and built**: already-closed orders are not listed (they end as the others do). A problem note carries ONE action leading to where it is fixed: payment review, Open Commerce Admin (the shared `commerceAdmin.ts` helper, as the setup guide and a pack's setup step use); ERP orders the integration could not close, Update Integration. In Clear these are the only two problems; a failed request is Retry. Open: the deep link to an order page, which Adobe does not document for the Unified Shell (owner to try two links) | "Should we show an SC orders that are already closed as kept, or should we ignore them? And should we offer a link to fix an admin…?" "1. Agree 2. Agree 3. Confirm and add." "Is the fix in admin link only going to apply to that one error…?" Add the ERP case: "Yes" | 2026-11-11 |
| J1-3b (Commerce is the source) | Clear handing ERP-served orders to the integration; payment review on the summary | **Decided and built**: Clear closes every demo order in Commerce by the one rule, never through the ERP integration; the ERP is brought in line afterwards, as its own step, and its failure is an ERP problem. Payment review leaves the summary (too rare); the run's result reports it with Open Commerce Admin. Orders now have no kept reasons and no problem lines; Kept is greyed out. Documented for the integration in its `docs/order-close-ownership.md` (worktree `commerce-erp-integration.worktrees/one-reset-rule`, uncommitted), with pointers in `reset-rule.js`, `reset-closed.js` and this repo's `wipeOrders.ts`. Found while documenting: the integration skips events only for orders IT marked closed, so Clear's direct closes could reach an ERP; the doc names the fix options | "These order reasons feel very complicated. I'm trying to understand how realistic this is." "1. Agree 2. Don't understand 3. Agree." "These rules shouldn't depend on one another, and commerce should be the source system, not the ERP." "Yes. You also need to make sure to document this for the ERP integration code itself in case changes need to be made." | 2026-11-11 |
| J1-3b (protected settings) | "Protected Setting" as a kept reason | **Removed**: a datapack can never set one (`isOffLimitsSetting`: `web/`, `admin/`, credentials) and Clear never changes one, so there is nothing to know or do. Kept reasons left: Used by Another Demo, Owner Unknown. Open: the list-setting case (Commerce's API cannot restore a list such as order cancellation reasons) | "What's an example of a protected setting that a user could change that a data pack would need?" "Take protected setting off and give me an actual use case for the list case." | 2026-11-11 |
| J1-3d | The result after Clear, with one setting it could not reset (order cancellation reasons) | **Pending**, built on the house `ProgressDialog`. Found while measuring: the house window grows as the run ends (525 → 543 → 583px: the problem line and the closing line arrive late), against "never grows once on screen"; and the problem line on the row is grey, not the orange the dialog rules ask for. Both are in the real component, not the prototype | "What would it look like?" | 2026-11-11 |
| J1-3d (growth) | The result window growing as the run ends | **Pass** on the result; growth fixed in the prototype, three causes found by measuring: (1) the closing sentence under the list, cut (it repeated the row and the button); (2) the problem line now waits for the end and takes the room the working row's progress line held ("Removing 1,026 of 2,052"), and must fit one line (a wrapped line grew it 19px); (3) the title row grew 3px when the status icon appeared, fixed by `vertical-align: top` on `.modal-title`. Result: 543px from first frame to last. Causes 2 and 3 are changes to the shared progress window and `modal.css`, for the build phase with a visual baseline | "I think it looks fine. I'm not sure what to tell you about the growth issue though." "I don't understand what you're recommending." Then: "Yes" | 2026-11-11 |
| J1-3d (where the fix goes) | The fix action: footer or on the problem row | **Pass, footer**: an ended run's one action sits beside Close, as every run and result window does (`ResultDialog`, `ProgressDialog` `action`). Buttons on rows are for a window with several fixes in different places (the setup guide, `GuideDialog`); a clear that ever ends with two problems needing different fixes switches to row buttons | "The only thing I don't like here is we're missing the fix and admin link." "What's the current house style and what do you recommend?" "Agreed. All right, I think we can move on." | 2026-11-11 |
| J1-3c | The left column with all 11 types, then 15 | **Pass**: holds 11 without growing and scrolls inside itself past that. Build phase: the real `.datapack-picks-rail` needs `overflow-y: auto` (the prototype adds it), with a visual baseline | "Left column holds all 11 and scrolls as expected. Looks good." | 2026-11-11 |
| J1-4 | Clear Commerce Instance, step 1: websites, each naming the projects using it | **Pass** | "J1-4 looks good." | 2026-11-11 |
| J1-4 (linked type names) | Type names on the summary as links into the spot check | **Change**, made: plain text; Review Records is the one way in (two controls did one job, and nine blue names read as nine things to click). Both Clear windows | "The one thing that caught me off guard was the linked data types. With the review records button, I'm wondering if linking through to the individual type is noise or necessary." Agreed: "Yes" | 2026-11-11 |
| J1-5 (with-phrases) | "with their customers", "with their customer groups", "with its coupons" on summary lines | **Change**, made: every record counted under its own type, no "with" phrases. Customers already includes company customers (`WipePreview`); a catalog's own customer group now counts under Customer Groups; coupons go with their rule unsaid. Build phase: the engine counts catalog groups apart from Customer Groups today, so the count changes, not only the words | "We have lines that say things like with their customers or with their customer groups. Then we show those same data types later in the list. Are the lines noise or necessary?" Agreed: "Yes" | 2026-11-11 |
| J1-5 (orders line) | "23 closed, never deleted" | **Change**, made: "23 closed" | "\"never deleted\" is noise." | 2026-11-11 |
| J1-5 | Clear Commerce Instance summary: warning and "I understand" box | **Pass**. J1 complete | "Yes, this is good." | 2026-11-11 |
| J1-3d (Admin deep link) | Can a problem's fix open the exact order in the Admin? | **No**: the Unified Shell sent a link to the orders list to the dashboard (owner's test, 2026-11-11). Fixes open the Admin home, Open Commerce Admin, as today's buttons do | "I don't think that it deep links to the order." | 2026-11-11 |
| J1-3b | Will an SC notice what stays, and does it hold up when the kept list is long? | **Change**: made: Owner Unknown removed (it only arose on a partly chosen website, and Clear now clears whole websites); with one reason left, Kept has no Reason column and stores no reason | "What is the owner unknown reason for a customer? Wondering if it's noise or necessary. ... Yes" | 2026-11-11 |
| J1-5 | Enough to stop a mistake? | **Pass**: J1 approved as a whole, after the guided tour: every decision and the build-phase items stand | "All approved." | 2026-11-11 |

### What J1.1–J1.3 Establish

- A window must not open far larger than what it shows.
- Content inside a window must not scroll for an ordinary amount of content.
- Together with "never grows once on screen", these three rules cannot all hold when
  one step's content gets taller after it opens. So such a step must be split into
  steps, or its content made shorter. That is not a sizing problem.

## J2: Installing a Datapack

### J2 Walk, Step by Step

| Step | Question | Verdict | Owner's words | Date |
|---|---|---|---|---|
| J4-2 | Nothing to change: "My Luma Is Up to Date", closing itself. Right? | **Change**: Owner chose Restore My Luma for the button on the datapack the demo already uses (after the three use cases: put it back, get the latest save in, nothing changed). The card's Install button was invented by the prototype and is removed: actions live in the flyout. Up to Date and Save Your Changes First move to J4; J2 covers installing a datapack the demo does not use. | "Go" | 2026-11-11 |
| J2-1 | What Bodea adds by data type, every type ticked; a locked row says why. Clear? | **Change** | "2-1: This seems very noisy to me. Before we go any further, I think you need to take another look at all of the conventions we have and all the conventions we implemented after 1-1 and then see what you need to change in the second journey so that we don't have to keep correcting the same stuff." | 2026-11-11 |
| J2-1 | What Bodea adds by data type, every type ticked; a locked row says why. Clear? | **Change**: Agreed: no data-type checkboxes on install (Install installs the whole datapack; partial installs mix data); the save question shows counts by type, no example names; no line explains why anything is ticked or locked. J2 is reworked against prototype-conventions.md. | "Yes. but also the noisy text. We don't need to tell people why things are ticked." | 2026-11-11 |
| J2-1 | What Bodea adds, one row per type; Review Records for the records. Clear? | **Pass**: Made: install rows show the bare count ("Products 56"); "53 added, 3 updated" only when some records already exist. | "I think the summary is good, but the question is, on an installation like this, does the term "added" seem off or is it okay? ... Yes. Otherwise, the flow is good." | 2026-11-11 |
| J2-2 | One run window with steps; a clean run ends on the small result. Right? | **Pass** | "From what I can see J 2–2 looks good." | 2026-11-12 |
| J2-3 | "Replace My Luma with Bodea?" with what Bodea adds; with unsaved changes, "Save Your Changes First?" next; then the run. Right? | **Change**: Opening line dropped: the title goes straight to the table, as in J2-1. | "This looks good. My question is, what do we think about the opening line text? It's kind of obvious. ... I think we either drop it or we go with something like the following data types will be added. ... Yes." | 2026-11-12 |
| J2-3 | "Replace My Luma with Bodea?" with what Bodea adds; with unsaved changes, "Save Your Changes First?" next; then the run. Right? | **Change**: Spot check (Review Records) has one button, Back, on the right; no Cancel, no action. Applies to every spot check (Clear, Install, Replace). Conventions rule 19. | "What do we think about the buttons on this modal? Does it really make sense to have a cancel dialogue on the right side where an action dialogue normally goes? ... I wonder if there should even be any action button for a review modal like this, or if it should only go back to the summary and let the summary be the chief action door. ... go" | 2026-11-12 |
| J2-3 | "Replace My Luma with Bodea?" with what Bodea adds; with unsaved changes, "Save Your Changes First?" next; then the run. Right? | **Change**: Save window line is now: Your changes will be lost if you don't save them. | "Replacing My Luma takes these changes out of Commerce. I don't like this language. ... Yes." | 2026-11-12 |
| J2-3 | "Replace My Luma with Bodea?" with what Bodea adds; with unsaved changes, "Save Your Changes First?" next; then the run. Right? | **Pass**: Order kept: the save question comes after Replace, as software asks at the moment of the action. | "Hard to say at this moment.What do you recommend? What does software actually do? ... Yes" | 2026-11-12 |
| J2-4 | Passed, Found a Problem (Fix with AI), Failed (Retry). Right? | **Pass** | "J2-4 passes." | 2026-11-12 |
| J2-3 | "Replace My Luma with Bodea?" with what Bodea adds; with unsaved changes, "Save Your Changes First?" next; then the run. Right? | **Change**: Always Save Changes box removed from every save question; the setting stays. | "Do we think the always save changes check mark is clear here and everywhere else it's shown? ... I just have an issue with it on the forum for some reason. It feels like clutter to me. ... Yes." | 2026-11-12 |
| J2-3 | "Replace My Luma with Bodea?" with what Bodea adds; with unsaved changes, "Save Your Changes First?" next; then the run. Right? | **Change**: One-time tip after the first save question, as delete's: Tip: You can customize saving changes in Settings → Demo Builder, Open Settings. | "Yes" | 2026-11-12 |

## J3: Saving, Creating, Undoing

### J3 Walk, Step by Step

| Step | Question | Verdict | Owner's words | Date |
|---|---|---|---|---|
| J3-1 | Save shows what My Luma will hold, then "Saved to My Luma"; Save As New asks only a name. Right? | **Change**: Save run is two steps: Export from Commerce (types under it, "Exporting 19 of 38"), then Save My Luma as one row. | "Should it say reading or saving for data entities as they're being saved? ... The other option might be to break it into two steps: exporting and saving? ... Should it be reading and then saving or exporting and then saving? ... Go" | 2026-11-12 |
| J3-2 | What it holds first, then the name with Create. Right? | **Change**: Two windows: what it holds first (wide picker, Cancel and Next), then the name (small, Back, Cancel and Create). Both titled Create Datapack; the What It Holds heading is gone. | "J3-2: I'm not crazy about the look of this two-stage modal. I think the main reason is that it's hard to know where to focus my attention. Is there a better design for this, or would it perhaps be better to break it apart into two steps? ... Concerning the order, what would be the most consistent choice? ... Yes" | 2026-11-12 |
| J3-2 | What it holds first, then the name with Create. Right? | **Pass** | "3-2 looks good" | 2026-11-12 |
| J3-1 | Save shows what My Luma will hold, then "Saved to My Luma"; Save As New asks only a name. Right? | **Pass** | "3-1 is good" | 2026-11-12 |
| J3-1 | Save shows what My Luma will hold, then "Saved to My Luma"; Save As New asks only a name. Right? | **Change**: Name starts empty; Save As New from someone else's datapack starts My Bodea. | "Keep it empty. The one caveat might be that if the user saves a new pack from an existing pack, we start with a name that says "My <Pack>"" | 2026-11-12 |
| J3-3 | "Undo Last Save?", then Commerce goes back through the same run window. Right? | **Pass** | "Yes" | 2026-11-12 |
| J3-3 | "Undo Last Save?", then Commerce goes back through the same run window. Right? | **Change**: Undo is solid red, like the nine other windows whose one action destroys; outline only for a losing choice beside a safer one (conventions rule 20). | "What is the most consistent choice? ... yes, let me see it" | 2026-11-12 |
| J3-3 | "Undo Last Save?", then Commerce goes back through the same run window. Right? | **Change**: Undo is the standard blue action; red only for deleting and removing (conventions rule 20). | "I think red seems like an error. Too strong. ... Yes." | 2026-11-12 |

## J4: Restoring

### J4 Walk, Step by Step

| Step | Question | Verdict | Owner's words | Date |
|---|---|---|---|---|
| J4-1 | "Newer save available". Clear? | **Change**: Hover reads "Newer save available". | "It's too wordy, too noisy. ... Should it be save or version? ... Why not update available? ... Yes" | 2026-11-12 |
| J4-2 | The check, then "My Luma Is Up to Date", closing itself. Right? | **Pass** | "Yes." | 2026-11-12 |
| J4-3 | "Restore My Luma?" / "Commerce goes back to My Luma as you last saved it. Anything you changed since is lost.", Cancel / Restore. Right? | **Change**: Save Changes First dropped: Cancel / Restore, small, as Undo's question. | "Let's say we click restore, then save changes first. Then cancel. Does the user expect the entire experience to cancel, or does the user expect to be able to go back to the previous flow? ... Yes." | 2026-11-12 |
| J4-3 | "Restore My Luma?" / "Commerce goes back to My Luma as you last saved it. Anything you changed since is lost.", Cancel / Restore. Right? | **Change**: Restore asks only with unsaved edits; a newer save alone runs after the check without asking. | "What if I want to restore back to a blank state, though? ... What if I want to get back to the beginning state of a demo with a data pack installed? ... Yes" | 2026-11-12 |
| J4-4 | Run window, then the result. Right? | **Pass**: Result title "My Luma Restored" approved. | "Right" | 2026-11-12 |

## J5: Uninstalling and Long Jobs

### J5 Walk, Step by Step

| Step | Question | Verdict | Owner's words | Date |
|---|---|---|---|---|
| J5-1 | "Uninstall My Luma?" with what goes; with unsaved changes, "Save Your Changes First?" next, three buttons on one line. Right? | **Pass** | "J5 is good." | 2026-11-12 |
| J5-2 | Drawn as steps, like Install. Right? | **Pass** | "J5 is good." | 2026-11-12 |
| J5-3 | Closes on its own, in the result's own words. Right? | **Pass** | "J5 is good." | 2026-11-12 |
| J5-4 | A notification that stays, with one button. Right? | **Pass** | "J5 is good." | 2026-11-12 |

## J6: A Failed Install

### J6 Walk, Step by Step

| Step | Question | Verdict | Owner's words | Date |
|---|---|---|---|---|
| J6-1 | Error dot and "Install failed", no border change. Right? | **Pass** | "6-1: Right" | 2026-11-12 |
| J6-3 | Fix with AI. Right? | **Pass** | "Fixed with AI is probably correct, although for a problem like commerce didn't answer in time, there's probably not a lot AI is going to be able to do. But I still think it's right to offer it, just in case." | 2026-11-12 |
| J6-4 | "My Luma" with the error dot, "Install failed" on hover. Right? | **Change**: Dashboard line is the bare name; the error dot's hover says Install failed. | "I don't think we should offer a reason in parenthesis next to the Datapack name. The tool tip is a nice touch." | 2026-11-12 |
| J6-2 | Why it failed, and Retry. Right? | **Pass**: Provisional: kept for now; owner may revisit once built. | "We can keep it for now, but if I don't like it, we'll have to change it." | 2026-11-12 |

## J7: Resetting or Deleting a Project

### J7 Walk, Step by Step

| Step | Question | Verdict | Owner's words | Date |
|---|---|---|---|---|
| J7-2 | The approved batch window over three projects, then Datapack Changes. Right? | **Change**: J7 rebuilt on the product's ProjectsBatchModal, unchanged; the Commerce radio is dropped from the plan. | "I don't understand what these modals are. We already have a modal experience we've approved for mass action, deletes, and resets. ... Yes" | 2026-11-12 |
| J7-1 | Should one project's Reset open the batch window with one row, as shown? | **Change**: One project: the batch window titled by name, Reset Kukla Luma? / Delete Kukla Luma?, in place of Reset 1 Project?. Product change (ProjectsBatchModal titleOf); the prototype still shows the product's title. | "Yes" | 2026-11-12 |
| J7-2 | "Reset 3 Projects?", then "Save Your Changes First?" as for Replace and Uninstall. Right? | **Change**: Datapack Changes step replaced by the J2/J5 save question; to review again once built. | "I see continue here. How do we feel about this? Is it a confusing experience? Can it be simplified or made more clear? ... Yes, but let's review it again once you've built it in." | 2026-11-12 |
| J7-2 | "Reset 3 Projects?", then "Save Your Changes First?" as for Replace and Uninstall. Right? | **Change**: One window; a new datapack's name is a filled-in field (My Bodea, My Bodea 2 when taken), editable; a taken name blocks Save and Reset with J3's line. | "How do we handle multiple saves to either existing data packs or net new data packs? Do we go one by one through multiple modals, or do we try to combine everything in one modal? ... What if the person wants to control the name of the new data packs? ... Let's see it" | 2026-11-12 |
| J7-2 | "Reset 3 Projects?", then "Save Your Changes First?" as for Replace and Uninstall. Right? | **Change**: Every row a Save Changes To field under column headings; own pack starts with its own name. | "Better, but still confusing. What if I wanted to edit the Luma name? ... Let me see it." | 2026-11-12 |
| J7-2 | "Reset 3 Projects?", then "Save Your Changes First?" as for Replace and Uninstall. Right? | **Change**: Column heading: Save As. | "I don't like the save changes to heading name. That doesn't make a lot of sense. ... Yes" | 2026-11-12 |
| J7-2 | "Reset 3 Projects?", then "Save Your Changes First?" as for Replace and Uninstall. Right? | **Pass**: Headings drawn as the batch table's (12px grey, one rule under). | "As long as the design is consistent with the way we handle other column headers and such, this should be fine." | 2026-11-12 |
| J7-3 | The approved delete window, with one row. Right? | **Pass** | "right" | 2026-11-12 |

## J8: The Datapacks Screen

### J8 Walk, Step by Step

| Step | Question | Verdict | Owner's words | Date |
|---|---|---|---|---|
| J8-1 | Create Datapack, Install from File (or Add from File in the library), Clear. Right? | **Change**: Model: any number of datapacks per project; Switch only when a new one writes the same records at the same level (store, website, store view); uninstall removes only what that datapack wrote; a datapack built on another needs it installed first. | "Nope. We need to support multiple data packs. ... What if I just want a data pack that does nothing but add translated product records for a given store view? ... Yes, I think that's correct." | 2026-11-12 |
| J8-1 | Create Datapack, Install from File (or Add from File in the library), Clear. Right? | **Change**: beta.153: one datapack per project; installing another reads Switch (flyout Switch to Bodea, question Switch to Bodea?, Switch Without Saving / Save and Switch, run Switching to Bodea). Several datapacks filed as DI-15 for the next release. | "I don't know if I like the word replace. We're installing a data pack. Replace has the feeling of overcomplication. ... Install makes it sound like more than one data packet can be installed at once. ... Yes" | 2026-11-12 |
| J8-1 | Create Datapack, Install from File (or Add from File in the library), Clear. Right? | **Pass** | "Yes" | 2026-11-12 |
| J8-2 | One-line tag, "Mine", one date format. Right? | **Pass** | "Right" | 2026-11-12 |
| J8-3 | Save as File, Share; Uninstall and Delete in their own section, bare verbs. Right? | **Change**: Menu items are bare verbs: Share, Stop Sharing, Delete; titles keep the name. | "Should we go with share and delete instead of share data pack and delete data pack so that it's consistent everywhere? ... Yes." | 2026-11-12 |
| J8-3 | Save as File, Share; Uninstall and Delete in their own section, bare verbs. Right? | **Change**: Header button reads Create; its window keeps the title Create Datapack. | "I don't know. I think the fact that the title says create data pack means that we can make the button just say create." | 2026-11-12 |
| J8-3 | Save as File, Share; Uninstall and Delete in their own section, bare verbs. Right? | **Pass**: Header Create kept (pairs with Save As New / Save As New Datapack). | "But maybe that's not the right choice. ... Keep it" | 2026-11-12 |

## Build-Phase Items

What the reviews leave for the build phase, by step. `log-verdict.mjs --build` adds to it; the prototype's decisions panel shows it beside each step.

- **J1-3b**: One order rule in both repos (`wipeOrders.ts` and the ERP integration's `reset-rule.js`): cancel, else invoice what is not invoiced and refund it all offline, so every demo order ends Canceled or Closed; payment review stays open
- **J1-3b**: Clear closes every order in Commerce and stops handing orders to the ERP integration (`wipeErp.ts`); the ERP is brought in line afterwards, as its own step
- **J1-3b**: ERP integration skips events for orders whose Commerce history carries the reset note; Clear writes that note before its first change to each order (`docs/order-close-ownership.md` in the integration repo)
- **J1-3b**: A shared table of order states and expected results, run by the tests in both repos
- **J1-3b**: Live test on the test store, with the owner's go: shipped-not-invoiced and partly invoiced orders end Closed; nothing reaches an ERP; a second Clear changes nothing
- **J1-3b**: Kept records carry no reason (the one left is "another demo uses it"); already-closed orders and protected settings are not listed; the partly-chosen-website rules in `wipeCustomers.ts` and `wipeProducts.ts` (Owner Unknown) go, since Clear clears whole websites
- **J1-3b**: A failed read is a problem with Retry, never a kept reason (`wipePlan.ts` files some as left today)
- **J1-3b**: The check returns full record lists per type for the spot check (it returns three names today)
- **J1-3b**: `ViewSwitcher`'s `marker` style (`.view-switcher-marker`) moves from the prototype into `data-installer.css`, with a visual baseline
- **J1-3a**: `TreeList` moves to `src/core/ui/components/`; Save From Store's categories use it
- **J1-3c**: `.datapack-picks-rail` gets `overflow-y: auto`, with a visual baseline
- **J1-3d**: The progress window: a problem line waits for the end and takes the room the working row's progress line held; a problem line fits one line
- **J1-3d**: `.modal-title` gets `vertical-align: top` (a status icon added 3px to the title row), with a visual baseline
- **J1-3d**: `WorkRow`'s warning note is orange, as the dialog rules say (grey today)
- **J1-3d**: Payment review and an unrestorable list setting are reported by the run's result with Open Commerce Admin (the Admin home: the Unified Shell has no deep links)
- **J1-5**: Catalogs' customer groups count under Customer Groups; no "with their …" phrases; Orders read "N closed"
- **J2-1**: Install has no data-type choice; drop the per-type checkboxes and blockedBy reason lines from the install and replace windows
- **J2-1**: The save question lists counts by type, not example names (replaces Phase 5's 'name a few, and N more' for this window)
- **J2-3**: The product's records view: Back only, on the right; the summary is the one place an action is taken.
- **J3-1**: Save run: two steps, Export from Commerce (rows say Exporting, not Reading; runRows.ts SAVE_RUN) then the write into My Datapacks as its own row, so a failed write shows on its own row.
- **J3-2**: Create Datapack: two windows, picker first then the name with Create.
- **J3-1**: Save As New name field: empty, except from someone else's datapack, where it starts My <Pack>.
- **J3-3**: Undo Last Save? uses the standard blue Undo; red stays only on deleting and removing actions.
- **J4-1**: The amber dot's hover: "Newer save available".
- **J4-3**: Restore My Luma? has Cancel and Restore only; no Save Changes First.
- **J4-3**: Restore My Luma asks only when the SC has unsaved edits; a newer save alone runs straight after the check.
- **J6-4**: Dashboard Datapacks line on a failed install: bare name, error dot, hover "Install failed"; no "(install failed)".
- **J7-2**: Reset and delete use the approved ProjectsBatchModal unchanged; no Commerce radio.
- **J7-1**: Reset or delete of one project: the batch window with one row, titled "Reset Kukla Luma?" / "Delete Kukla Luma?" (ProjectsBatchModal titleOf and runLabel), replacing today's VS Code dialogs.
- **J7-2**: Batch reset/delete: no Datapack Changes step; datapacks with changes get the J2/J5 "Save Your Changes First?", one row per datapack, Reset Without Saving / Cancel / Save and Reset.
- **J7-2**: Batch save question: one window; new-datapack rows carry a filled-in name field (My <Pack>, then 2, 3 when taken).
- **J7-2**: Batch save question: columns Datapack / Save As, a filled-in name field on every row; own pack's name saves into it, another name saves a new datapack.
- **J2-3**: No Always Save Changes box in Replace, Uninstall, Reset or Delete save questions; changesOnRemoval is a setting only, description rewritten.
- **J2-3**: One-time tip after the first save question answered (showOneTimeTip), filtered to changesOnRemoval.
- **J8-1**: Several datapacks per project: overlap check at install (Switch only on overlap), dependency check at uninstall, install records list records with their level.
- **J8-1**: Replace becomes Switch everywhere: flyout button Switch to <pack> when another is installed, Switch to <pack>?, Switch, Switch Without Saving / Save and Switch, Switching to <pack>; verb table row renamed.
- **J8-3**: Datapack More menu: Share / Stop Sharing / Delete (bare verbs); titles Share My Luma?, Delete My Luma?.
- **J8-3**: Header save button with no datapack reads Create (window title Create Datapack).
