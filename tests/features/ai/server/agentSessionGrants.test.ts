/**
 * "Don't ask again this session" — offered only where it is safe.
 *
 * WHY THIS EXISTS. Dialog fatigue is real: a single storefront flow can raise
 * the same prompt several times, and a person who clicks Allow four times stops
 * reading the fourth one. That is worse than not asking, because the gate is
 * then a formality.
 *
 * But a blanket "allow everything this session" would switch the gate off
 * exactly when the agent is doing most, and `demoBuilder.ai.requireAgentConsent`
 * already exists as the deliberate way to run unattended. So a grant is PER
 * TOOL, and only for tools that pass two tests:
 *
 *   1. repeating it is recoverable, and
 *   2. it does not reach another person.
 *
 * Reading all sixteen entries left exactly two. The test below asserts against
 * the AUTHORED copy rather than a list here, so adding an irreversible tool
 * cannot opt into grants by accident.
 */

import * as vscode from 'vscode';
import {
    createAgentConsentGate,
    clearSessionGrants,
} from '@/features/ai/server/agentOperationNotifier';
import { AGENT_ALERT_COPY } from '@/features/ai/server/agentAlertCopy';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../helpers/loggerFake';

jest.mock('vscode', () => ({
    window: { showWarningMessage: jest.fn(), setStatusBarMessage: jest.fn(), withProgress: jest.fn() },
    workspace: { getConfiguration: jest.fn() },
    ProgressLocation: { Notification: 15 },
}));

const mockShow = vscode.window.showWarningMessage as unknown as jest.Mock;
const mockConfig = vscode.workspace.getConfiguration as unknown as jest.Mock;
const logger = createMockLogger() as unknown as Logger;

/** Consent required, which is the default. */
function consentOn(): void {
    mockConfig.mockReturnValue({ get: () => true });
}

describe('session grants', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // mockReset, not clearAllMocks: an implementation set in one test
        // survives into the next, and the failure belongs elsewhere.
        mockShow.mockReset();
        clearSessionGrants();
        consentOn();
    });

    it('offers the grant on a repeatable tool', async () => {
        mockShow.mockResolvedValue('Allow');
        const gate = createAgentConsentGate(logger);

        await gate('republish', { confirm: true });

        const buttons = mockShow.mock.calls[0].slice(2);
        expect(buttons).toContain('Allow for the rest of this session');
    });

    it('does NOT offer it on anything irreversible', async () => {
        mockShow.mockResolvedValue('Allow');
        const gate = createAgentConsentGate(logger);

        await gate('delete_github_repo', { confirm: true });

        const buttons = mockShow.mock.calls[0].slice(2);
        expect(buttons).toEqual(['Allow']);
    });

    it('stops asking once granted', async () => {
        mockShow.mockResolvedValue('Allow for the rest of this session');
        const gate = createAgentConsentGate(logger);

        const first = await gate('republish', { confirm: true });
        const second = await gate('republish', { confirm: true });

        expect(first).toEqual({ allowed: true });
        expect(second).toEqual({ allowed: true });
        // The point of the grant: ONE dialog, two calls.
        expect(mockShow).toHaveBeenCalledTimes(1);
    });

    it('grants ONE tool, not the surface', async () => {
        // The failure a blanket grant would be. `sync_content` is also
        // grantable, so this proves the grant is keyed by tool rather than by
        // "the user said yes to something once".
        mockShow.mockResolvedValue('Allow for the rest of this session');
        const gate = createAgentConsentGate(logger);

        await gate('republish', { confirm: true });
        await gate('sync_content', { confirm: true });

        expect(mockShow).toHaveBeenCalledTimes(2);
    });

    it('a plain Allow does NOT create a grant', async () => {
        mockShow.mockResolvedValue('Allow');
        const gate = createAgentConsentGate(logger);

        await gate('republish', { confirm: true });
        await gate('republish', { confirm: true });

        expect(mockShow).toHaveBeenCalledTimes(2);
    });

    it('a grant cannot survive consent being turned back on', async () => {
        // Turning the setting off and on again is how someone revokes what they
        // regret. If grants outlived that, the only escape would be a reload.
        mockShow.mockResolvedValue('Allow for the rest of this session');
        const gate = createAgentConsentGate(logger);
        await gate('republish', { confirm: true });

        clearSessionGrants();
        await gate('republish', { confirm: true });

        expect(mockShow).toHaveBeenCalledTimes(2);
    });
});

describe('what may be granted is decided by the AUTHORED copy', () => {
    it('offers grants ONLY where repeating is recoverable and nobody else is reached', () => {
        // Asserted against the copy, not a list in this file: a new entry that
        // sets sessionGrant on something irreversible fails HERE, at the point
        // the claim is made.
        const grantable = Object.entries(AGENT_ALERT_COPY)
            .filter(([, c]) => c.sessionGrant)
            .map(([tool]) => tool);

        expect(grantable.sort()).toEqual(['republish', 'sync_content']);
    });

    it('never grants a tool whose own consequence says it cannot be undone', () => {
        // The two tests, applied to the text the author wrote. This is the one
        // that catches a mistake nobody remembered to think about.
        const contradictions = Object.entries(AGENT_ALERT_COPY)
            .filter(([, c]) => c.sessionGrant && /can't be undone|cannot be undone|is lost/i.test(c.consequence))
            .map(([tool]) => tool);

        expect(contradictions).toEqual([]);
    });

    it('every entry states a decision', () => {
        const undecided = Object.entries(AGENT_ALERT_COPY)
            .filter(([, c]) => typeof c.sessionGrant !== 'boolean')
            .map(([tool]) => tool);

        expect(Object.keys(AGENT_ALERT_COPY).length).toBeGreaterThan(10);
        expect(undecided).toEqual([]);
    });
});
