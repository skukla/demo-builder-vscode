/**
 * Smart 404 handler — building one storefront's recovery script.
 *
 * Since 2026-10-29 the script lives inline in the code's `404.html` (`pdp404Page.ts` places
 * it), and every write is `bringStorefrontUpToDate`'s: `404.html` once with everything it
 * needs, `head.html` and the old `scripts/delayed.js` copy through `storefrontCodeBlocks.ts`
 * (`storefrontCodeBlocks.test.ts`). What is left here is pure: the script, or why there is
 * none.
 */

import { prepareSmart404Handler } from '@/features/eds/services/pdp/pdp404HandlerPublisher';
import { buildSmart404Snippet } from '@/features/eds/services/pdp/pdp404Snippet';
import { createMockLogger } from '../../../../helpers/loggerFake';

const OVERLAY = 'https://example.adobeioruntime.net/api/v1/web/accs-discovery/render-pdp';
const TRIGGER = 'https://example.adobeioruntime.net/api/v1/web/accs-discovery/prepublish-pdp';

describe('prepareSmart404Handler', () => {
    it("builds this storefront's script against the action beside the overlay", () => {
        expect(prepareSmart404Handler(OVERLAY, createMockLogger(), 'skukla', 'bodea')).toEqual({
            handler: buildSmart404Snippet(TRIGGER, 'skukla', 'bodea'),
        });
    });

    it('takes the overlay query off: the script stamps its own org and site', () => {
        expect(prepareSmart404Handler(`${OVERLAY}?org=x&site=y`, createMockLogger(), 'skukla', 'bodea')).toEqual({
            handler: buildSmart404Snippet(TRIGGER, 'skukla', 'bodea'),
        });
    });

    it('has no script when BYOM is off', () => {
        expect(prepareSmart404Handler(undefined, createMockLogger(), 'skukla', 'bodea')).toEqual({
            installed: false,
            reason: 'BYOM disabled',
        });
    });

    it('has no script for an overlay URL it cannot derive the action from', () => {
        for (const bad of ['not a url', 'https://example.com/api/v1/web/accs-discovery/discover-stores']) {
            expect(prepareSmart404Handler(bad, createMockLogger(), 'skukla', 'bodea')).toEqual({
                installed: false,
                reason: 'invalid overlay URL',
            });
        }
    });

    it('URL-encodes org and site into the script', () => {
        const prepared = prepareSmart404Handler(OVERLAY, createMockLogger(), 'my org', 'a/b');

        expect('handler' in prepared && prepared.handler).toContain('org=my%20org&site=a%2Fb');
    });
});
