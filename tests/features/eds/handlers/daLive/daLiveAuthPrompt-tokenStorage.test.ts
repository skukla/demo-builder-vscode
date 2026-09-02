/**
 * WHAT ACTUALLY GETS STORED when a DA.live sign-in succeeds, and for how long.
 *
 * The stored expiry is what every later check reads to decide whether the session is
 * still good. Nothing asserted it: the existing success test checks the email and the
 * namespace and passes whatever expiry the code chose.
 *
 * BOTH WAYS A TOKEN ARRIVES NOW APPLY THE SAME CHECK. They did not always: a token
 * stating no lifetime was refused when pasted from the clipboard and accepted when typed,
 * then stored with an invented 24-hour expiry. That expiry was load-bearing in the wrong
 * direction — everything downstream reads it to decide when to re-authenticate, so a
 * token with minutes left was treated as good for a day and operations failed mid-flight
 * instead of prompting a clean sign-in. Tightened 2026-09-02 on the owner's call.
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

    it('refuses a typed token that states no lifetime, storing nothing', async () => {
        // The same answer the clipboard path has always given. Storing it would mean
        // inventing an expiry, and an invented expiry is worse than no credential: it is
        // believed.
        const noLifetime = makeDaLiveToken({ client_id: 'darkalley', email: 'user@example.com' });

        const result = await signInWith(noLifetime);

        expect(mockStoreToken).not.toHaveBeenCalled();
        expect(result).toMatchObject({ success: false });
        expect(String((result as { error?: string }).error)).toMatch(/no expiry/i);
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
