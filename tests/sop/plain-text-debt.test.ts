/**
 * The plain-words debt only falls (PL-102). `notYetPlain` passes text that is not yet typed at its
 * source through to a person, translated where its meaning is known. Every use is a place raw text
 * can still reach a screen; slices 3 to 6 (after beta.153, owner 2026-11-19) bring the count to zero.
 *
 * A new use fails here: type the text at its source instead (`plain`, `plainLine`, `plainFailure`,
 * a `PlainError`). A use removed lowers the ceiling in the same change, so it cannot grow back.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { workingTreeFiles } from './architectureScan';

const ROOT = join(__dirname, '..', '..');
/** Measured 2026-11-19, at the end of slice 2. */
const CEILING = 15;
const DEFINED_IN = 'src/core/utils/plainText.ts';

/** Each use of `notYetPlain` in a source: a call, or the function handed on (`.map(notYetPlain)`). */
export function debtUses(source: string): number {
    const calls = source.match(/\bnotYetPlain\(/gu) ?? [];
    const handedOn = source.match(/\(notYetPlain\)/gu) ?? [];
    return calls.length + handedOn.length;
}

function verdict(uses: number): string {
    if (uses > CEILING) return 'GREW';
    return uses < CEILING ? 'LOWER_THE_CEILING' : 'at';
}

describe('the plain-words debt', () => {
    it('never grows, and its ceiling falls with it', () => {
        const uses = workingTreeFiles('src')
            .filter((f) => /\.tsx?$/.test(f) && f !== DEFINED_IN)
            .reduce((sum, f) => sum + debtUses(readFileSync(join(ROOT, f), 'utf8')), 0);
        expect({ uses, verdict: verdict(uses) }).toEqual({
            uses,
            verdict: 'at',
        });
    });

    it('CONTROL: counts calls and hand-ons, not the import', () => {
        const source = [
            "import { notYetPlain, plain } from '@/core/utils/plainText';",
            'const a = notYetPlain(x);',
            'const b = lines.map(notYetPlain);',
        ].join('\n');
        expect(debtUses(source)).toBe(2);
    });
});
