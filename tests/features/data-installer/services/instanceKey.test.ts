/**
 * One Commerce instance spelled one way, and when a record's instance is another one (step-07 D6).
 * The house spelling Clear Commerce Instance already used (`instanceKeyOf`), now shared.
 */

import { installedOnAnotherInstanceLine, instanceKey, onAnotherInstance } from '@/features/data-installer/services/instanceKey';

describe('instanceKey', () => {
    it('drops the scheme and the last slash, and lowers the host only', () => {
        expect(instanceKey('https://Shop.Example.com/Store/')).toBe('shop.example.com/Store');
    });

    it('keeps an ACCS tenant id exactly: base62 ids differ by case', () => {
        expect(instanceKey('TenantAbc0123456789XYZ')).toBe('TenantAbc0123456789XYZ');
    });
});

describe('onAnotherInstance', () => {
    it('is another instance when both are known and differ', () => {
        expect(onAnotherInstance('TenantA', 'TenantB')).toBe(true);
    });

    it.each([
        ['with or without its last slash', 'https://shop.example.com/', 'https://shop.example.com'],
        ['over http or https', 'http://shop.example.com', 'https://shop.example.com'],
        ['with its host in another case', 'https://Shop.Example.com', 'https://shop.example.com'],
    ])('is the same PaaS instance written %s', (_label, recorded, now) => {
        expect(onAnotherInstance(recorded, now)).toBe(false);
    });

    it('keeps tenant ids case-sensitive', () => {
        expect(onAnotherInstance('TenantA', 'tenanta')).toBe(true);
    });

    it.each([
        ['a record written before instances were kept', undefined, 'TenantB'],
        ['a project naming no instance now', 'TenantA', undefined],
    ])('is not another instance for %s', (_label, recorded, now) => {
        expect(onAnotherInstance(recorded, now)).toBe(false);
    });
});

it("names the pack by its id in the engine's refusal", () => {
    expect(installedOnAnotherInstanceLine({ name: 'luma', version: 'main' })).toBe(
        'luma@main is installed on another Commerce instance. Uninstall it there first.'
    );
});
