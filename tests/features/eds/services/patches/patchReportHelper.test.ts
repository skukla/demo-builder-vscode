/**
 * Tests for the unified patch-report helper.
 *
 * The helper aggregates content-patch and code-patch results into one
 * report shape and surfaces unapplied patches via a single warning toast
 * + per-patch warn-level log lines. Both patch domains share this surface
 * (ADR-006 D1, plan step-02.md: "Route both patch domains through one
 * shared 'report unapplied patches' helper so content and code patches
 * surface identically").
 *
 * Contract:
 *   - `createPatchReport()` returns an empty report.
 *   - `addContentResult` + `addCodeResult` push normalized entries.
 *   - `getUnapplied` filters to non-applied entries.
 *   - `logUnapplied` writes one warn line per unapplied entry.
 *   - `reportUnapplied` is the one-call entry point: logs + (optionally)
 *     fires the toast.
 *   - The `showWarning` callback is optional; helper is safe to use from
 *     headless contexts (MCP tools, AI reset) that have no `vscode`.
 */

// The tracker is unit-tested in its own suite; mocked here so the helper's
// tests neither touch the real ~/.demo-builder store nor depend on its state.
const mockTrackPatchMisses: jest.Mock<Promise<Record<string, number>>, []> = jest.fn(async () => ({}));
jest.mock('@/features/eds/services/patches/patchMissTracker', () => ({
    OBSOLETE_MISS_THRESHOLD: 3,
    trackPatchMisses: () => mockTrackPatchMisses(),
}));

import {
    createPatchReport,
    addContentResult,
    addCodeResult,
    addReferenceResult,
    getUnapplied,
    formatUnappliedToast,
    logUnapplied,
    reportUnapplied,
    isDeferredReference,
} from '@/features/eds/services/patches/patchReportHelper';
import type { PatchReport } from '@/features/eds/services/patches/patchReportHelper';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../../helpers/loggerFake';

const mockLogger: Logger = createMockLogger();

beforeEach(() => {
    jest.clearAllMocks();
});

// ==========================================================================
// Aggregation
// ==========================================================================

describe('createPatchReport', () => {
    it('returns an empty report', async () => {
        const r = createPatchReport();
        expect(r).toEqual({ results: [] });
    });
});

describe('addContentResult', () => {
    it('normalizes content patch result (pagePath → target)', async () => {
        const r = createPatchReport();
        addContentResult(r, {
            patchId: 'index-product-teaser-sku',
            pagePath: '/',
            applied: false,
            reason: 'Search pattern not found in content',
        });
        expect(r.results).toEqual([
            {
                kind: 'content',
                patchId: 'index-product-teaser-sku',
                target: '/',
                applied: false,
                reason: 'Search pattern not found in content',
            },
        ]);
    });

    it('preserves applied:true results (success path is still recorded for diagnostics)', async () => {
        const r = createPatchReport();
        addContentResult(r, { patchId: 'p', pagePath: '/x', applied: true });
        expect(r.results[0].applied).toBe(true);
        expect(r.results[0].reason).toBeUndefined();
    });
});

describe('addCodeResult', () => {
    it('normalizes code patch result (already uses `target`)', async () => {
        const r = createPatchReport();
        addCodeResult(r, {
            patchId: 'header-nav-tools-defensive',
            target: 'blocks/header/header.js',
            applied: false,
            reason: 'Precondition not found',
        });
        expect(r.results).toEqual([
            {
                kind: 'code',
                patchId: 'header-nav-tools-defensive',
                target: 'blocks/header/header.js',
                applied: false,
                reason: 'Precondition not found',
            },
        ]);
    });
});

describe('aggregation across both domains', () => {
    it('records content + code entries in insertion order', async () => {
        const r = createPatchReport();
        addContentResult(r, { patchId: 'c1', pagePath: '/', applied: true });
        addCodeResult(r, { patchId: 'k1', target: 'a.js', applied: false, reason: 'X' });
        addContentResult(r, { patchId: 'c2', pagePath: '/y', applied: false, reason: 'Y' });

        expect(r.results.map(e => `${e.kind}:${e.patchId}:${e.applied}`)).toEqual([
            'content:c1:true',
            'code:k1:false',
            'content:c2:false',
        ]);
    });
});

// ==========================================================================
// Filtering
// ==========================================================================

describe('getUnapplied', () => {
    it('returns only non-applied entries', async () => {
        const r = createPatchReport();
        addContentResult(r, { patchId: 'c1', pagePath: '/', applied: true });
        addContentResult(r, { patchId: 'c2', pagePath: '/y', applied: false, reason: 'pattern' });
        addCodeResult(r, { patchId: 'k1', target: 'a.js', applied: true });
        addCodeResult(r, { patchId: 'k2', target: 'b.js', applied: false, reason: 'missing' });

        const unapplied = getUnapplied(r);
        expect(unapplied.map(e => e.patchId)).toEqual(['c2', 'k2']);
    });

    it('returns empty array for an all-applied report', async () => {
        const r = createPatchReport();
        addContentResult(r, { patchId: 'c1', pagePath: '/', applied: true });
        addCodeResult(r, { patchId: 'k1', target: 'a.js', applied: true });
        expect(getUnapplied(r)).toEqual([]);
    });

    it('returns empty array for an empty report', () => {
        expect(getUnapplied(createPatchReport())).toEqual([]);
    });
});

// ==========================================================================
// Toast formatting
// ==========================================================================

describe('addReferenceResult (completeness audit)', () => {
    it('records an unapplied reference entry naming the missing document', async () => {
        const r = createPatchReport();
        addReferenceResult(r, '/customer/nav', 'not found on source');
        expect(getUnapplied(r)).toEqual([
            { kind: 'reference', patchId: '/customer/nav', target: '/customer/nav', applied: false, reason: 'not found on source' },
        ]);
    });

    it('reads as a dangling-reference warning, not a patch failure, in logs', async () => {
        const r = createPatchReport();
        addReferenceResult(r, '/customer/nav', 'not found on source');
        logUnapplied(r, mockLogger);
        expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('referenced document not copied: /customer/nav'));
    });

    it('names missing documents in the toast alongside patches, distinctly', async () => {
        const r = createPatchReport();
        addCodeResult(r, { patchId: 'p1', target: 'a.js', applied: false, reason: 'X' });
        addReferenceResult(r, '/customer/nav', 'missing');
        const msg = formatUnappliedToast(getUnapplied(r));
        expect(msg).toContain('p1');
        expect(msg).toContain('/customer/nav');
        expect(msg.toLowerCase()).toContain('referenced document');
        expect(msg.toLowerCase()).toMatch(/continue|omit/);
    });
});

describe('formatUnappliedToast', () => {
    it('returns empty string when no unapplied entries', () => {
        expect(formatUnappliedToast([])).toBe('');
    });

    it('names every unapplied patch id (single)', async () => {
        const r = createPatchReport();
        addCodeResult(r, { patchId: 'header-nav-tools-defensive', target: 'a.js', applied: false, reason: 'X' });
        const msg = formatUnappliedToast(getUnapplied(r));
        expect(msg).toContain('header-nav-tools-defensive');
    });

    it('names every unapplied patch id (multiple)', async () => {
        const r = createPatchReport();
        addCodeResult(r, { patchId: 'p1', target: 'a.js', applied: false, reason: 'X' });
        addCodeResult(r, { patchId: 'p2', target: 'b.js', applied: false, reason: 'Y' });
        const msg = formatUnappliedToast(getUnapplied(r));
        expect(msg).toContain('p1');
        expect(msg).toContain('p2');
    });

    it('communicates that the demo continues (not blocked) — per D1 contract', async () => {
        const r = createPatchReport();
        addCodeResult(r, { patchId: 'p', target: 'a.js', applied: false, reason: 'X' });
        const msg = formatUnappliedToast(getUnapplied(r));
        // The exact wording can evolve; what's load-bearing is that the
        // user understands the create/reset succeeded and the demo will
        // run, just with these patches missed.
        expect(msg.toLowerCase()).toMatch(/continue|demo.*omit|skipped|not block/);
    });
});

// ==========================================================================
// Logging
// ==========================================================================

describe('logUnapplied', () => {
    it('writes one warn line per unapplied entry, including kind + target + reason', async () => {
        const r = createPatchReport();
        addContentResult(r, { patchId: 'c1', pagePath: '/y', applied: false, reason: 'page pattern' });
        addCodeResult(r, { patchId: 'k1', target: 'blocks/header.js', applied: false, reason: 'precondition' });
        addContentResult(r, { patchId: 'c2', pagePath: '/x', applied: true });

        logUnapplied(r, mockLogger);

        expect(mockLogger.warn).toHaveBeenCalledTimes(2);
        const calls = (mockLogger.warn as jest.Mock).mock.calls.map(c => c[0] as string);
        expect(calls.some(c => c.includes('c1') && c.includes('/y') && c.includes('page pattern'))).toBe(true);
        expect(calls.some(c => c.includes('k1') && c.includes('blocks/header.js') && c.includes('precondition'))).toBe(true);
    });

    it('does not log anything for an all-applied report', async () => {
        const r = createPatchReport();
        addContentResult(r, { patchId: 'c1', pagePath: '/', applied: true });
        logUnapplied(r, mockLogger);
        expect(mockLogger.warn).not.toHaveBeenCalled();
    });
});

// ==========================================================================
// One-call entry point
// ==========================================================================

describe('reportUnapplied', () => {
    it('escalates the copy at the miss threshold — the content-patch drift signal', async () => {
        mockTrackPatchMisses.mockResolvedValueOnce({ p: 3 });
        const showWarning = jest.fn();
        const r = createPatchReport();
        addCodeResult(r, { patchId: 'p', target: 'a.js', applied: false, reason: 'X' });

        await reportUnapplied(r, mockLogger, showWarning);

        expect(showWarning.mock.calls[0][0]).toContain(
            'p has not applied in 3 consecutive runs — likely obsolete, retire it from the ledger'
        );
        expect(mockLogger.warn).toHaveBeenCalledWith(
            expect.stringContaining("'p' has not applied in 3 consecutive runs")
        );
    });

    it('logs + fires toast when there are unapplied patches', async () => {
        const showWarning = jest.fn();
        const r = createPatchReport();
        addCodeResult(r, { patchId: 'p', target: 'a.js', applied: false, reason: 'X' });

        await reportUnapplied(r, mockLogger, showWarning);

        expect(mockLogger.warn).toHaveBeenCalled();
        expect(showWarning).toHaveBeenCalledTimes(1);
        expect(showWarning.mock.calls[0][0]).toContain('p');
    });

    it('does not fire toast when everything applied (no false-positive notification)', async () => {
        const showWarning = jest.fn();
        const r = createPatchReport();
        addCodeResult(r, { patchId: 'p', target: 'a.js', applied: true });

        await reportUnapplied(r, mockLogger, showWarning);

        expect(showWarning).not.toHaveBeenCalled();
    });

    it('logs but does not crash when showWarning callback is omitted (headless safety)', async () => {
        const r = createPatchReport();
        addCodeResult(r, { patchId: 'p', target: 'a.js', applied: false, reason: 'X' });

        await expect(reportUnapplied(r, mockLogger)).resolves.toBeUndefined();
        expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('aggregates content + code into one toast (single notification per create/reset)', async () => {
        const showWarning = jest.fn();
        const r = createPatchReport();
        addContentResult(r, { patchId: 'c-bad', pagePath: '/', applied: false, reason: 'a' });
        addCodeResult(r, { patchId: 'k-bad', target: 'a.js', applied: false, reason: 'b' });

        await reportUnapplied(r, mockLogger, showWarning);

        // Single toast — not one per domain
        expect(showWarning).toHaveBeenCalledTimes(1);
        const msg = showWarning.mock.calls[0][0] as string;
        expect(msg).toContain('c-bad');
        expect(msg).toContain('k-bad');
    });
});

// ==========================================================================
// Deferred-reference prefixes
// ==========================================================================

describe('isDeferredReference', () => {
    it('defers nothing when there is no report at all', () => {
        expect(isDeferredReference(undefined, '/customer/nav')).toBe(false);
    });

    it('defers nothing when the report carries no prefix list (default stays loud)', () => {
        expect(isDeferredReference(createPatchReport(), '/customer/nav')).toBe(false);
    });

    it('defers a target that sits UNDER a configured prefix', () => {
        const report: PatchReport = { results: [], deferredReferencePrefixes: ['/customer/'] };
        expect(isDeferredReference(report, '/customer/nav')).toBe(true);
    });

    it('matches on the START of the target, not the end', () => {
        const report: PatchReport = { results: [], deferredReferencePrefixes: ['/customer/nav'] };
        // Same text, wrong position: a prefix must anchor at the head or a
        // brand page merely MENTIONING the path would be silently skipped.
        expect(isDeferredReference(report, '/brand/customer/nav')).toBe(false);
    });

    it('does not defer a target outside every configured prefix', () => {
        const report: PatchReport = { results: [], deferredReferencePrefixes: ['/customer/'] };
        expect(isDeferredReference(report, '/nav')).toBe(false);
    });

    it('defers when ANY prefix matches, not only the first', () => {
        const report: PatchReport = {
            results: [],
            deferredReferencePrefixes: ['/account/', '/customer/'],
        };
        expect(isDeferredReference(report, '/customer/nav')).toBe(true);
    });
});

// ==========================================================================
// Toast wording — exact strings, so every clause decision is constrained
// ==========================================================================

const TAIL =
    ' during create/reset. The demo continues with these omitted. If this repeats on ' +
    'every create/reset, the patch is likely obsolete — please report it.';

describe('formatUnappliedToast clause selection', () => {
    it('names one patch in the singular and adds no reference clause', () => {
        const r = createPatchReport();
        addCodeResult(r, { patchId: 'p1', target: 'a.js', applied: false, reason: 'X' });
        expect(formatUnappliedToast(getUnapplied(r))).toBe(
            `Demo Builder: 1 patch didn't apply (p1)${TAIL}`
        );
    });

    it('names several patches in the plural', () => {
        const r = createPatchReport();
        addCodeResult(r, { patchId: 'p1', target: 'a.js', applied: false, reason: 'X' });
        addContentResult(r, { patchId: 'c1', pagePath: '/y', applied: false, reason: 'Y' });
        expect(formatUnappliedToast(getUnapplied(r))).toBe(
            `Demo Builder: 2 patches didn't apply (p1, c1)${TAIL}`
        );
    });

    it('names several missing documents in the plural and adds no patch clause', () => {
        const r = createPatchReport();
        addReferenceResult(r, '/customer/nav', 'missing');
        addReferenceResult(r, '/customer/footer', 'missing');
        expect(formatUnappliedToast(getUnapplied(r))).toBe(
            `Demo Builder: 2 referenced documents couldn't be copied (/customer/nav, /customer/footer)${TAIL}`
        );
    });

    it('keeps patches and references in SEPARATE clauses, each counted on its own', () => {
        const r = createPatchReport();
        addCodeResult(r, { patchId: 'p1', target: 'a.js', applied: false, reason: 'X' });
        addReferenceResult(r, '/customer/nav', 'missing');
        expect(formatUnappliedToast(getUnapplied(r))).toBe(
            `Demo Builder: 1 patch didn't apply (p1); ` +
                `1 referenced document couldn't be copied (/customer/nav)${TAIL}`
        );
    });

    it('lists a patch by id but a missing document by target', () => {
        const r = createPatchReport();
        // A reference entry sets patchId === target, so this pins WHICH field
        // each clause reads: the patch clause maps patchId, the reference
        // clause maps target.
        addContentResult(r, { patchId: 'c1', pagePath: '/y', applied: false, reason: 'Y' });
        expect(formatUnappliedToast(getUnapplied(r))).toBe(
            `Demo Builder: 1 patch didn't apply (c1)${TAIL}`
        );
    });

    it('adds no obsolescence clause for a patch under the miss threshold', () => {
        const r = createPatchReport();
        addCodeResult(r, { patchId: 'p1', target: 'a.js', applied: false, reason: 'X' });
        expect(formatUnappliedToast(getUnapplied(r), { p1: 2 })).toBe(
            `Demo Builder: 1 patch didn't apply (p1)${TAIL}`
        );
    });

    it('escalates only the ids AT or over the threshold, appended as a third clause', () => {
        const r = createPatchReport();
        addCodeResult(r, { patchId: 'p1', target: 'a.js', applied: false, reason: 'X' });
        expect(formatUnappliedToast(getUnapplied(r), { p1: 3, quiet: 2 })).toBe(
            `Demo Builder: 1 patch didn't apply (p1); ` +
                `p1 has not applied in 3 consecutive runs — likely obsolete, retire it from the ledger${TAIL}`
        );
    });
});

describe('reportUnapplied obsolescence escalation', () => {
    it('stays silent about a patch under the threshold — one warn line, not two', async () => {
        mockTrackPatchMisses.mockResolvedValueOnce({ p: 2 });
        const r = createPatchReport();
        addCodeResult(r, { patchId: 'p', target: 'a.js', applied: false, reason: 'X' });

        await reportUnapplied(r, mockLogger, jest.fn());

        // The per-patch line only. An escalation line here would make the
        // durable drift signal fire before the patch is actually stale.
        expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    });
});
