# Prompt

ultrathink

---

## Test Execution Performance Requirements

**CRITICAL: During TDD implementation, ALWAYS use optimized test commands:**

```bash
# ⭐ REQUIRED for TDD: Watch mode (5-10s feedback)
npm run test:watch -- tests/features/your-feature

# ❌ NEVER during active TDD: Full test suite
npm test  # 10+ minute wait - violates TDD principles
```

**Test Command Priority:**

1. **TDD Implementation**: `npm run test:watch` (5-10s iterations)
2. **Pre-Commit**: `npm run test:changed` (30s-2min)
3. **Quality Gate**: `npm run test:fast` (3-5min)
4. **Final CI**: `npm test` (2-3min cached, 10-15min first run)

**See `.rptc/sop/testing-guide.md` and `TESTING.md` for complete documentation.**
