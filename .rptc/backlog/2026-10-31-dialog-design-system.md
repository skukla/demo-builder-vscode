---
id: PL-85
kind: feature
area: platform
needs: []
value: high
status: active
---

# Dialogs: one design for content, size and motion

<!-- Do NOT template this body. Items vary because the work varies; the
     provenance, the measurements and the caveats are what make an item useful
     months later. The frontmatter carries the structure so the prose need not. -->

Filed 2026-10-31 by the owner, during the beta.153 screen checks: "a one-size-fits-all
approach is just not working out", and the content "still looks very AI inspired". The
rules were agreed from mockups the same day and live in
`docs/development/sop/dialog-design.md`.

**What was wrong.** Dialog sizes were fixed for each dialog's largest possible content
(the Import dialog was 980px for a one-type pack), and there was no written rule for what
goes inside a dialog, so each screen was composed on the spot and drifted: status boxes,
row lists, muted footnotes, labels in capitals beside labels in sentence case, sentences
repeating the title. The red "negative" button style was mapped to the plain outline, so
no dangerous action in any house dialog showed red.

**The change.** Five layouts (form, confirm, progress, result, guide); status in the
title; four kinds of text; one spacing scale; one rule under the title; a noise test every
line must pass. Dialogs pinned near the top; height fits and eases; width in four steps,
eased with the content hidden.

**Order.** The rules and the shared pieces first, then the Import dialog and the progress
window, shown to the owner on screen before any other dialog converts. Then each remaining
dialog (about 26) as the screen checks reach it, the datapack dialogs first.

**Still to build:** a long-content fixture for each layout in the visual harness
(`webview-visual-baseline`), measured at 420px, so wrapping is proven on the real bundles.

## Shipped so far

- 2026-10-31  feat(ui): dialogs follow one design for content, size and motion (`9698ac5fa`)
- 2026-10-31  fix(ui): pin dialogs, red that reads red, and the 24px gap, as measured (`e651eb2bf`)
- 2026-11-01  docs(dialogs): a re-check inside an open dialog hides nothing (`962c03ef3`)
- 2026-11-01  fix(ui): a dialog's spinner is centred between the rule and the buttons (`63c8283b2`)
- 2026-11-01  feat(ui): a dialog that is waiting shows nothing else (`c2efd97cb`)
- 2026-11-01  fix(data-installer): the Import dialog's store wait uses a medium spinner (`dabd62734`)
- 2026-11-01  Merge the dialog design work into develop for review (`343e85e43`)
- 2026-11-02  fix(ui): a flyout waits as a dialog does, with a medium spinner and no words (`bdf9cf77f`)
- 2026-11-02  feat(ui): a dialog's change of view is one move (`58ff89c10`)
- 2026-11-02  fix(ui): the running import's spinner sits level in its dialog (`af9d6bf68`)
- 2026-11-02  fix(data-installer): the pack root's note reads as a sentence (`2269591bb`)
- 2026-11-02  feat(ui): one status icon everywhere, the wizard's set (`4cb8207e5`)
- 2026-11-02  feat(ui): a wait keeps the dialog's box, and a small change does not animate (`d7244a4f4`)
- 2026-11-02  fix(data-installer): a removal that kept a root says one step is left (`cd80a5acd`)
- 2026-11-02  fix(ui): a dialog's title stays on screen through a change of view (`50dc162e3`)
- 2026-11-02  feat(ui): a dialog's size no longer animates (`1d89359aa`)
- 2026-11-02  fix(data-installer): the dialog stays on its wait until the job's status answers (`8da911eb1`)
- 2026-11-02  feat(ui): one red, one orange, and warning and error differ in shape (`ceb5336d1`)
- 2026-11-02  fix(ui): the progress window, the long wait and the last dots (`f70dc77b3`)
- 2026-11-02  fix(ui): project creation, Updates and Site access follow the design rules (`5dac0e7de`)
- 2026-11-02  fix(dashboard): its dialogs follow the design rules (`8b09a336b`)
- 2026-11-02  fix(data-installer): its dialogs follow the design rules (`6fe18d55d`)
- 2026-11-02  feat(data-installer): a pack's settings layer, Save my changes first, one colour set (`50365ceae`)
- 2026-11-02  feat(data-installer): Create a datapack is a guided point-and-click flow (`9c7fac877`)
- 2026-11-02  fix(ui): the second round of dialog rules, and Create's empty cards grey up front (`56dc68ff4`)
- 2026-11-02  fix(data-installer): Create's kinds fit without scrolling (`e1554c14d`)
- 2026-11-02  fix(dialogs): problem lines keep their colour and fit one line (`6304d3922`)
- 2026-11-02  feat(data-installer): select a pack's data in one two-pane screen (`278aef169`)
- 2026-11-02  fix(data-installer): an export's several choices are checkboxes, not cards (`b8a3d6e8d`)
- 2026-11-02  fix(data-installer): one wait until both columns are ready, and a Select all checkbox (`ff65bd915`)
- 2026-11-02  fix(data-installer): the two-column pane keeps one layout on every kind (`171f0c2af`)
- 2026-11-02  feat(ui): Title Case for what names a thing, enforced (`bbf147b7c`)
- 2026-11-02  fix(data-installer): Clear demo data never rewrites a list setting (`ce4dd0e3f`)
- 2026-11-02  fix(ui): the API and catalog pickers always show their filter (`e8ccfad04`)
- 2026-11-02  fix(data-installer): Select All sits close to the count above it (`7f34ca2d8`)
- 2026-11-03  refactor(ui): every list with anything in it shows its filter (`20e70be8c`)
- 2026-11-03  feat(data-installer): Clear Demo Data's store list has the filter (`b3fa6b5f7`)
- 2026-11-03  fix(ui): the last Title Case and Select wording, and a label the check missed (`3af36bb50`)
