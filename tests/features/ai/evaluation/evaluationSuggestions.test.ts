/**
 * Reading a trace and saying what would make the prompt better.
 *
 * GRADE OUTCOMES, NOT PATHS. Nothing here fails a prompt. The research this
 * follows is explicit that path-grading is "too rigid… overly brittle, as
 * agents regularly find valid approaches that eval designers didn't
 * anticipate", so every suggestion is an observation with its evidence
 * attached and the person decides.
 */

import { suggestionsFor } from '@/features/ai/evaluation/evaluationSuggestions';
import type { TraceEntry } from '@/features/ai/server/toolTraceRecorder';

function step(
    tool: string,
    fingerprint = 'none',
    outcome: TraceEntry['outcome'] = 'ok',
): TraceEntry {
    return {
        tool,
        readOnly: true,
        argumentKeys: [],
        argumentFingerprint: fingerprint,
        resultBytes: 10,
        durationMs: 1,
        outcome,
        at: 0,
    };
}

describe('what the trace says to change', () => {
    it('says nothing about a clean run', () => {
        // A prompt that worked should not be handed advice.
        const suggestions = suggestionsFor([step('get_project', 'a'), step('deploy_mesh', 'b')]);

        expect(suggestions).toEqual([]);
    });

    it('spots the agent working out which project it is in', () => {
        const suggestions = suggestionsFor([
            step('get_current_project'),
            step('get_current_project'),
            step('get_current_project'),
        ]);

        // Two wordings, because the fix differs: with a name known it says
        // "say which project you mean"; without one it says "name the project".
        expect(suggestions[0].text).toMatch(/project/i);
        expect(suggestions[0].evidence).toMatch(/3 times/);
    });

    it('offers a one-click fix ONLY when the project name is known', () => {
        // Guessing it would rewrite the prompt to the WRONG project.
        const trace = [step('get_current_project'), step('get_current_project')];

        expect(suggestionsFor(trace, 'bodea')[0].append).toBe(' for bodea');
        expect(suggestionsFor(trace)[0].append).toBeUndefined();
    });

    it('counts the second ask, not the first', () => {
        // Asking once is not waste. A rule that counted the first ask would
        // call every run wasteful.
        const suggestions = suggestionsFor([step('list_content', 'x'), step('list_content', 'y')]);

        expect(suggestions).toEqual([]);
    });

    it('does not call a retry after a failure waste', () => {
        // Recovering from an error is reasonable behaviour, not waste.
        const suggestions = suggestionsFor([
            step('deploy_mesh', 'a', 'error'),
            step('deploy_mesh', 'a'),
        ]);

        expect(suggestions.filter((s) => s.text.match(/ask for this once/i))).toEqual([]);
    });

    it('always attaches the evidence, so the user can check it', () => {
        const suggestions = suggestionsFor([
            step('get_current_project'),
            step('get_current_project'),
            step('list_content', 'z'),
            step('list_content', 'z'),
            step('deploy_mesh', 'q', 'error'),
        ]);

        expect(suggestions.length).toBeGreaterThan(1);
        for (const s of suggestions) {
            expect(s.evidence.length).toBeGreaterThan(0);
        }
    });
});
