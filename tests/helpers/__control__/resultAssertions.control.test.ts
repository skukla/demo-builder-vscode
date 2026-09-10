import { assertOk, assertNotOk } from '../resultAssertions';

type R = { success: true; data: number } | { success: false; error: string };

describe('CONTROL: the narrowing assertions can actually fail', () => {
    it('assertOk throws on a failure result, and names the reason', () => {
        const bad: R = { success: false, error: 'boom' };
        expect(() => assertOk(bad)).toThrow(/boom/);
    });

    it('assertNotOk throws on a success result', () => {
        const good: R = { success: true, data: 1 };
        expect(() => assertNotOk(good)).toThrow();
    });

    it('both pass on the matching variant, and narrow the type', () => {
        const good: R = { success: true, data: 7 };
        assertOk(good);
        expect(good.data).toBe(7);        // compiles only because it narrowed

        const bad: R = { success: false, error: 'nope' };
        assertNotOk(bad);
        expect(bad.error).toBe('nope');
    });
});
