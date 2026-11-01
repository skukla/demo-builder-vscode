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
