/**
 * The shared search predicate, tested directly.
 *
 * `matchesSearchFields` is imported by four production surfaces — the datapack
 * catalog, the integrations screen, the sample-data step and the projects
 * dashboard — and until now every one of its decisions was exercised only
 * through those surfaces' own suites. That is coverage of the callers, not of
 * the rule: the whole function could be replaced by `() => true` and the four
 * screens would still render a list.
 *
 * It exists because a 2026-07-31 duplication scan found three copies of this
 * one walk. A predicate with three former copies is exactly the code that has
 * to state its own behaviour.
 */

import { matchesSearchFields } from '@/core/ui/hooks/useSearchFilter';

interface Row extends Record<string, unknown> {
    title: string | null | undefined;
    owner?: string | null;
}

const react: Row = { title: 'React Hooks', owner: 'Meta' };

describe('matchesSearchFields', () => {
    describe('the query', () => {
        it('is case-insensitive by default', () => {
            expect(matchesSearchFields(react, ['title'], 'react')).toBe(true);
        });

        it('compares exactly when case sensitivity is asked for', () => {
            expect(matchesSearchFields(react, ['title'], 'react', true)).toBe(false);
            expect(matchesSearchFields(react, ['title'], 'React', true)).toBe(true);
        });

        it('ignores the whitespace a person leaves around what they typed', () => {
            // Typed into a search box, "  react  " is the same search as "react".
            expect(matchesSearchFields(react, ['title'], '  react  ')).toBe(true);
        });

        it('ignores that whitespace under case sensitivity too', () => {
            expect(matchesSearchFields(react, ['title'], '  React  ', true)).toBe(true);
        });

        it('does not match a row it has nothing in common with', () => {
            expect(matchesSearchFields(react, ['title'], 'kubernetes')).toBe(false);
        });
    });

    describe('a blank query', () => {
        // Blank means "no filter", so it matches everything — including rows
        // that would match nothing, which is what separates the short-circuit
        // from letting an empty needle fall through to includes('').
        it('matches a row whose searched field is empty', () => {
            expect(matchesSearchFields({ title: null }, ['title'], '')).toBe(true);
        });

        it('matches a row whose searched field is empty, for whitespace too', () => {
            expect(matchesSearchFields({ title: null }, ['title'], '   ')).toBe(true);
        });
    });

    describe('across fields', () => {
        it('matches when ANY field matches, not all of them', () => {
            expect(matchesSearchFields(react, ['title', 'owner'], 'meta')).toBe(true);
        });

        it('does not match when no field does', () => {
            expect(matchesSearchFields(react, ['title', 'owner'], 'google')).toBe(false);
        });

        it('matches nothing when there are no fields to search', () => {
            expect(matchesSearchFields(react, [], 'react')).toBe(false);
        });
    });

    describe('absent values', () => {
        // The trap this guard exists for: String(null) is the four-letter word
        // "null", so a person searching for it would be handed every row that
        // is MISSING the field they searched.
        it('never lets a null field match the text "null"', () => {
            expect(matchesSearchFields({ title: null }, ['title'], 'null')).toBe(false);
        });

        it('never lets an undefined field match the text "undefined"', () => {
            expect(matchesSearchFields({ title: undefined }, ['title'], 'undefined')).toBe(false);
        });

        it('skips the absent field and still matches on a present one', () => {
            expect(
                matchesSearchFields({ title: null, owner: 'Meta' }, ['title', 'owner'], 'meta')
            ).toBe(true);
        });

        it('matches nothing when every searched field is absent', () => {
            expect(
                matchesSearchFields({ title: null, owner: null }, ['title', 'owner'], 'meta')
            ).toBe(false);
        });
    });

    describe('non-string values', () => {
        it('searches a number by the text it prints as', () => {
            expect(matchesSearchFields({ port: 3000 }, ['port'], '300')).toBe(true);
        });

        it('searches a boolean the same way', () => {
            expect(matchesSearchFields({ enabled: false }, ['enabled'], 'false')).toBe(true);
        });
    });
});
