# Research — two tiers

Research lives in two places, by maturity. Both are tracked.

| Tier | Location | What it is |
|---|---|---|
| **Working** | `.rptc/research/` | The research the RPTC process generates — exploratory, per-topic, in-flight. Tracked so it survives this ephemeral container, but treat it as working notes. |
| **Curated** | `docs/research/` (here) | Promoted, landmark research / roadmaps that other docs and **ADRs cite**. Reference material, not scratch. |

## Promote, don't duplicate

Do research in `.rptc/research/`. When a piece becomes durable, cited reference — an ADR or another doc links it — **promote it here** and update the cross-references. This mirrors the existing `.rptc/backlog/` → `docs/architecture/adr/` pattern (working items → curated decisions).

## Don't bulk-move between tiers

`docs/research/` files are cross-referenced by ADRs (e.g. ADR-003, ADR-004) and the CHANGELOG. Moving them into `.rptc/research/` would break those links. Keep the tiers distinct; move individual pieces only via the promote path above.
