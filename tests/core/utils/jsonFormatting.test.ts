/**
 * jsonFormatting — a file the extension edits keeps the indentation its owner
 * gave it.
 */

import { detectJsonIndent, stringifyJsonLike } from '@/core/utils/jsonFormatting';

const DOC = { groups: [{ id: 'blocks', components: [{ id: 'hero' }] }] };

describe('detectJsonIndent', () => {
    it('reads four spaces, a tab, and two spaces from the first indented line', () => {
        expect(detectJsonIndent(JSON.stringify(DOC, null, 4))).toBe('    ');
        expect(detectJsonIndent(JSON.stringify(DOC, null, '\t'))).toBe('\t');
        expect(detectJsonIndent(JSON.stringify(DOC, null, 2))).toBe('  ');
    });

    it('falls back to two spaces for a one-line or empty document', () => {
        expect(detectJsonIndent(JSON.stringify(DOC))).toBe('  ');
        expect(detectJsonIndent('')).toBe('  ');
    });
});

describe('stringifyJsonLike', () => {
    it('writes four-space and tab files back in their own indentation', () => {
        expect(stringifyJsonLike('{\n    "a": 1\n}', DOC)).toBe(
            JSON.stringify(DOC, null, 4),
        );
        expect(stringifyJsonLike('[\n\t1\n]', DOC)).toBe(JSON.stringify(DOC, null, '\t'));
    });

    it('keeps a trailing newline only when the original had one', () => {
        expect(stringifyJsonLike('[\n  1\n]\n', DOC)).toBe(`${JSON.stringify(DOC, null, 2)}\n`);
        expect(stringifyJsonLike('[\n  1\n]', DOC)).toBe(JSON.stringify(DOC, null, 2));
    });
});
