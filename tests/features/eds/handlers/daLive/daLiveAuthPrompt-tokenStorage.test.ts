/**
 * WHAT ACTUALLY GETS STORED when a DA.live sign-in succeeds, and for how long.
 *
 * The stored expiry is what every later check reads to decide whether the session is
 * still good. Nothing asserted it: the existing success test checks the email and the
 * namespace and passes whatever expiry the code chose.
 *
 * This also pins an ASYMMETRY between the two ways a token arrives, which is recorded in
 * .rptc/handoff/2026-09-02-equivalent-mutants.md as a decision rather than a defect:
 *
 *   - from the CLIPBOARD, the strict check refuses a token that states no lifetime, on
 *     the grounds that it cannot be stored safely
 *   - TYPED into the box, the same token is accepted and stored with an invented
 *     24-hour lifetime
 *
 * The tests below describe today's behaviour on both paths. If the typed path is
 * tightened to match, the second one is the test to change, and it says so.
 */

let showInputBoxResponses: Array<string | undefined> = [];
let showInputBoxIndex = 0;

jest.mock('vscode', () => ({
    window: {
        showInputBox: jest.fn().mockImplementation(() => {
            const response = showInputBoxResponses[showInputBoxIndex];
            showInputBoxIndex++;
            return Promise.resolve(response);
        }),
        showInformationMessage: jest.fn().mockResolvedValue('I have my token'),
        showErrorMessage: jest.fn(),
        showWarningMessage: jest.fn(),
        setStatusBarMessage: jest.fn().mockReturnValue({ dispose: jest.fn() }),
        withProgress: jest.fn().mockImplementation((_o, cb) => cb()),
    },
    env: { openExternal: jest.fn(), clipboard: { readText: jest.fn().mockResolvedValue('') } },
    Uri: { parse: jest.fn((url: string) => ({ url })) },
    ProgressLocation: { Notification: 15 },
}));

const mockStoreToken = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/eds/services/daLive/daLiveAuthService', () => {
    const actual = jest.requireActual('@/features/eds/services/daLive/daLiveAuthService');
    return {
        ...actual,
        DaLiveAuthService: jest.fn().mockImplementation(() => ({
            storeToken: mockStoreToken,
            isAuthenticated: jest.fn().mockResolvedValue(true),
            getOrgName: jest.fn().mockReturnValue(undefined),
        })),
    };
});

import {
    showDaLiveAuthQuickPick,
    createAuthPromptContext,
    makeDaLiveToken,
} from './daLiveAuthPrompt.testUtils';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Type an org and then a token into the two boxes. */
async function signInWith(token: string) {
    showInputBoxIndex = 0;
    showInputBoxResponses = ['my-org', token];
    return showDaLiveAuthQuickPick(createAuthPromptContext());
}

/** The options `storeToken` was called with. */
function stored(): { expiresAt: number; email?: string; orgName?: string } {
    return mockStoreToken.mock.calls[0][1];
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('the expiry a stored DA.live token carries', () => {
    it("uses the token's own expiry when it states one", async () => {
        // created_at + expires_in, both in milliseconds — the sum is the expiry.
        const token = makeDaLiveToken({
            client_id: 'darkalley',
            created_at: '9999999999999',
            expires_in: '3600000',
            email: 'user@example.com',
        });

        await signInWith(token);

        expect(stored().expiresAt).toBe(9999999999999 + 3600000);
    });

    it('invents a 24-hour lifetime for a typed token that states none', async () => {
        // See the file header: the CLIPBOARD path refuses this same token outright. This
        // test describes the typed path as it is today — change it if that is tightened.
        const noLifetime = makeDaLiveToken({ client_id: 'darkalley', email: 'user@example.com' });
        const before = Date.now();

        await signInWith(noLifetime);

        const expiry = stored().expiresAt;
        expect(expiry).toBeGreaterThanOrEqual(before + ONE_DAY_MS);
        expect(expiry).toBeLessThanOrEqual(Date.now() + ONE_DAY_MS);
    });

    it('stores the namespace and the identity alongside the expiry', async () => {
        const token = makeDaLiveToken({
            client_id: 'darkalley',
            created_at: '9999999999999',
            expires_in: '3600000',
            email: 'user@example.com',
        });

        await signInWith(token);

        expect(stored()).toMatchObject({ orgName: 'my-org', email: 'user@example.com' });
    });
});

describe('when storing the token fails', () => {
    it('reports the failure instead of claiming a successful sign-in', async () => {
        // Secret storage can refuse — a locked keychain, a denied prompt. Reporting
        // success here would leave the user believing they are signed in.
        mockStoreToken.mockRejectedValueOnce(new Error('keychain is locked'));
        const token = makeDaLiveToken({
            client_id: 'darkalley',
            created_at: '9999999999999',
            expires_in: '3600000',
        });

        const result = await signInWith(token);

        expect(result).toMatchObject({ success: false, error: 'keychain is locked' });
    });
});
