/**
 * The receiving side of EDS-22: before an SC adds a colleague's storefront, can
 * they read its AUTHORED content on DA.live (the block library under `.da/`, the
 * unpublished pages), or only what the CDN publishes? And when only the latter,
 * who must grant what.
 */

import {
    probeAuthoredContentAccess,
    authoredAccessWarning,
    type AuthoredAccessDeps,
} from '@/features/eds/services/daLive/authoredContentAccess';
import { createMockLogger } from '../../../../helpers/loggerFake';

const TARGET = { org: 'kmanns', site: 'justrite' };

function deps(overrides: Partial<AuthoredAccessDeps> & { status?: number } = {}): AuthoredAccessDeps & {
    fetchImpl: jest.Mock;
} {
    const fetchImpl = jest.fn().mockResolvedValue({ status: overrides.status ?? 200, ok: (overrides.status ?? 200) < 300 });
    return {
        getAccessToken: jest.fn().mockResolvedValue('fake-test-token-not-a-secret'),
        getUserEmail: jest.fn().mockResolvedValue('sc@example.com'),
        fetchImpl,
        ...overrides,
    } as AuthoredAccessDeps & { fetchImpl: jest.Mock };
}

describe('probeAuthoredContentAccess', () => {
    it('asks DA.live to LIST the site with the SC\'s own DA.live token', async () => {
        const d = deps();

        await probeAuthoredContentAccess(TARGET, d, createMockLogger());

        expect(d.fetchImpl).toHaveBeenCalledTimes(1);
        const [url, init] = d.fetchImpl.mock.calls[0];
        expect(url).toBe('https://admin.da.live/list/kmanns/justrite/');
        expect(init).toEqual(
            expect.objectContaining({
                method: 'GET',
                headers: { Authorization: 'Bearer fake-test-token-not-a-secret' },
            }),
        );
    });

    it('a 200 means the SC can read the authored site', async () => {
        const result = await probeAuthoredContentAccess(TARGET, deps({ status: 200 }), createMockLogger());

        expect(result).toEqual({ level: 'authored' });
    });

    it('a 403 means published pages only, and names the SC who needs the grant', async () => {
        const result = await probeAuthoredContentAccess(TARGET, deps({ status: 403 }), createMockLogger());

        expect(result).toEqual({ level: 'published-only', reader: 'sc@example.com' });
    });

    it('with no DA.live sign-in it asks nothing and says it could not check', async () => {
        const d = deps({ getAccessToken: jest.fn().mockResolvedValue(null) });

        const result = await probeAuthoredContentAccess(TARGET, d, createMockLogger());

        expect(result).toEqual({ level: 'not-signed-in' });
        expect(d.fetchImpl).not.toHaveBeenCalled();
    });

    it('a 401 is the sign-in being refused, not a missing grant', async () => {
        const result = await probeAuthoredContentAccess(TARGET, deps({ status: 401 }), createMockLogger());

        expect(result).toEqual({ level: 'not-signed-in' });
    });

    it('any other answer, or no answer, is unknown rather than a verdict', async () => {
        expect(await probeAuthoredContentAccess(TARGET, deps({ status: 500 }), createMockLogger())).toEqual({
            level: 'unknown',
        });
        const failing = deps();
        failing.fetchImpl.mockRejectedValue(new Error('network down'));
        expect(await probeAuthoredContentAccess(TARGET, failing, createMockLogger())).toEqual({ level: 'unknown' });
    });

    it('encodes the org and site into the path', async () => {
        const d = deps();

        await probeAuthoredContentAccess({ org: 'a b', site: 'c/d' }, d, createMockLogger());

        expect(d.fetchImpl.mock.calls[0][0]).toBe('https://admin.da.live/list/a%20b/c%2Fd/');
    });
});

describe('authoredAccessWarning', () => {
    it('says exactly who grants what when only published pages can be read', () => {
        const text = authoredAccessWarning({ level: 'published-only', reader: 'sc@example.com' }, TARGET);

        expect(text).toBe(
            "You can copy this demo's published pages only. To copy its block library and unpublished " +
                'pages too, ask the owner of kmanns on DA.live to let sc@example.com read justrite. ' +
                'In Demo Builder that is Manage Site Access, then "Let someone read the authored content".',
        );
    });

    it('falls back to "you" when the SC\'s address is unknown', () => {
        const text = authoredAccessWarning({ level: 'published-only', reader: null }, TARGET);

        expect(text).toContain('to let you read justrite');
    });

    it('says nothing for any other level', () => {
        expect(authoredAccessWarning({ level: 'authored' }, TARGET)).toBeUndefined();
        expect(authoredAccessWarning({ level: 'not-signed-in' }, TARGET)).toBeUndefined();
        expect(authoredAccessWarning({ level: 'unknown' }, TARGET)).toBeUndefined();
    });
});
