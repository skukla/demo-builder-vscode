/**
 * The grouping and the words, tested without a panel.
 *
 * These rules decide what a producer READS, so they are asserted here rather
 * than through the rendered surface: a band's label being right is a property of
 * the fold, not of the layout that draws it.
 *
 * The rule under test is deliberately strict — a phase is a run of consecutive
 * calls to ONE tool — because that is what makes the label unimpeachable. The
 * reference implementation this borrows from (`tech-case-studio`) records the
 * opposite failure in its own docstring: a rule loose enough that a turn
 * collapsed into opaque "N steps" blobs whose labels described none of what was
 * inside.
 */

import {
    UNNAMED_PHASE,
    describeStep,
    formatSpan,
    groupIntoPhases,
    phaseStatus,
    phraseFor,
    stepCount,
    type TranscriptStep,
} from '@/features/ai/evaluation/transcriptPhases';
import { TOOL_NARRATION } from '@/features/ai/server/toolNarration';

/** One recorded call, with only what the transcript reads. */
function step(
    tool: string,
    overrides: Partial<TranscriptStep> = {},
): TranscriptStep {
    return { tool, outcome: 'ok', durationMs: 5, at: 0, ...overrides };
}

describe('the words a step is given', () => {
    it('uses the AUTHORED phrase, for every tool that has one', () => {
        // The defect this module exists to fix: 103 phrases sat in
        // toolNarration.ts and neither evaluation view imported them.
        const wordless = Object.keys(TOOL_NARRATION).filter(
            (tool) => phraseFor(tool) === UNNAMED_PHASE,
        );

        expect(wordless).toEqual([]);
        expect(phraseFor('check_mesh')).toBe('Checking the API mesh');
    });

    it('never INVENTS a phrase from a tool name', () => {
        // Deriving words from an identifier is exactly what toolNarration.ts
        // was written to remove; a fallback that did it here would let the next
        // unauthored tool ship silently wearing made-up English.
        const label = phraseFor('some_tool_nobody_authored');

        expect(label).toBe(UNNAMED_PHASE);
        expect(label).not.toContain('some');
        expect(label).not.toContain('_');
    });

    it('keeps the tool name and its argument NAMES for the expanded row', () => {
        // Values are never kept — the recorder holds a one-way hash of them
        // precisely because arguments carry secrets.
        const view = describeStep(
            step('check_mesh', { argumentKeys: ['projectPath', 'force'] }),
        );

        expect(view.label).toBe('Checking the API mesh');
        expect(view.detail).toBe('check_mesh · projectPath, force');
    });

    it('says a blocked call was simulated, not how long it took', () => {
        const view = describeStep(step('deploy_mesh', { outcome: 'blocked-by-dry-run' }));

        expect(view.outcome).toBe('simulated — nothing changed');
    });

    it('adds WHY a call stood out, when the outcome cannot say it', () => {
        // "asked again" is the entire reason a repeat is in the standouts list.
        // Dropping it leaves a short list of ordinary-looking calls with no
        // explanation of why they were singled out.
        expect(describeStep(step('check_mesh', { flag: 'repeated' })).outcome).toMatch(
            /asked again/,
        );
        expect(describeStep(step('check_mesh', { flag: 'slow' })).outcome).toMatch(/slow/);
    });

    it('does not repeat itself when the flag only restates the outcome', () => {
        const view = describeStep(
            step('deploy_mesh', { outcome: 'blocked-by-dry-run', flag: 'blocked' }),
        );

        expect(view.outcome).toBe('simulated — nothing changed');
    });
});

describe('folding a trace into phases', () => {
    it('folds consecutive calls of the SAME tool into one band', () => {
        const phases = groupIntoPhases([
            step('check_mesh', { at: 0 }),
            step('check_mesh', { at: 100 }),
            step('check_mesh', { at: 200 }),
        ]);

        expect(phases).toHaveLength(1);
        expect(phases[0].label).toBe('Checking the API mesh');
        expect(phases[0].steps).toHaveLength(3);
    });

    it('breaks a phase when the tool changes', () => {
        const phases = groupIntoPhases([
            step('get_current_project', { at: 0 }),
            step('check_mesh', { at: 10 }),
            step('get_current_project', { at: 20 }),
        ]);

        // Three bands, not two: the trace is a STORY in time order, and
        // re-sorting it to merge the two project reads would destroy that.
        expect(phases.map((p) => p.tool)).toEqual([
            'get_current_project',
            'check_mesh',
            'get_current_project',
        ]);
    });

    it('spans a phase from its first call to its last, not per call', () => {
        // Four 5ms calls spread over a second are a second of waiting, and the
        // band has to say so or a slow phase reads as instant.
        const phases = groupIntoPhases([
            step('check_mesh', { at: 0, durationMs: 5 }),
            step('check_mesh', { at: 995, durationMs: 5 }),
        ]);

        expect(phases[0].elapsedMs).toBe(1000);
    });

    it('answers with nothing for an empty trace', () => {
        expect(groupIntoPhases([])).toEqual([]);
    });
});

describe('what a band says without being expanded', () => {
    it('reports a failure, because that is what a producer scans for', () => {
        const [phase] = groupIntoPhases([step('check_mesh', { outcome: 'error' })]);

        expect(phaseStatus(phase)).toEqual({ icon: 'failed', note: 'failed' });
    });

    it('counts the failures when only some of them failed', () => {
        const [phase] = groupIntoPhases([
            step('check_mesh', { at: 0 }),
            step('check_mesh', { at: 10, outcome: 'error' }),
        ]);

        expect(phaseStatus(phase).note).toBe('1 failed');
    });

    it('marks a simulated phase, so a blocked write is visible on the band', () => {
        const [phase] = groupIntoPhases([
            step('deploy_mesh', { outcome: 'blocked-by-dry-run' }),
        ]);

        expect(phaseStatus(phase)).toEqual({
            icon: 'simulated',
            note: 'simulated — nothing changed',
        });
    });

    it('ranks a FAILURE above a simulation when a phase is both', () => {
        // Something that errored is the one thing a producer has to act on.
        const [phase] = groupIntoPhases([
            step('deploy_mesh', { at: 0, outcome: 'blocked-by-dry-run' }),
            step('deploy_mesh', { at: 10, outcome: 'error' }),
        ]);

        expect(phaseStatus(phase).icon).toBe('failed');
    });

    it('says nothing extra when a phase simply finished', () => {
        const [phase] = groupIntoPhases([step('check_mesh')]);

        expect(phaseStatus(phase)).toEqual({ icon: 'done' });
    });
});

describe('the span, in the fewest characters that stay honest', () => {
    it('keeps milliseconds for a call, and drops the decimal past ten seconds', () => {
        // A whole-second ".0" is fine in a debug log and wrong on a surface
        // whose whole complaint was that it read like one.
        expect(formatSpan(5)).toBe('5ms');
        expect(formatSpan(1_400)).toBe('1.4s');
        expect(formatSpan(41_000)).toBe('41s');
        expect(formatSpan(125_000)).toBe('2m 5s');
        expect(formatSpan(120_000)).toBe('2m');
    });

    it('says nothing rather than something wrong for a nonsense duration', () => {
        expect(formatSpan(-1)).toBe('');
        expect(formatSpan(Number.NaN)).toBe('');
    });

    it('counts steps in words a person would use', () => {
        expect(stepCount(1)).toBe('1 step');
        expect(stepCount(3)).toBe('3 steps');
    });
});
