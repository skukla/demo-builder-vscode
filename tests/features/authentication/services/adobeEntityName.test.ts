/**
 * adobeEntityName tests — deriving an alphanumeric Adobe I/O machine name from a title.
 *
 * The Adobe API validates the `name` as alphanumeric-only; the user types a free-form
 * title. These pin the sanitisation + fallback + suffix behaviour (deterministic suffix
 * injected so the derivation is testable).
 */

import {
    deriveAdobeEntityName,
    deriveFreeAdobeEntityName,
    randomNameSuffix,
} from '@/features/authentication/services/adobeEntityName';

describe('deriveAdobeEntityName', () => {
    it('strips spaces so a friendly title becomes an alphanumeric name', () => {
        expect(deriveAdobeEntityName('Kukla Test', 'ZZZZ')).toBe('KuklaTestZZZZ');
    });

    it('strips punctuation, hyphens, and underscores', () => {
        expect(deriveAdobeEntityName('my-demo_2024!', 'ZZZZ')).toBe('mydemo2024ZZZZ');
    });

    it('preserves digits and mixed case', () => {
        expect(deriveAdobeEntityName('147 Cyan Skunk', 'ZZZZ')).toBe('147CyanSkunkZZZZ');
    });

    it('falls back to a safe base when the title has no alphanumeric characters', () => {
        expect(deriveAdobeEntityName('   ', 'ZZZZ')).toBe('AppZZZZ');
        expect(deriveAdobeEntityName('***', 'ZZZZ')).toBe('AppZZZZ');
    });

    it('handles an empty/undefined title without throwing', () => {
        expect(deriveAdobeEntityName('', 'ZZZZ')).toBe('AppZZZZ');
        expect(deriveAdobeEntityName(undefined as unknown as string, 'ZZZZ')).toBe('AppZZZZ');
    });

    it('caps base + suffix under 20 chars — Console 400s at 20 ("Project name length must be less than 20", measured live 2026-08-27)', () => {
        const longTitle = 'a'.repeat(100);
        const result = deriveAdobeEntityName(longTitle, 'ZZZZ');
        expect(result).toBe('a'.repeat(15) + 'ZZZZ');
        expect(result.length).toBeLessThan(20);
    });

    it('appends the provided suffix for uniqueness', () => {
        expect(deriveAdobeEntityName('Demo', 'ab12')).toBe('Demoab12');
    });

    it('is fully alphanumeric for a typical title (default random suffix)', () => {
        expect(deriveAdobeEntityName('Kukla Test')).toMatch(/^[A-Za-z0-9]+$/);
    });
});

describe('randomNameSuffix', () => {
    it('returns an alphanumeric run of the requested length', () => {
        expect(randomNameSuffix(4)).toMatch(/^[A-Za-z0-9]{4}$/);
        expect(randomNameSuffix(8)).toMatch(/^[A-Za-z0-9]{8}$/);
    });

    it('defaults to a 4-character suffix', () => {
        expect(randomNameSuffix()).toHaveLength(4);
    });

    it('spans the whole alphabet: the random draw picks the character by position', () => {
        // The alphabet is a..z A..Z 0..9 (62 characters). A draw just under 1 must land on
        // the LAST character and a draw of 0 on the first; a suffix that only ever produced
        // 'a' would look alphanumeric and still collide on every same-titled entity.
        const random = jest.spyOn(Math, 'random');
        try {
            random.mockReturnValueOnce(0.999).mockReturnValueOnce(0).mockReturnValueOnce(0.5);
            expect(randomNameSuffix(3)).toBe('9aF');
        } finally {
            random.mockRestore();
        }
    });
});

// Console's workspace boxes show the NAME, so "ProductionKnDo" is what the SC read
// (owner, 2026-09-21). A space is refused but a dash is not (both measured live
// that day, the dash with a Runtime namespace that answered), so a space becomes a
// dash. A taken name is numbered; the random ending is only for when the names
// in use cannot be read.
describe('deriveFreeAdobeEntityName', () => {
    it('is the title with spaces as dashes when nothing in the project has it', () => {
        expect(deriveFreeAdobeEntityName('Northwind ERP', ['Production'])).toBe('Northwind-ERP');
    });

    it('turns any run of other characters into one dash, and trims the ends', () => {
        expect(deriveFreeAdobeEntityName('  My  demo_2024! ', [])).toBe('My-demo-2024');
    });

    // A second one is numbered, not scrambled: Northwind-ERP-1, -2, ... (owner, 2026-09-21).
    it('numbers a taken name with the lowest free number, ignoring case', () => {
        expect(deriveFreeAdobeEntityName('Northwind ERP', ['northwind-erp'])).toBe('Northwind-ERP-1');
        expect(
            deriveFreeAdobeEntityName('Northwind ERP', ['Northwind-ERP', 'Northwind-ERP-1', 'Northwind-ERP-3']),
        ).toBe('Northwind-ERP-2');
    });

    it('keeps a numbered name at 19 or fewer', () => {
        expect(deriveFreeAdobeEntityName('a'.repeat(40), ['a'.repeat(19)])).toBe('a'.repeat(17) + '-1');
    });

    it('adds the random ending when the names in use are unknown', () => {
        expect(deriveFreeAdobeEntityName('Northwind ERP', undefined, 'ZZZZ')).toBe(
            'Northwind-ERP-ZZZZ',
        );
    });

    it('stays at 19 or fewer, with no dash left at the cut', () => {
        expect(deriveFreeAdobeEntityName('Northwind Tradersx ERP', [])).toBe('Northwind-Tradersx');
        expect(deriveFreeAdobeEntityName('a'.repeat(40), [], 'ZZZZ')).toBe('a'.repeat(19));
        expect(deriveFreeAdobeEntityName('a'.repeat(40), undefined, 'ZZZZ')).toBe(
            'a'.repeat(14) + '-ZZZZ',
        );
    });

    it('falls back to App when the title has nothing Adobe accepts', () => {
        expect(deriveFreeAdobeEntityName('***', [])).toBe('App');
    });
});
