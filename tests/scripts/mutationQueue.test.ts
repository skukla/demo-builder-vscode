/**
 * The goal text `scripts/mutationQueue.mjs` generates for every burn-down batch.
 *
 * A goal session knows only what its condition says, so the rules that stop a session
 * stalling have to be IN the text: measure with the bounded command, never start an
 * open-ended run, never wait in a loop, look the problem up before diagnosing it. And
 * the text has to stay under the 4,000 characters `/goal` enforces, or the batch does
 * not start at all — which has happened twice.
 *
 * The script is plain ESM, which this repo's jest transform does not parse, so the
 * text is rendered by a node subprocess (the precedent is `mutationStaleRows.test.ts`).
 */

import { execFileSync } from 'child_process';
import * as path from 'path';

const SCRIPT = path.resolve(__dirname, '../../scripts/mutationQueue.mjs');

/** Ten modules with the longest plausible paths: the worst case for the cap. */
const LONG = Array.from({ length: 10 }, (_, i) => ({
    path: `src/features/project-creation/ui/components/integrations/aVeryLongModuleNameNumber${i}ForTheCapTest.ts`,
    openGaps: 100 + i,
    killed: 200,
    survived: 30,
    noCoverage: 10,
    timeout: 1,
}));

function render(expression: string): string {
    const code = `import { goalText, packBatches } from ${JSON.stringify(SCRIPT)};
const mods = ${JSON.stringify(LONG)};
process.stdout.write(JSON.stringify(${expression}));`;
    return execFileSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
}

describe('the generated burn-down goal', () => {
    const goal = JSON.parse(render(`goalText('MUT-01', mods.slice(0, 3))`)) as string;

    it('measures only with the bounded command', () => {
        expect(goal).toContain('npm run test:mutation:measure');
        expect(goal).not.toContain('npx stryker run');
    });

    it('forbids the open-ended runs and the waiting loop', () => {
        expect(goal).toContain('--detectOpenHandles');
        expect(goal).toContain('--detectLeaks');
        expect(goal).toContain('--watch');
        expect(goal).toMatch(/never wait in a loop/i);
    });

    it('says to look a known problem up before diagnosing it', () => {
        expect(goal).toContain('.rptc/research/');
        expect(goal).toContain('BURNDOWN.md');
        expect(goal).toMatch(/say what (was|you) found/i);
    });

    it('commits per module', () => {
        expect(goal).toMatch(/one commit per module/i);
    });

    it('shows each module with its mutant count, so a group can be kept under the budget', () => {
        expect(goal).toContain('(100 open gaps, 241 mutants)');
    });

    it('keeps every batch under the cap, even ten of the longest paths', () => {
        const lengths = JSON.parse(render(`packBatches(mods).map((b) => goalText('MUT-01', b).length)`)) as number[];

        expect(lengths.length).toBeGreaterThan(0);
        expect(Math.max(...lengths)).toBeLessThanOrEqual(3900);
    });

    it('CONTROL: packing loses no module', () => {
        const sizes = JSON.parse(render(`packBatches(mods).map((b) => b.length)`)) as number[];

        expect(sizes.reduce((a, b) => a + b, 0)).toBe(LONG.length);
    });
});
