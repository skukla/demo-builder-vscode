/**
 * buildToolchainConsent — one consent, three renderings (2026-08-27).
 *
 * With a panel, the factory's notification prompt decides (this helper stands
 * aside). Headless — the MCP agent surface — the request's refreshCli flag IS
 * the consent, so a handler never parks an agent on a dialog.
 */

import { buildToolchainConsent } from '@/features/dashboard/handlers/appBuilderComponentHandlers';
import type { HandlerContext } from '@/types/handlers';

function contextWith(panel: unknown): HandlerContext {
    return { panel } as HandlerContext;
}

describe('buildToolchainConsent', () => {
    it('interactive (panel present): returns undefined so the factory prompt applies', () => {
        expect(buildToolchainConsent(contextWith({}), undefined)).toBeUndefined();
        expect(buildToolchainConsent(contextWith({}), true)).toBeUndefined();
    });

    it('headless + refreshCli true: consents without any prompt', async () => {
        const consent = buildToolchainConsent(contextWith(undefined), true);
        await expect(consent!()).resolves.toBe(true);
    });

    it('headless without the flag: declines — the failure hint carries the remedy', async () => {
        const consent = buildToolchainConsent(contextWith(undefined), undefined);
        await expect(consent!()).resolves.toBe(false);
    });
});
