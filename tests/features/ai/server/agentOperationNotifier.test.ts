/**
 * The agent-operation notifier — visibility slice of the consent/visibility
 * design. Progress wraps the call; the OUTCOME lands in the window (quiet
 * status bar on success, warning toast on failure) because the agent's own
 * report may never reach the user.
 */

const mockWithProgress = jest.fn(async (_opts: unknown, task: () => Promise<unknown>) => task());
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
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
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
        // The AUTHORED phrase, not a transform of `sync_storefront`. The old
        // wording was "Sync storefront", which is ambiguous with sync_content
        // (this one pushes code to git; that one publishes to the CDN) — a
        // confusion `agentAlertCopy` already records for the consent dialog.
        expect(mockWithProgress).toHaveBeenCalledWith(
            expect.objectContaining({
                title: expect.stringContaining('Pushing the storefront code to GitHub'),
            }),
            expect.any(Function)
        );
        expect(mockSetStatusBarMessage).toHaveBeenCalledWith(
            expect.stringContaining('Pushing the storefront code to GitHub — done'),
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

        // "Republish" alone never said republish WHAT — the single worst line
        // the 2026-08-25 narration audit found.
        expect(mockShowWarningMessage).toHaveBeenCalledWith(
            expect.stringContaining('Republishing the storefront configuration failed: CDN said no')
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
        expect(detail).toContain('Deletes the repository and its history on GitHub.');
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

    it('falls back to the BARE TOOL NAME when nobody has written copy', async () => {
        // This used to assert a humanised name derived from the tool id. That
        // derivation is gone: a 2026-08-25 audit found it produced "Set project
        // pinned…", "Set setting…" and "Republish…" (republish WHAT?), so the
        // words a person reads are now authored per tool and there is no
        // transform to fall back to.
        //
        // The bare id is the deliberate replacement. It is visibly a fallback
        // rather than prose pretending to be authored copy — and unreachable in
        // practice, since AGENT_ALERT_COPY membership is what makes this gate
        // fire at all.
        settingIs(true);
        mockShowWarningMessage.mockResolvedValue('Allow');
        const gate = createAgentConsentGate(logger);

        await gate('some_unwritten_tool', { confirm: true });

        expect(String(mockShowWarningMessage.mock.calls[0][0])).toBe(
            'Demo Builder: some_unwritten_tool?'
        );
    });

    it('shows the target the reader can CHECK, and hides the id they cannot', async () => {
        // The headline fix. This dialog used to print every scalar the schema
        // declared, in declaration order, so it led with a 19-digit Console id
        // and pushed the project's name to second place. Nobody can verify an
        // id against anything; everybody can verify a name.
        settingIs(true);
        mockShowWarningMessage.mockResolvedValue('Allow');
        const gate = createAgentConsentGate(logger);

        await gate('delete_adobe_project', {
            confirm: true,
            projectId: '4566206088344572345',
            projectName: 'bodea',
        });

        const detail = String(
            (mockShowWarningMessage.mock.calls[0][1] as { detail?: string }).detail
        );
        expect(detail).toContain('Project: bodea');
        expect(detail).not.toContain('4566206088344572345');
    });

    it('names the open project when the tool takes no argument naming it', async () => {
        // `republish`, `sync_content` and `reset_eds_project` act on whatever is
        // open and declare no target argument. Without this the dialog would ask
        // someone to approve an unnamed thing.
        settingIs(true);
        mockShowWarningMessage.mockResolvedValue('Allow');
        const gate = createAgentConsentGate(logger);

        await gate('republish', { confirm: true });

        // State is unavailable in this harness, so the line is absent rather
        // than wrong — the gate must still appear. That fallback is the
        // behaviour under test as much as the happy path is.
        expect(mockShowWarningMessage).toHaveBeenCalledTimes(1);
        const detail = String(
            (mockShowWarningMessage.mock.calls[0][1] as { detail?: string }).detail
        );
        expect(detail).toContain('Pushes the current configuration live');
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

    it('times out an unanswered dialog into a "nobody answered" refusal — never hangs (AI-5)', async () => {
        // The measured failure: a headless agent's confirm-gated call raised a
        // modal nobody was watching and the await blocked for four minutes of
        // probe timeout with no log line. The gate must answer on its own.
        jest.useFakeTimers();
        try {
            settingIs(true);
            mockShowWarningMessage.mockReturnValue(new Promise(() => undefined)); // never answered
            const gate = createAgentConsentGate(logger);

            const pending = gate('reset_eds_project', { projectName: 'demo', confirm: true });
            await jest.advanceTimersByTimeAsync(TIMEOUTS.LONG);
            const verdict = await pending;

            expect(verdict.allowed).toBe(false);
            const text = (verdict as { refusal: { content: Array<{ text: string }> } }).refusal
                .content[0].text;
            expect(text).toContain('Nobody answered');
            expect(text).toContain('NOT run');
            expect(text).not.toContain('declined');
            // The wait names itself in the log BEFORE the dialog opens.
            expect(logger.info).toHaveBeenCalledWith(
                expect.stringContaining('awaiting the user consent dialog')
            );
        } finally {
            jest.useRealTimers();
        }
    });

    it('shows nothing but the target — not secrets, not flags, not structure', async () => {
        // The old contract rendered every scalar and masked the ones that looked
        // like credentials. The new one shows ONLY authored keys, so a secret is
        // excluded by construction rather than by a regex catching its name.
        // The mask stays as a second line of defence and is asserted separately.
        settingIs(true);
        mockShowWarningMessage.mockResolvedValue('Allow');
        const gate = createAgentConsentGate(logger);

        await gate('remove_block_from_library', {
            confirm: true,
            projectName: 'bodea',
            blockId: 'hero',
            githubToken: 'ghp_secret_value',
            unsafeHTML: `<div>${'x'.repeat(200)}</div>`,
            nested: { not: 'shown' },
        });

        const detail = String(
            (mockShowWarningMessage.mock.calls[0][1] as { detail?: string }).detail
        );
        // Labels, not schema field names — a producer approving this should not
        // have to decode `blockId`.
        expect(detail).toContain('Block id: hero');
        expect(detail).toContain('Project: bodea');
        expect(detail).not.toContain('blockId:');
        expect(detail).not.toContain('ghp_secret_value');
        expect(detail).not.toContain('confirm');
        expect(detail).not.toContain('x'.repeat(100));
        expect(detail).not.toContain('not: shown');
    });

    it('truncates a target value too long to read', async () => {
        settingIs(true);
        mockShowWarningMessage.mockResolvedValue('Allow');
        const gate = createAgentConsentGate(logger);

        await gate('delete_page', { confirm: true, path: `/products/${'x'.repeat(200)}` });

        const detail = String(
            (mockShowWarningMessage.mock.calls[0][1] as { detail?: string }).detail
        );
        expect(detail).toContain('chars)');
        expect(detail).not.toContain('x'.repeat(100));
    });
});
