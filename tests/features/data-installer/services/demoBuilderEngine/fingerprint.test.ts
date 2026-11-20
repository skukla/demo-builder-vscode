/**
 * One fingerprint per object: its row in pack form, hashed with the shared sha-256 (step 05).
 * The same row must hash the same however Commerce happened to order it.
 */

import { sha256 } from '@/core/utils/sha256';
import { canonicalJson, fingerprintRow } from '@/features/data-installer/services/demoBuilderEngine/fingerprint';

describe('canonicalJson', () => {
    it('sorts object keys at every depth', () => {
        expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
    });

    it('sorts custom attributes by code, the one list whose order Commerce does not keep', () => {
        const one = { custom_attributes: [{ attribute_code: 'url_key', value: 'a' }, { attribute_code: 'color', value: 'Red' }] };
        const two = { custom_attributes: [{ attribute_code: 'color', value: 'Red' }, { attribute_code: 'url_key', value: 'a' }] };

        expect(canonicalJson(one)).toBe(canonicalJson(two));
    });

    it('keeps the order of any other list, which means something', () => {
        expect(canonicalJson({ links: ['a', 'b'] })).not.toBe(canonicalJson({ links: ['b', 'a'] }));
    });

    it('leaves out a field with no value, as JSON does', () => {
        expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
    });
});

describe('fingerprintRow', () => {
    it('is the shared sha-256 of the canonical row', () => {
        expect(fingerprintRow({ name: 'VR Rack', sku: 'vrrack' })).toBe(sha256('{"name":"VR Rack","sku":"vrrack"}'));
    });

    it('changes when a value does', () => {
        expect(fingerprintRow({ price: 10 })).not.toBe(fingerprintRow({ price: 11 }));
    });
});
