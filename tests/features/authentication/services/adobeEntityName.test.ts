/**
 * adobeEntityName tests — deriving an alphanumeric Adobe I/O machine name from a title.
 *
 * The Adobe API validates the `name` as alphanumeric-only; the user types a free-form
 * title. These pin the sanitisation + fallback + suffix behaviour (deterministic suffix
 * injected so the derivation is testable).
 */

import {
    deriveAdobeEntityName,
    randomNameSuffix,
} from '@/features/authentication/services/adobeEntityName';

describe('deriveAdobeEntityName', () => {
    it('strips spaces so a friendly title becomes an alphanumeric name', () => {
        expect(deriveAdobeEntityName('Demo Test', 'ZZZZ')).toBe('DemoTestZZZZ');
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

    it('caps the derived base so a long title cannot exceed the length limit', () => {
        const longTitle = 'a'.repeat(100);
        const result = deriveAdobeEntityName(longTitle, 'ZZZZ');
        expect(result).toBe('a'.repeat(40) + 'ZZZZ');
    });

    it('appends the provided suffix for uniqueness', () => {
        expect(deriveAdobeEntityName('Demo', 'ab12')).toBe('Demoab12');
    });

    it('is fully alphanumeric for a typical title (default random suffix)', () => {
        expect(deriveAdobeEntityName('Demo Test')).toMatch(/^[A-Za-z0-9]+$/);
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
});
