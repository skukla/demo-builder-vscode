/**
 * Reading back what the agent did in this window.
 *
 * WHY THIS EXISTS. With the dry run on, chatting normally gave a producer the
 * safety and none of the visibility. Every call was already being recorded —
 * `extension.ts` hands the main server the same recorder — and the only thing
 * that ever read it was a workbench run. This module is the read, and the rules
 * it encodes are the ones a hurried reader depends on: the story stays in time
 * order, and the handful of calls worth acting on are pulled out separately.
 */

import {
    SLOW_CALL_MS,
    buildTraceReport,
    renderTraceText,
} from '@/features/ai/evaluation/agentTraceReport';
import type { TraceEntry } from '@/features/ai/server/toolTraceRecorder';

function entry(overrides: Partial<TraceEntry> = {}): TraceEntry {
    return {
        tool: 'get_current_project',
        readOnly: true,
        argumentKeys: [],
        argumentFingerprint: 'none',
        resultBytes: 20,
        durationMs: 5,
        outcome: 'ok',
        at: 0,
        ...overrides,
    };
}

describe('what stood out', () => {
    it('calls out a repeated question, rather than only listing it', () => {
        // The same tool with the same arguments. The FIRST ask is not waste.
        const report = buildTraceReport([entry(), entry({ at: 10 })]);

        expect(report.wastedCalls).toBe(1);
        expect(report.standouts.map((r) => r.flag)).toEqual(['repeated']);
    });

    it('calls out a write the dry run stopped', () => {
        const report = buildTraceReport([
            entry({ tool: 'deploy_mesh', outcome: 'blocked-by-dry-run' }),
        ]);

        expect(report.blockedCalls).toBe(1);
        expect(report.standouts[0].flag).toBe('blocked');
    });

    it('calls out a failure ahead of everything else', () => {
        // A failed call is what a producer acts on first, so it outranks the
        // other reasons a call can be interesting.
        const report = buildTraceReport([
            entry({ outcome: 'error', durationMs: SLOW_CALL_MS + 1 }),
        ]);

        expect(report.failedCalls).toBe(1);
        expect(report.standouts[0].flag).toBe('failed');
    });

    it('does NOT count a retry after a failure as waste', () => {
        // Asking again after something went wrong is reasonable. Counting it
        // would report recovery as waste.
        const report = buildTraceReport([entry({ outcome: 'error' }), entry({ at: 10 })]);

        expect(report.wastedCalls).toBe(0);
    });

    it('calls out a slow call', () => {
        const report = buildTraceReport([entry({ durationMs: SLOW_CALL_MS })]);

        expect(report.standouts[0].flag).toBe('slow');
    });

    it('says nothing stood out when nothing did', () => {
        const report = buildTraceReport([entry(), entry({ tool: 'list_projects', at: 5 })]);

        expect(report.standouts).toEqual([]);
        expect(report.totalCalls).toBe(2);
    });
});

describe('the full list', () => {
    it('stays in the order it happened', () => {
        // The story of what the agent did is chronological. Re-sorting the whole
        // list by "interesting" would destroy it — which is why the standouts
        // are a separate list rather than a different order.
        const report = buildTraceReport([
            entry({ tool: 'first' }),
            entry({ tool: 'slow_one', durationMs: SLOW_CALL_MS, at: 10 }),
            entry({ tool: 'third', at: 20 }),
        ]);

        expect(report.rows.map((r) => r.tool)).toEqual(['first', 'slow_one', 'third']);
    });

    it('handles an empty recorder', () => {
        const report = buildTraceReport([]);

        expect(report).toEqual({
            rows: [],
            standouts: [],
            totalCalls: 0,
            wastedCalls: 0,
            blockedCalls: 0,
            failedCalls: 0,
        });
    });
});

describe('the text version', () => {
    it('says cost is not recorded, rather than printing a zero', () => {
        // Cost comes from a run's own output and we do not own the chat's
        // process. A number here would look authoritative and be a guess.
        const text = renderTraceText(buildTraceReport([entry()]));

        expect(text).toMatch(/cost is not recorded/i);
        expect(text).not.toMatch(/\$0/);
    });

    it('leads with the counts, because those are what gets quoted', () => {
        const text = renderTraceText(
            buildTraceReport([entry(), entry({ at: 10 }), entry({ outcome: 'error', at: 20 })]),
        );

        expect(text).toMatch(/3 calls/);
        expect(text).toMatch(/1 repeated, 0 simulated, 1 failed/);
    });

    it('never leaks argument values or fingerprints', () => {
        // The recorder keeps a hash precisely so nothing readable is retained.
        const text = renderTraceText(
            buildTraceReport([entry({ argumentKeys: ['password'], argumentFingerprint: 'abc123' })]),
        );

        expect(text).not.toMatch(/password|abc123/);
    });
});
