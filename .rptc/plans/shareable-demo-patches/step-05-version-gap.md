# Step 05 — When a colleague's storefront is older than the boilerplate

Owner (2026-09-14): "If our boilerplate (which should be being kept up to date with
mainline) is newer than a storefront a colleague wants to add, what should we do?"

## What is true first

- Our boilerplates ARE Adobe's: `adobe-commerce/boilerplate-b2b-template` and
  `hlxsites/aem-boilerplate-commerce`. "Kept up to date with mainline" is the patches repo's
  daily last-known-good gate: it advances the pin when our patches still verify against
  Adobe's head. So "our version" = Adobe's template at the pin.
- A colleague's storefront is at the version it was generated from, plus whatever they did.
  Jen's is 4.0.1 against 6.0.0.
- The extension's integration contract is written the same way on any version that has the
  three canonical files. What varies with age is the storefront's own behaviour: older
  drop-ins, older blocks, bugs since fixed upstream.

## The recommendation (decision 6, to confirm)

1. **Report, always.** The card and the completion say the version and the gap, and how many
   of our fixes fit. This is the honest minimum and costs nothing.
2. **Fix what fits** (step 03). Our fixes are exactly the boilerplate bugs a newer boilerplate
   would also carry or have fixed; where they fit, the old storefront gets them.
3. **Modernise only where a safe path exists.**
   - A repository that is a FORK of our template: offer "Bring the code up to date with the
     template", using the existing fork sync (GitHub merge-upstream). Requires [[EDS-14]]
     first: today a merge conflict falls back to a reset that overwrites the SC's work; it
     must stop and name the files instead.
   - A repository GENERATED from the template (Jen's): there is no shared git history, so a
     merge is impossible and the only mechanical path is a reset onto the current
     boilerplate, which throws away the colleague's customisations. Not offered.
4. **Never refuse on age.** A floor exists only as a warning: below the oldest boilerplate
   our drop-in and configuration assumptions were verified on, the card says "This storefront
   is older than the versions Demo Builder is tested with; some demo features may not work."
   The floor is a constant with a test, moved deliberately.

## The question left for the owner

Is "report + fix what fits + fork sync only for forks" the policy? The alternative, offering a
reset onto the current boilerplate for generated repositories, is the one thing that
would modernise Jen's storefront, and it is the one thing that destroys her work; I recommend
against it. If a demo must be current, the honest route is for the colleague to regenerate
from the template themselves and re-add.

## Status 2026-10-03 (unattended run): stopped here for the owner

Steps 01–04 and 07 were built on `loop/2026-10-03-night2-b` (not committed); this step was
not started. Two facts for the decision:

- The report half of "report, always" now exists: the storefront report (command, agent tool,
  Diagnostics) shows the storefront's boilerplate version beside Demo Builder's current one
  (the template's `package.json` at the patches repo's last-known-good). No floor constant
  and no "older than tested" warning were added: the floor is this step's.
- The overview's decision 6 says the owner agreed to this recommendation on 2026-09-14, but
  the backlog item still lists the version gap as an open owner decision. Those disagree.

**The question:** is the policy "report always + fix what fits + offer the fork sync ONLY
to forks (after EDS-14), never a reset onto the current boilerplate for a generated
repository, never refuse on age, warn below a floor"? **Recommendation: yes, as written
above.** If yes, the remaining build is the floor constant with its test and the warning
line, plus the fork-sync door once EDS-14 lands.
