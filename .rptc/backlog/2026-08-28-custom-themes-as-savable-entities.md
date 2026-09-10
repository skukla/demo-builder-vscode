---
id: EDS-10
kind: feature
area: eds
needs: []
value: med
status: backlog
---

# Custom themes as savable entities

<!-- Do NOT template this body. Items vary because the work varies; the
     provenance, the measurements and the caveats are what make an item useful
     months later. The frontmatter carries the structure so the prose need not. -->

Filed 2026-08-28, from the owner's ruling on the theme-vs-reset question the
2026-08-28 overnight loop queued.

## The ruling that spawned this

**Themes do NOT survive a project reset** (owner, 2026-08-28). Reset's
contract is "back to template"; that stays. The loop's interim fix — the
theming skill states the lifecycle plainly before an agent invests a theming
pass — is the shipped behavior for now.

The owner's follow-on: *"the idea of a theme and how to save a custom one
would be a great backlog item as a feature for later."* That is this item.

## The shape (not designed here — sized as a question)

A storefront's whole visual identity is ~114 custom-property tokens in
`styles/styles.css` (measured on bodea 2026-08-28: 36 type, 33 color, 15
grid, 14 shape, 13 spacing), plus optionally the brand files `brandAssets`
vendors. "Save a theme" plausibly means: capture that token set as a named
artifact a producer can keep, re-apply after a reset, and carry between
projects — the same relationship a datapack has to instance data.

Design questions the eventual work must answer (the loop's design gate):

- **What entity is a theme?** A new artifact kind, or an extension of
  `brandAssets` (which already vendors brand files from a source repo)?
- **Where does a saved theme live?** In the project (dies with reset — the
  thing being solved), in extension storage, or as files the producer owns?
- **Apply = what exactly?** Rewriting token VALUES in `styles/styles.css` is
  bounded and mechanical; brand FILES and block CSS literals are not.
- **Does the wizard/dashboard own it, or the agent surface, or both?**

## Why later

Depends on nothing shipped tonight, but the design-axis work (AI-1a steps
3–4, the design skill with a stopping rule) will teach us what agents
actually do when theming — better evidence for what "save" must capture.
