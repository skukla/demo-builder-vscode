# Overnight loop report — 2026-10-03

## In short

Every item on the agreed list is built, tested and committed, plus the card-payment half of the
payment leg, which was added during the night. Nothing was pushed to any main branch, deployed,
or run against a live store. All of it sits on a branch named `loop/2026-10-03-overnight` in each
of the three repositories, backed up to GitHub. Each commit was made only after that
repository's full test suite passed (Demo Builder: the full quality gate, 30,998 tests at the
end; the ERP: 591; the integration: 1,294).

Two things are needed before any of it is live: merging the three branches, and one redeploy
and reinstall of the integration (Commerce has to start sending each order line's discount).

## What was built

### The ERP and the integration (the demo itself)

| Item | What changed | Live check owed |
|---|---|---|
| AB-63 | Posting a shipment in the ERP now takes the shipped quantity out of that warehouse, and is refused when the warehouse holds less. It does not send a stock change to Commerce, because Commerce deducts the same units itself when it records the shipment; sending both could deduct twice. | Ship on Justrite and watch the ERP's on hand fall by the same amount as Commerce's. |
| AB-65 | The stray dot in Settings › Number Series was the first dot of a clipped "…": the column was 20 pixels too narrow for a ten-digit number. Widened; a test now fails if any number is clipped. The same measure flags two other buttons (Customers › Edit credit limit, Settings › Edit sales organization), not looked at. | None. |
| AB-62 | A second quick edit to a product in the ERP is no longer lost. The integration remembers each product write it makes into Commerce for two minutes and ignores the save event Commerce sends back for it; a real edit in Commerce Admin has different values and still gets through. A test replays the exact timeline seen on 2026-10-02. | Rename a product in the ERP twice within 20 seconds on Justrite. |
| AB-16l | Each order line now carries the discount the web shop gave. The ERP stores it, shows a Discount column and total when there is one, and carries it through invoices, returns (shared out to the cent) and credit memos. Before, the ERP's tax figure came out too low by the discount. | Needs the redeploy and reinstall, then an order with a cart price rule. |
| AB-26y step 5 | The ERP no longer has a "delete product" route. When a product is deleted in Commerce, the integration records it in its Activity list ("Product deleted · In Commerce") and leaves the ERP's copy until the next reset, as the item asked. | Delete a test product in Commerce Admin and look at the integration's Activity. |
| AB-26s card half | A card-paid order now reaches each ERP with a payment reference: method, the gateway's transaction id, card brand, last four digits and that ERP's share of the amount. Never a card number (only those five fields are let through, and tests prove a full number is dropped). When the ERP posts its invoice it also posts the payment, so the invoice reads Paid with nothing open. No payment event goes back, so company credit is untouched; Commerce already holds the money. Shares on a split order add up to the captured amount to the cent. | Needs a card payment method on Justrite (setup step 9), set to Authorize and Capture. First check: does Commerce fill the transaction id and card brand on this store? |

### Demo Builder

| Item | What changed | Live check owed |
|---|---|---|
| AB-26y | After every fill (add, Reset ERPs, Load demo data), Demo Builder copies each ERP's own sales organizations into the integration's mapping settings, but only where nothing is set. A value someone set on the Admin page is kept, and the run reports what it filled and what it kept. | One fill on Justrite, then look at the integration's Admin page. Also: on a one-ERP project, the integration may refuse the write because no ERP list is stored. Unproven either way. |
| AB-58 | Redeploying an app now also cleans up timers and rules that the new version no longer declares, through the same confirmed clean-up that already removed old actions. Nothing is deleted if any listing fails. | One redeploy in a workspace with a leftover timer. The rule list's shape was read from the command-line tool's source, not a live answer. |
| AB-11, AB-12 | The integration's detail panel explains Commerce's optional "App Management" listing. Remove now warns that the listing stays until it is unassociated in Commerce Admin. Agents get the same words. Clearing the listing automatically is not built: no public API was found, and it would be a destructive write. | Read the new wording on a real card. |
| AB-26z | When a fill succeeds but prices could not be published, the progress window now ends on that warning and waits to be closed, instead of closing on a green tick. | Seen once on a real fill whose prices fail. |
| AB-47 | A test now pins that a reset names every ERP. The code was already right. | None. |
| PL-56c | Exporting a project never includes credentials, and the option that did is deleted everywhere (button, tool, file). The file is now named `<name>.project.demo-builder.json`. | You'll want to know: anyone who used Export as a backup of their credentials will notice. The changelog says so. |
| PL-36, PL-40 | Tests for a version sort and for two wizard warnings (both can fire, from a saved file). | None. |
| PL-37 and more | Eight message handlers that nothing ever sends to are deleted, with their types and tests. Each was checked against every possible sender, with a known-live handler as a control. | None. |
| PL-44 | A test that wrote a temporary file inside the test folder, where other tests could see it, now writes it to a folder they ignore. | None. |
| PL-56b | Two dead pieces of the project-file format are deleted. One more stays until import uses the new reader. | None. |
| PL-35 | A test helper nothing called is deleted. The item's suggested fix was wrong: the helper was never reached. | None. |
| PL-24 | When a component update renames a setting, the project's value moves to the new name. The list of renames is empty for now. | None. |
| PL-58 | The check that protects your own edits in generated AI files now reads every writer, not three named ones. Four writers that bypass it on purpose carry written reasons. | None. |
| PL-39 | A new backlog command, `leftovers`, lists finished items whose text still describes open work. It found 44; the record check at the end of the night showed 18 of them. | None. |
| AI-1r | The "34% of features agents can't reach" figure was mostly miscounting. After reading every flagged handler, six are real gaps: starting a project from an exported file, resetting a headless project, checking the shared credential service, DA.live sign-out, switching GitHub account, and reading the ERP-ownership options. | None. |

## Corrections made during the night

- PL-35's item proposed fixing a test helper; it turned out nothing called it, so it was deleted
  instead.
- PL-37's item said nothing called the state version; something did, but nothing read the answer,
  so the whole mechanism was deleted.
- The walkthrough said the ERP's discount ceiling is enforced on orders. It isn't: it only caps
  the ERP's own prices. The sentence is corrected.

## Environment facts

- The session restarted once during the night. Two builds stopped mid-run and were resumed from
  their saved work; nothing half-done was committed.
- The Data Installer repository refused connections from this machine: its GitHub organization
  only accepts approved network addresses (almost certainly the VPN). The fix is ready on a local
  branch; see below.

## Your decisions (the walkthrough queue)

1. **Merge.** Three branches named `loop/2026-10-03-overnight`: Demo Builder (into
   `feature/erp-integration`), the ERP and the integration (into their `main`). Merging the ERP
   and integration to `main` is what a fresh add of the ERP picks up.
2. **Redeploy and reinstall the integration** once merged, so Commerce sends each line's
   discount. The card payment needs nothing more.
3. **The Data Installer PR.** Connect to the VPN; then I confirm your access, update the branch
   `fix/export-context-carries-mongo-params` (commit `3ced647`, the two-line fix and a 73-line
   test) to their latest main, re-run their tests, and show you the PR text before opening it.
4. **Recommendations to confirm** (each is how it was built):
   - Card refunds on a return stay with Commerce's own credit memo; nothing in the ERP moves card
     money.
   - The demo uses "Authorize and Capture" for cards. With authorize-only, an order goes as unpaid.
   - Cancelling a card-paid order from the ERP needs a refund, not a cancel. Build it later.
   - Catalog price rules arrive at the ERP as a lower price, cart rules as a line discount; the
     ERP shows no promotion names.
   - Add the order's tax to the Order Saved event in the same redeploy, so a split order's parts
     carry tax. Not done tonight, because it changes part totals.
   - Product deletes get a "Products" filter in the Activity list. Not added, because it changes
     the visible filter bar.
5. **Which of the six agent gaps to build.** Recommended: starting a project from an exported
   file (with PL-56d), and resetting a headless project.
6. **Still open from the reconcile:** drop AB-15, PL-3 and PL-23? Build or close the Prompt
   Workbench? Close AB-16d? Send PL-61's licensing questions? Mod Agent access? Is "on main and
   deployed" the finish line for ERP and integration work?

## Optional tidying

The record check found four line references in items pointing at code that has since moved
(AB-26 company-event item, PL-56b, two in the screen-listing plan), and 18 finished items whose
text still mentions remaining work. None blocks anything.
