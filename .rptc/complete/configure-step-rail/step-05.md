# Step 05 — Dev Host verification

Depends on 03. **Cannot be done by tests.**

## Why this step exists

The CSS trap fails silently. `.step-nav` sets
`padding: … var(--wizard-content-pad)`, and that variable is declared only on
`.wizard-main-content` (`custom-spectrum.css:823-825`). Outside the wizard the whole
declaration is dropped — the rail renders, no test fails, and the padding is simply
wrong. Jest cannot see it.

The fix is to promote the variable to `:root` or declare it on the Configure container.
Either way, **look at it**.

## Checks

Run `npm run watch:all` from the worktree, then Cmd+R in the Extension Dev Host.

1. **Confirm which build you are looking at** before trusting anything on screen —
   `grep -c '<a-string-only-on-this-branch>' dist/webview/configure-bundle.js`. A `0`
   means another tree or an older build won. This burned a full session on 2026-07-30.
2. Rail padding aligns with the content band below it (the `--wizard-content-pad` trap).
3. Every section appears as a tab; each is clickable; the body swaps.
4. Rail against the wizard's Commerce rail side by side — same height, type, active
   underline.
5. **Below 1180px**: the old sidebar was hidden entirely at that width, so Configure had
   no navigation at all. Confirm the rail survives and scrolls horizontally.
6. Edit a field in section A, switch to B, Save → A's change persists. (Tested in step 03;
   confirm for real, because this is the invariant a one-section layout most easily breaks.)
7. Wizard Commerce and Storefront rails still look and behave exactly as before — the
   proof step 01's move was inert.

## Done when

- All seven checked in a real Dev Host, with the build confirmed first
- Any CSS fix applied and re-verified
