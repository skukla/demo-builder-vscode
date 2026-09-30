/**
 * contentAccessManagerHeadless — the UI-free core behind "let a colleague read this
 * storefront's content" (EDS-22).
 *
 * The behaviour that matters, as for its site-access sibling: every mutation is
 * CONFIRMED by a re-read, "not signed in" is told apart from "refused", and the
 * grant hands the service the signed-in owner so an empty sheet never locks them out.
 * The service is mocked; assertions pin the ARGUMENTS it receives.
 */

const mockGetAccessToken = jest.fn();
const mockGetUserEmail = jest.fn();
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getDaLiveAuthService: jest.fn(() => ({
        getAccessToken: () => mockGetAccessToken(),
        getUserEmail: () => mockGetUserEmail(),
    })),
}));

const mockList = jest.fn();
const mockGrant = jest.fn();
const mockRevoke = jest.fn();
jest.mock('@/features/eds/services/daLive/daLiveConfigService', () => ({
    DaLiveConfigService: class {
        listContentReaders = (...a: unknown[]) => mockList(...a);
        grantContentRead = (...a: unknown[]) => mockGrant(...a);
        revokeContentRead = (...a: unknown[]) => mockRevoke(...a);
    },
}));

import {
    addContentReader,
    listContentReaders,
    removeContentReader,
} from '@/features/eds/services/daLive/contentAccessManagerHeadless';
import { createMockExtensionContext } from '../../../../helpers/extensionContextFake';
import { createMockLogger } from '../../../../helpers/loggerFake';

const TARGET = { org: 'kmanns', site: 'justrite' };
const READER = 'colleague@example.test';
const context = createMockExtensionContext();
const logger = createMockLogger();

beforeEach(() => {
    jest.clearAllMocks();
    mockGetAccessToken.mockResolvedValue('ims-token');
    mockGetUserEmail.mockResolvedValue('owner@example.test');
    mockList.mockResolvedValue([{ email: 'owner@example.test', actions: 'write' }]);
    mockGrant.mockResolvedValue({ success: true });
    mockRevoke.mockResolvedValue({ success: true });
});

describe('listContentReaders', () => {
    it('answers the readers with the target named', async () => {
        await expect(listContentReaders(TARGET, context, logger)).resolves.toEqual({
            status: 'ok',
            org: 'kmanns',
            site: 'justrite',
            readers: [{ email: 'owner@example.test', actions: 'write' }],
        });
        expect(mockList).toHaveBeenCalledWith('kmanns', 'justrite');
    });

    it('says no_credential, not refused, when there is no DA.live sign-in', async () => {
        mockGetAccessToken.mockResolvedValue(null);
        const out = await listContentReaders(TARGET, context, logger);
        expect(out.status).toBe('no_credential');
        expect(mockList).not.toHaveBeenCalled();
    });

    it("reads a 401 as not_authorized — an org this identity does not own", async () => {
        mockList.mockRejectedValue(new Error('Failed to read org config: 401 Unauthorized'));
        const out = await listContentReaders(TARGET, context, logger);
        expect(out).toMatchObject({ status: 'not_authorized', error: expect.stringContaining('401') });
    });

    it('reads any other failure as failed', async () => {
        mockList.mockRejectedValue(new Error('Config API error: socket hang up'));
        expect((await listContentReaders(TARGET, context, logger)).status).toBe('failed');
    });
});

describe('addContentReader', () => {
    it('grants with the signed-in owner named, then verifies by re-reading', async () => {
        mockList
            .mockResolvedValueOnce([{ email: 'owner@example.test', actions: 'write' }, { email: READER, actions: 'read' }]);

        const out = await addContentReader(TARGET, ` ${READER} `, context, logger);

        expect(mockGrant).toHaveBeenCalledWith('kmanns', 'justrite', READER, 'owner@example.test');
        expect(out).toEqual({
            status: 'ok',
            org: 'kmanns',
            site: 'justrite',
            readers: [{ email: 'owner@example.test', actions: 'write' }, { email: READER, actions: 'read' }],
            verified: true,
        });
    });

    it('reports verified:false when the re-read does not show the row', async () => {
        const out = await addContentReader(TARGET, READER, context, logger);
        expect(out.status).toBe('ok');
        expect(out.verified).toBe(false);
    });

    it('refuses a malformed address before touching anything', async () => {
        const out = await addContentReader(TARGET, 'not-an-email', context, logger);
        expect(out).toMatchObject({ status: 'invalid', verified: false });
        expect(mockGrant).not.toHaveBeenCalled();
    });

    it('passes a refused write through as not_authorized', async () => {
        mockGrant.mockResolvedValue({ success: false, error: 'Failed to update org config: 403 Forbidden' });
        const out = await addContentReader(TARGET, READER, context, logger);
        expect(out).toMatchObject({ status: 'not_authorized', verified: false });
    });
});

describe('removeContentReader', () => {
    it('revokes, then verifies the read row is gone while a write row may stay', async () => {
        mockList.mockResolvedValueOnce([{ email: 'owner@example.test', actions: 'write' }]);

        const out = await removeContentReader(TARGET, READER, context, logger);

        expect(mockRevoke).toHaveBeenCalledWith('kmanns', 'justrite', READER);
        expect(out).toMatchObject({ status: 'ok', verified: true });
    });

    it('is not verified while the read row is still there', async () => {
        mockList.mockResolvedValueOnce([{ email: READER, actions: 'read' }]);
        const out = await removeContentReader(TARGET, READER, context, logger);
        expect(out.verified).toBe(false);
    });
});
