/**
 * The NOTIFICATIONS the DA.live sign-in flow puts in front of the SC, and the
 * options it opens them with.
 *
 * Two of these are load-bearing in a way the copy does not show:
 *
 *   - both info messages are MODALS with a heading (owner, 2026-10-31: the
 *     corner notifications read as the old flow). A modal blocks only the VS
 *     Code window, and the SC is in the browser while it waits.
 *   - the second message is the consent gate for reading the clipboard.
 *     Nothing before it touches the clipboard, so backing out here must end
 *     the flow rather than fall through to a clipboard read.
 *
 * The scenario scripting for `vscode` is local, for the reason the family
 * harness records: each suite drives a different script.
 */

let showInfoMessageCalls: Array<[string, { modal?: boolean; detail?: string }, ...string[]]> = [];
let showInfoMessageResponses: Array<string | undefined> = [];
let showInfoMessageIndex = 0;
let withProgressOptions: Array<{ location?: number; title?: string; cancellable?: boolean }> = [];

jest.mock('vscode', () => ({
    window: {
        showInputBox: jest.fn().mockResolvedValue(undefined),
        showInformationMessage: jest
            .fn()
            .mockImplementation((message: string, options: object, ...actions: string[]) => {
                showInfoMessageCalls.push([message, options, ...actions]);
                const response = showInfoMessageResponses[showInfoMessageIndex];
                showInfoMessageIndex++;
                return Promise.resolve(response);
            }),
        showErrorMessage: jest.fn(),
        showWarningMessage: jest.fn(),
        setStatusBarMessage: jest.fn().mockReturnValue({ dispose: jest.fn() }),
        withProgress: jest.fn().mockImplementation((options, cb) => {
            withProgressOptions.push(options);
            return cb();
        }),
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
            // Pinned, so the org box never opens and the info messages are the
            // only interaction these tests have to script.
            getOrgName: jest.fn().mockReturnValue('my-org'),
        })),
    };
});

import * as vscode from 'vscode';
import {
    showDaLiveAuthQuickPick,
    createAuthPromptContext,
    makeDaLiveToken,
} from './daLiveAuthPrompt.testUtils';

const liveToken = makeDaLiveToken({
    client_id: 'darkalley',
    created_at: '9999999999999',
    expires_in: '3600000',
    email: 'user@example.com',
});

beforeEach(() => {
    jest.clearAllMocks();
    showInfoMessageCalls = [];
    showInfoMessageResponses = [];
    showInfoMessageIndex = 0;
    withProgressOptions = [];
});

describe('the "get a token" gate', () => {
    it('is a modal headed "Sign in to DA.live", with the sentence under it', async () => {
        showInfoMessageResponses = [undefined];

        await showDaLiveAuthQuickPick(createAuthPromptContext());

        const [title, options, ...actions] = showInfoMessageCalls[0];
        expect(title).toBe('Sign in to DA.live');
        expect(options).toEqual({ modal: true, detail: expect.stringContaining('token from DA.live') });
        expect(actions).toEqual(['Open DA.live', 'I have my token']);
    });

    it('ends the flow when the SC dismisses it, without reaching for the clipboard', async () => {
        // Dismissal is a refusal, not a "carry on" — this click is also the
        // consent to read the clipboard, so falling through would read it
        // without being asked.
        showInfoMessageResponses = [undefined];

        const result = await showDaLiveAuthQuickPick(createAuthPromptContext());

        expect(result).toEqual({ success: false, cancelled: true });
        expect(vscode.env.clipboard.readText).not.toHaveBeenCalled();
        expect(vscode.window.showInputBox).not.toHaveBeenCalled();
    });

    it('goes straight on when the SC already holds a token', async () => {
        showInfoMessageResponses = ['I have my token'];

        await showDaLiveAuthQuickPick(createAuthPromptContext());

        expect(vscode.env.openExternal).not.toHaveBeenCalled();
        expect(showInfoMessageCalls).toHaveLength(1);
    });
});

describe('the post-browser "Continue" gate', () => {
    it('is a modal too, still there when the SC comes back from the browser', async () => {
        showInfoMessageResponses = ['Open DA.live', undefined];

        await showDaLiveAuthQuickPick(createAuthPromptContext());

        const [title, options] = showInfoMessageCalls[1];
        expect(title).toBe('Copy your DA.live token');
        expect(options).toEqual({ modal: true, detail: expect.stringContaining('bookmarklet') });
    });

    it('ends the flow when the SC backs out after the browser trip', async () => {
        showInfoMessageResponses = ['Open DA.live', undefined];

        const result = await showDaLiveAuthQuickPick(createAuthPromptContext());

        // da.live itself, where the bookmarklet runs.
        expect(vscode.env.openExternal).toHaveBeenCalledWith({ url: 'https://da.live' });
        expect(result).toEqual({ success: false, cancelled: true });
        expect(vscode.env.clipboard.readText).not.toHaveBeenCalled();
    });
});

describe('the verification progress notification', () => {
    it('is a non-cancellable notification, titled for what it is doing', async () => {
        // Not cancellable: the token is already in hand and storing it is
        // quick. A cancel button here would offer to abandon a sign-in
        // half-way through writing the credential.
        showInfoMessageResponses = ['I have my token'];
        (vscode.window.showInputBox as jest.Mock).mockResolvedValueOnce(liveToken);

        await showDaLiveAuthQuickPick(createAuthPromptContext());

        expect(withProgressOptions[0]).toEqual({
            location: 15,
            title: 'Verifying DA.live credentials',
            cancellable: false,
        });
    });
});
