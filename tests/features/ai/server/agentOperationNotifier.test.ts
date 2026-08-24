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

    it('raises a MODAL dialog and allows when the user picks Allow', async () => {
        settingIs(true);
        mockShowWarningMessage.mockResolvedValue('Allow');
        const gate = createAgentConsentGate(logger);

        const verdict = await gate('delete_page', { path: '/products/x', confirm: true });

        expect(verdict).toEqual({ allowed: true });
        const [message, opts] = mockShowWarningMessage.mock.calls[0];
        expect(String(message)).toContain('Delete page');
        expect(opts).toEqual(
            expect.objectContaining({ modal: true, detail: expect.stringContaining('/products/x') })
        );
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
        expect(detail).toContain('blockId: hero');
        expect(detail).not.toContain('confirm');
        expect(detail).toContain('githubToken: ***');
        expect(detail).not.toContain('ghp_secret_value');
        expect(detail).not.toContain('x'.repeat(100));
        expect(detail).not.toContain('not: shown');
    });
});
