/**
 * The agent-operation notifier — visibility slice of the consent/visibility
 * design. Progress wraps the call; the OUTCOME lands in the window (quiet
 * status bar on success, warning toast on failure) because the agent's own
 * report may never reach the user.
 */

const mockWithProgress = jest.fn(
    async (_opts: unknown, task: () => Promise<unknown>) => task()
);
const mockSetStatusBarMessage = jest.fn();
const mockShowWarningMessage = jest.fn();
const mockGetConfiguration = jest.fn();

jest.mock(
    'vscode',
    () => ({
        window: {
            withProgress: (...a: unknown[]) =>
                mockWithProgress(...(a as [unknown, () => Promise<unknown>])),
            setStatusBarMessage: (...a: unknown[]) => mockSetStatusBarMessage(...a),
            showWarningMessage: (...a: unknown[]) => mockShowWarningMessage(...a),
        },
        workspace: {
            getConfiguration: (...a: unknown[]) => mockGetConfiguration(...a),
        },
        ProgressLocation: { Notification: 15 },
    }),
    { virtual: true }
);

import {
    createAgentConsentGate,
    createAgentOperationNotifier,
} from '@/features/ai/server/agentOperationNotifier';
import type { Logger } from '@/types/logger';

const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
} as unknown as Logger;

beforeEach(() => jest.clearAllMocks());

describe('createAgentOperationNotifier', () => {
    it('wraps the call in a named progress notification and returns its result', async () => {
        const notifier = createAgentOperationNotifier(logger);

        const result = await notifier('sync_storefront', async () => ({ ok: true }));

        expect(result).toEqual({ ok: true });
        expect(mockWithProgress).toHaveBeenCalledWith(
            expect.objectContaining({ title: expect.stringContaining('Sync storefront') }),
            expect.any(Function)
        );
        expect(mockSetStatusBarMessage).toHaveBeenCalledWith(
            expect.stringContaining('Sync storefront completed'),
            expect.any(Number)
        );
        expect(mockShowWarningMessage).not.toHaveBeenCalled();
    });

    it('lands a failure as a warning toast and rethrows', async () => {
        const notifier = createAgentOperationNotifier(logger);

        await expect(
            notifier('republish', async () => {
                throw new Error('CDN said no');
            })
        ).rejects.toThrow('CDN said no');

        expect(mockShowWarningMessage).toHaveBeenCalledWith(
            expect.stringContaining('"Republish" failed: CDN said no')
        );
        expect(mockSetStatusBarMessage).not.toHaveBeenCalled();
    });
});


describe('createAgentConsentGate', () => {
    /** Point the mocked config at a fixed consent-setting value. */
    function settingIs(value: boolean): void {
        mockGetConfiguration.mockReturnValue({
            get: jest.fn((key: string, dflt: unknown) =>
                key === 'ai.requireAgentConsent' ? value : dflt
            ),
        });
    }

    it('allows without any dialog when the setting is off (the headless escape hatch)', async () => {
        settingIs(false);
        const gate = createAgentConsentGate(logger);

        const verdict = await gate('delete_page', { path: '/x', confirm: true });

        expect(verdict).toEqual({ allowed: true });
        expect(mockShowWarningMessage).not.toHaveBeenCalled();
    });

    it('titles the dialog with AUTHORED copy, not the tool name', async () => {
        // delete_project's authored action is "Delete this project" — the tool
        // name would have read "Delete project", and the description would have
        // dragged in agent guidance behind it.
        settingIs(true);
        mockShowWarningMessage.mockResolvedValue('Allow');
        const gate = createAgentConsentGate(logger);

        await gate('delete_project', { confirm: true });

        expect(String(mockShowWarningMessage.mock.calls[0][0])).toBe(
            'Demo Builder: Delete this project?'
        );
    });

    it('states the CONSEQUENCE, and never the agent-facing description', async () => {
        settingIs(true);
        mockShowWarningMessage.mockResolvedValue('Allow');
        const gate = createAgentConsentGate(logger);

        // A description is still passed; it must not reach the dialog. Four
        // passes of transforming it still produced text a producer should not
        // have been shown, which is why the copy is authored instead.
        await gate(
            'delete_github_repo',
            { confirm: true },
            'Permanently delete a GitHub repository (irreversible). Requires confirm:true.'
        );

        const detail = String(
            (mockShowWarningMessage.mock.calls[0][1] as { detail?: string }).detail
        );
        expect(detail).toContain("Deletes the repository and its history on GitHub.");
        expect(detail).toContain("can't be undone");
        expect(detail).not.toContain('confirm:true');
        expect(detail).not.toContain('Permanently delete a GitHub repository');
    });

    it('says what is irreversible in plain words, not in a parenthetical', async () => {
        // "(irreversible)" survived every mechanical rule precisely because it
        // mattered. Authored copy says it as a sentence instead.
        settingIs(true);
        mockShowWarningMessage.mockResolvedValue('Allow');
        const gate = createAgentConsentGate(logger);

        await gate('cleanup_dalive_site', { confirm: true });

        const detail = String(
            (mockShowWarningMessage.mock.calls[0][1] as { detail?: string }).detail
        );
        expect(detail).toContain("can't be undone");
        expect(detail).not.toContain('(irreversible)');
    });

    it('falls back to the humanised name when nobody has written copy', async () => {
        // An unwritten tool must be no worse than it is today -- never blank.
        settingIs(true);
        mockShowWarningMessage.mockResolvedValue('Allow');
        const gate = createAgentConsentGate(logger);

        await gate('some_unwritten_tool', { confirm: true });

        expect(String(mockShowWarningMessage.mock.calls[0][0])).toBe(
            'Demo Builder: Some unwritten tool?'
        );
    });


    it('labels the proof-of-intent echo as a Name, not confirmName', async () => {
        settingIs(true);
        mockShowWarningMessage.mockResolvedValue('Allow');
        const gate = createAgentConsentGate(logger);

        await gate('start_demo', { confirm: true, confirmName: 'bodea' });

        const detail = String(
            (mockShowWarningMessage.mock.calls[0][1] as { detail?: string }).detail
        );
        expect(detail).toContain('Name: bodea');
        expect(detail).not.toContain('confirmName');
    });

    it('answers a ready refusal envelope when the dialog is dismissed or declined', async () => {
        settingIs(true);
        mockShowWarningMessage.mockResolvedValue(undefined);
        const gate = createAgentConsentGate(logger);

        const verdict = await gate('reset_eds_project', { projectName: 'demo', confirm: true });

        expect(verdict.allowed).toBe(false);
        const text = (verdict as { refusal: { content: Array<{ text: string }> } }).refusal
            .content[0].text;
        expect(text).toContain('declined');
        expect(text).toContain('reset_eds_project');
        expect(text).toContain('demoBuilder.ai.requireAgentConsent');
    });

    it('renders scalar args for informed consent — confirm skipped, secrets masked, long values truncated', async () => {
        settingIs(true);
        mockShowWarningMessage.mockResolvedValue('Allow');
        const gate = createAgentConsentGate(logger);

        await gate('promote_block_to_library', {
            confirm: true,
            blockId: 'hero',
            githubToken: 'ghp_secret_value',
            unsafeHTML: `<div>${'x'.repeat(200)}</div>`,
            nested: { not: 'shown' },
        });

        const [, opts] = mockShowWarningMessage.mock.calls[0];
        const detail = String((opts as { detail?: string }).detail);
        // Labels, not schema field names — a producer approving this should not
        // have to decode `blockId`. Masking still keys off the RAW name, so a
        // friendlier label must never widen what is shown.
        expect(detail).toContain('Block id: hero');
        expect(detail).not.toContain('blockId:');
        expect(detail).not.toContain('confirm');
        expect(detail).toContain('Github token: ***');
        expect(detail).not.toContain('ghp_secret_value');
        expect(detail).not.toContain('x'.repeat(100));
        expect(detail).not.toContain('not: shown');
    });
});
