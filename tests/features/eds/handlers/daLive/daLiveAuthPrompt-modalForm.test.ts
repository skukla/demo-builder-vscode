/**
 * Signing in to DA.live inside the progress modal (owner, 2026-09-20: "the modal
 * should own the form elements").
 *
 * The input-box flow asks four things in sequence because a VS Code input box can
 * only ask one at a time. A form has no such limit, so under a modal this asks once
 * and re-asks with what was typed when something is wrong.
 *
 * The assertions drive the REAL loop through a fake modal — answering each ask the
 * way an SC would — because what matters is the sequence it produces, and a mock of
 * the ask helper would only prove the mock.
 */

import * as vscode from 'vscode';
import { withModalAsking } from '@/core/vscode/operationPrompt';
import type { OperationPrompt } from '@/types/webviewPayloads';
import { createMockExtensionContext } from '../../../../helpers/extensionContextFake';
import { createMockLogger } from '../../../../helpers/loggerFake';

const mockStoreToken = jest.fn();
const mockGetOrgName = jest.fn();
jest.mock('@/features/eds/handlers/edsServiceCache', () => ({
    getDaLiveAuthService: () => ({
        getOrgName: () => mockGetOrgName(),
        storeToken: (...args: unknown[]) => mockStoreToken(...args),
        isAuthenticated: jest.fn().mockResolvedValue(false),
    }),
}));

// The questions the modal was asked, and what the "SC" answers to each in turn.
const asked: OperationPrompt[] = [];
let answers: Array<{ action?: string; values: Record<string, string> }> = [];

jest.mock('@/core/vscode/operationProgress', () => ({
    heldProgress: () => ({ id: 'op', state: 'running', stage: 'Checking requirements' }),
    pushOperationProgress: jest.fn(),
    startModalRun: jest.fn(),
}));

import { showDaLiveAuthQuickPick } from '@/features/eds/handlers/daLive/daLiveAuthPrompt';
import { answerOperationPrompt } from '@/core/vscode/operationPrompt';
import { pushOperationProgress } from '@/core/vscode/operationProgress';

/**
 * Answer each question as it arrives. Real ask, real loop: the push is intercepted,
 * the queued answer is handed back on the next tick.
 */
function actAsTheSC(): void {
    (pushOperationProgress as jest.Mock).mockImplementation(async (payload) => {
        if (!payload.prompt) return;
        asked.push(payload.prompt);
        const next = answers.shift() ?? { action: undefined, values: {} };
        setImmediate(() => answerOperationPrompt(payload.id, next.action, next.values));
    });
}

// The canonical fakes rather than a cast: `as never` on an argument silences the one
// check that would catch a wrong-shaped call (ADR-016 rule 2).
const context = () => ({ context: createMockExtensionContext(), logger: createMockLogger() });

/** A token whose payload states a real expiry, as the strict check demands. */
function freshToken(): string {
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const body = Buffer.from(
        JSON.stringify({
            client_id: 'darkalley',
            email: 'sc@example.com',
            created_at: Date.now(),
            expires_in: 3_600_000,
        }),
    ).toString('base64url');
    return `eyJ${header.slice(3)}.${body}.sig`;
}

beforeEach(() => {
    jest.clearAllMocks();
    asked.length = 0;
    answers = [];
    mockGetOrgName.mockReturnValue(undefined);
    actAsTheSC();
});

it('asks for the namespace and the token in one form, and stores what it is given', async () => {
    const token = freshToken();
    answers = [{ action: 'Sign In', values: { orgName: 'acme', token } }];

    const result = await withModalAsking('op', () => showDaLiveAuthQuickPick(context()));

    expect(asked).toHaveLength(1);
    expect(asked[0].fields?.map((field) => field.id)).toEqual(['orgName', 'token']);
    // The token is a credential: the field says so, and the modal masks it.
    expect(asked[0].fields?.find((field) => field.id === 'token')?.secret).toBe(true);
    expect(mockStoreToken).toHaveBeenCalledWith(
        token,
        expect.objectContaining({ orgName: 'acme' }),
    );
    expect(result.success).toBe(true);
    // No input box anywhere: the modal owns the form.
    expect(vscode.window.showInputBox).not.toHaveBeenCalled();
});

it('heads the form with why it is asking', async () => {
    answers = [{ action: undefined, values: {} }];

    await withModalAsking('op', () =>
        showDaLiveAuthQuickPick(context(), 'Your DA.live session has expired.'),
    );

    expect(asked[0].message).toContain('Your DA.live session has expired.');
});

it('opens da.live and asks again, keeping what was already typed', async () => {
    answers = [
        { action: 'Open DA.live', values: { orgName: 'acme', token: '' } },
        { action: undefined, values: {} },
    ];

    await withModalAsking('op', () => showDaLiveAuthQuickPick(context()));

    expect(vscode.env.openExternal).toHaveBeenCalledTimes(1);
    // da.live itself, where the bookmarklet runs.
    expect((vscode.env.openExternal as jest.Mock).mock.calls[0][0].toString()).toBe('https://da.live');
    expect(asked).toHaveLength(2);
    expect(asked[1].fields?.find((field) => field.id === 'orgName')?.value).toBe('acme');
});

it('says what is missing under the field, rather than starting over', async () => {
    answers = [
        { action: 'Sign In', values: { orgName: '', token: '' } },
        { action: undefined, values: {} },
    ];

    await withModalAsking('op', () => showDaLiveAuthQuickPick(context()));

    const second = asked[1].fields ?? [];
    expect(second.find((field) => field.id === 'orgName')?.description).toBe(
        'Enter your DA.live namespace.',
    );
    expect(second.find((field) => field.id === 'token')?.description).toBe(
        'Paste the token the bookmarklet copied.',
    );
    expect(mockStoreToken).not.toHaveBeenCalled();
});

it('re-asks with the reason when the token is refused, and opens no error popup', async () => {
    answers = [
        { action: 'Sign In', values: { orgName: 'acme', token: 'not-a-token' } },
        { action: undefined, values: {} },
    ];

    await withModalAsking('op', () => showDaLiveAuthQuickPick(context()));

    // The strict check's own reason, not the generic fallback.
    expect(asked[1].fields?.find((field) => field.id === 'token')?.description).toBe(
        'Invalid token format. Please copy the complete token.',
    );
    // The modal already says it, under the field it belongs to.
    expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
});

it('starts from the pinned namespace, so a re-sign-in only needs the token', async () => {
    mockGetOrgName.mockReturnValue('acme');
    answers = [{ action: undefined, values: {} }];

    await withModalAsking('op', () => showDaLiveAuthQuickPick(context()));

    expect(asked[0].fields?.find((field) => field.id === 'orgName')?.value).toBe('acme');
});

it('reads a dismissal as cancelled, storing nothing', async () => {
    answers = [{ action: undefined, values: { orgName: 'acme', token: freshToken() } }];

    const result = await withModalAsking('op', () => showDaLiveAuthQuickPick(context()));

    expect(result).toEqual({ success: false, cancelled: true });
    expect(mockStoreToken).not.toHaveBeenCalled();
});

/** What the SC sees in a field of the question asked at `index`. */
function field(index: number, id: string) {
    return asked[index].fields?.find((candidate) => candidate.id === id);
}

it('starts with empty fields and offers Sign In and Open DA.live', async () => {
    answers = [{ action: undefined, values: {} }];

    await withModalAsking('op', () => showDaLiveAuthQuickPick(context()));

    expect(asked[0].message).toBe(
        'Sign in to DA.live: run the bookmarklet on da.live to copy a token, then paste it here.',
    );
    expect(field(0, 'orgName')?.value).toBe('');
    expect(field(0, 'token')?.value).toBe('');
    expect(asked[0].actions).toEqual(['Sign In', 'Open DA.live']);
});

it('puts the reason and the instruction one space apart', async () => {
    answers = [{ action: undefined, values: {} }];

    await withModalAsking('op', () => showDaLiveAuthQuickPick(context(), 'Expired.'));

    expect(asked[0].message).toBe(
        'Expired. Sign in to DA.live: run the bookmarklet on da.live to copy a token, then paste it here.',
    );
});

it('brings back the token the bookmarklet copied after the trip to da.live', async () => {
    const token = freshToken();
    (vscode.env.clipboard.readText as jest.Mock).mockResolvedValueOnce(token);
    answers = [
        { action: 'Open DA.live', values: { orgName: 'acme', token: '' } },
        { action: undefined, values: {} },
    ];

    await withModalAsking('op', () => showDaLiveAuthQuickPick(context()));

    expect(field(1, 'token')?.value).toBe(token);
});

it('treats a namespace of spaces as missing, storing nothing', async () => {
    answers = [
        { action: 'Sign In', values: { orgName: '   ', token: freshToken() } },
        { action: undefined, values: {} },
    ];

    await withModalAsking('op', () => showDaLiveAuthQuickPick(context()));

    expect(field(1, 'orgName')?.description).toBe('Enter your DA.live namespace.');
    expect(mockStoreToken).not.toHaveBeenCalled();
});

it('treats a token of spaces as missing, not as a malformed token', async () => {
    answers = [
        { action: 'Sign In', values: { orgName: 'acme', token: '   ' } },
        { action: undefined, values: {} },
    ];

    await withModalAsking('op', () => showDaLiveAuthQuickPick(context()));

    expect(field(1, 'token')?.description).toBe('Paste the token the bookmarklet copied.');
});

it('names only the field that is missing', async () => {
    answers = [
        { action: 'Sign In', values: { orgName: 'acme', token: '' } },
        { action: undefined, values: {} },
    ];

    await withModalAsking('op', () => showDaLiveAuthQuickPick(context()));

    expect(field(1, 'orgName')?.description).toBeUndefined();
    expect(field(1, 'token')?.description).toBe('Paste the token the bookmarklet copied.');
});

it('says under the token field when storing it fails, and opens no popup', async () => {
    mockStoreToken.mockRejectedValueOnce(new Error('keychain is locked'));
    answers = [
        { action: 'Sign In', values: { orgName: 'acme', token: freshToken() } },
        { action: undefined, values: {} },
    ];

    await withModalAsking('op', () => showDaLiveAuthQuickPick(context()));

    expect(field(1, 'token')?.description).toBe('keychain is locked');
    expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
});

it('says "Unknown error" when storing fails with something that is not an Error', async () => {
    mockStoreToken.mockRejectedValueOnce('a bare string');
    answers = [
        { action: 'Sign In', values: { orgName: 'acme', token: freshToken() } },
        { action: undefined, values: {} },
    ];

    await withModalAsking('op', () => showDaLiveAuthQuickPick(context()));

    expect(field(1, 'token')?.description).toBe('Unknown error');
});
