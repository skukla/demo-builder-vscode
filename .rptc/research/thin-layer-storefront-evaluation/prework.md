# Thin-Layer Storefront Evaluation — Prework Summary

**Date**: 2026-06-10
**Purpose**: Prework before Claude Desktop runs the full audit defined in `.rptc/backlog/2026-06-09-evaluate-thin-layer-storefront-model.md`.

## Repos cloned

Location: `~/thin-layer-audit/`

| Repo | Role |
|---|---|
| `aem-boilerplate-commerce` (`hlxsites/aem-boilerplate-commerce`) | Canonical upstream — diff base for all forks |
| `citisignal-eds-boilerplate` (`skukla/citisignal-eds-boilerplate`) | Fork — in audit scope |
| `accs-citisignal` (`demo-system-stores/accs-citisignal`) | Fork — in audit scope |
| `buildright-eds` (`skukla/buildright-eds`) | **OUT OF AUDIT SCOPE** — see scope note below |

## Audit scope

**Two forks only**: `citisignal-eds-boilerplate` and `accs-citisignal`. `buildright-eds` is explicitly excluded from this audit per user direction (2026-06-10).

(The prework cloned `buildright-eds` and discovered it has no shared git history with canonical — it's a standalone codebase, not a fork in the technical sense. Whether to retain, rebuild, or replace it is a separate decision outside this audit's scope.)

## Divergence facts (the in-scope forks)

Both forks have `canonical` remote configured pointing at `hlxsites/aem-boilerplate-commerce` and have been fetched. Merge-base computed against `canonical/main`.

### citisignal-eds-boilerplate

- **Merge-base**: `39b4b63339a914ba187ea44552e3d4e0e6cc7c28`
- **Ahead of canonical**: **146 commits** (matches backlog's ~145 estimate)
- **Behind canonical**: 185 commits
- **Note on lineage**: `upstream` remote was already configured pointing at `demo-system-stores/accs-citisignal` (not canonical directly). This fork was originally derived from `accs-citisignal`, so the audit needs to be careful about NOT double-counting commits that exist in both forks. Recommendation: classify each fork's commits against canonical independently, then in the cross-cutting analysis note which commits are shared between the two forks.

### accs-citisignal

- **Merge-base**: `d4b491461f665952755ced5eacb93dfbfa0c8bbb`
- **Ahead of canonical**: **119 commits** (matches backlog)
- **Behind canonical**: 212 commits

## Methodology — straight from the backlog

`git log <merge-base>..HEAD --name-status` for each fork. Classify per the backlog's categories. Spot-check 10-15 commits per repo with full `git show`. Watch for the lineage double-count between the two forks.

**Total commits to classify**: 146 + 119 = **265 commits across two forks**.

## How Desktop should pick up

The audit prompt (provided to user in the chat) references this file. Desktop should:

1. Read this prework file first to skip re-discovering the lineage facts above
2. Read the backlog file at `.rptc/backlog/2026-06-09-evaluate-thin-layer-storefront-model.md` for the canonical method
3. Use the merge-bases recorded above (don't recompute — they're stable)
4. Skip buildright-eds entirely
5. Produce findings at `.rptc/research/thin-layer-storefront-evaluation/findings.md`
