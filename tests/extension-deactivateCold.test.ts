/**
 * `deactivate()` before anything was ever activated.
 *
 * Every disposal in it is optional-chained for exactly this case — a failed or
 * absent activation must not make shutdown throw as well. Module state persists
 * for the life of a jest module registry, so a test that runs after an
 * activation can never see those chains meet undefined. This file exists to have
 * no activation in it at all.
 */

import { deactivate } from './extension.testUtils';

describe('deactivate() on a cold extension', () => {
    it('does not throw when no service was ever created', () => {
        expect(() => deactivate()).not.toThrow();
    });
});
