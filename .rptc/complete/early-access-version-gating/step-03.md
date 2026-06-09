# Step 3: `package.json` Channel Enum + Description

**Purpose:** Expose `early-access` as a selectable value for `demoBuilder.updateChannel` with an honest description.

**Prerequisites:**
- [x] Steps 1-2 green (type widened so the new enum value is meaningful)

---

## Tests to Write First

There is no harness for `package.json` contribution points; add a lightweight schema guard so the enum can't silently regress.

### New test: `tests/features/updates/services/updateChannelConfig.test.ts`
- [ ] Read `package.json` → `contributes.configuration` → find `demoBuilder.updateChannel`; assert its `enum` deep-equals `['stable','beta','early-access']`.
- [ ] Assert `default === 'stable'`.
- [ ] Assert `description` mentions "early access"/collaborators (case-insensitive contains).

---

## Files to Create/Modify
- [ ] `package.json` (`:135-143`)
- [ ] `tests/features/updates/services/updateChannelConfig.test.ts` (new)

---

## Implementation Details

Edit `package.json:135-143`:
```json
"demoBuilder.updateChannel": {
  "type": "string",
  "enum": [
    "stable",
    "beta",
    "early-access"
  ],
  "enumDescriptions": [
    "Production releases only",
    "Beta prereleases (testing)",
    "Alpha preview builds — honored only for repository collaborators; others fall back to beta"
  ],
  "default": "stable",
  "description": "Update channel: stable (production), beta (testing), or early-access (collaborator-only alpha preview; falls back to beta if not a collaborator)"
}
```

---

## Acceptance Criteria
- [ ] Enum includes `early-access`; default stays `stable`
- [ ] Description states the collaborator gate + beta fallback
- [ ] Schema guard test green

**Estimated Time:** 30-45 minutes
