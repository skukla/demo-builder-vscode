# Dynamic Magento Store ID Lookup

## Status Tracking

- [x] Planned
- [x] In Progress (TDD Phase)
- [x] Efficiency Review
- [x] Security Review
- [x] Complete

**Created:** 2026-01-10
**Completed:** 2026-01-10

---

## Executive Summary

**Feature:** Replace hardcoded store IDs (1,1,1,2) with dynamic GraphQL lookup using storeConfig query

**Purpose:** Demo environments may have different store configurations; dynamic lookup ensures config.json accurately reflects the actual Commerce instance setup

**Approach:** Add private storeConfig fetcher method to EnvConfigPhase class, integrate into generateConfigJson with graceful fallback to current hardcoded defaults on failure

**Estimated Complexity:** Small (2 implementation steps, single file modification)

**Key Risks:**
- Network unreliability (mitigated by 10s timeout + fallback to defaults)
- GraphQL schema changes (mitigated by simple query + fallback on parse errors)

---

## Scope (Based on Simplicity Gate)

### Code Changes

| File | Action | Description |
|------|--------|-------------|
| `src/features/eds/services/edsSetupPhases.ts` | Modify | Add `fetchStoreConfig` private method, update `generateConfigJson` to use dynamic lookup |

### NOT Included

| Item | Reason |
|------|--------|
| New GraphQL service class | Single use case - inlined per Rule of Three |
| Store group ID lookup | Not available in storeConfig query (only id, website_id, root_category_id) |
| Retry logic | Simple timeout fallback sufficient for demo setup context |
| Caching layer | One-time fetch during project creation, no cache needed |

---

## Test Strategy

### Testing Approach

- **Framework:** Jest with ts-jest
- **Coverage Goal:** 80%+ for new code
- **Test Distribution:** Unit tests for fetcher, integration tests for generateConfigJson flow

### Test Scenarios (Summary)

Detailed test scenarios are in each step file (`step-01.md`, `step-02.md`).

**High-level coverage:**
- Successful storeConfig fetch and parsing
- Network timeout handling (falls back to defaults)
- Invalid GraphQL response handling
- Missing fields in response
- generateConfigJson uses dynamic values when available
- generateConfigJson uses fallback values on fetch failure

---

## Acceptance Criteria

- [x] Dynamic lookup when Commerce GraphQL endpoint is reachable
- [x] Graceful fallback to hardcoded defaults (1,1,1,2) on any failure
- [x] No user-visible errors on network issues (silent fallback)
- [x] config.json populated correctly in both success and fallback scenarios
- [x] Existing tests continue to pass
- [x] 10-second timeout consistent with existing edsHandlers.ts pattern

---

## Risk Assessment

### Risk 1: Network Unreliability

- **Category:** Technical
- **Likelihood:** Medium (Commerce endpoints may be slow or unreachable)
- **Impact:** Low (graceful fallback preserves current behavior)
- **Mitigation:** 10-second timeout via `AbortSignal.timeout(10000)`, fallback to defaults
- **Contingency:** Current hardcoded values work for most demo setups

### Risk 2: GraphQL Schema Changes

- **Category:** External Dependency
- **Likelihood:** Low (storeConfig is stable public API)
- **Impact:** Medium (would fail to get dynamic values)
- **Mitigation:** Simple query structure, fallback on any parse error
- **Contingency:** Defaults continue to work; can update query if schema changes

---

## File Reference Map

### Existing Files to Modify

- `src/features/eds/services/edsSetupPhases.ts` - Add `fetchStoreConfig` method, update `generateConfigJson`

### New Files to Create

- None (inlined per simplicity gate - single use case)

### Test Files

- `tests/features/eds/services/edsSetupPhases-storeConfig.test.ts` - Unit tests for new functionality

---

## Implementation Constraints

- **File Size:** <500 lines (current file is within limits, adding ~30-40 lines)
- **Complexity:** <50 lines/function, single responsibility
- **Dependencies:** Reuse existing `fetch` pattern from edsHandlers.ts:96
- **Platforms:** Node.js 18+ (fetch is built-in)
- **Performance:** 10-second timeout, non-blocking fallback

---

## Configuration

**Efficiency Review:** enabled
**Security Review:** enabled

---

## Next Actions

**Plan complete!** To commit these changes:

```bash
/rptc:commit
```

---

_Plan created by Overview Generator Sub-Agent_
_Status: ✅ Complete (2026-01-10)_

## Completion Summary

- **Tests Written:** 35 tests (28 functional + 7 security)
- **Security Hardening:** SSRF prevention, centralized timeout constants
- **No Documentation Changes:** Internal implementation details only
