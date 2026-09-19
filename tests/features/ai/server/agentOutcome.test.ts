/**
 * What the window says when an agent's tool call RETURNS. A tool that needs the
 * user answers normally — it does not throw — so before this every hand-back read
 * as success: on 2026-09-19 a republish that stopped for a GitHub sign-in flashed
 * "Republishing the storefront configuration — done" and changed nothing.
 */

import { outcomeOf } from '@/features/ai/server/agentOutcome';
import { asRawText, asText } from '@/features/ai/server/mcpToolResult';
import { needsUser } from '@/features/ai/server/handoff';

describe('outcomeOf', () => {
    it('reads a sign-in hand-back as waiting on the user, naming the service', () => {
        const result = asText({ needsAuth: 'github', message: 'GitHub sign-in required to push config.json.' });

        expect(outcomeOf(result)).toEqual({ kind: 'needsUser', text: 'Sign in to GitHub' });
    });

    it('names DA.live and Adobe the way a person writes them', () => {
        expect(outcomeOf(asText({ needsAuth: 'dalive' }))).toEqual({ kind: 'needsUser', text: 'Sign in to DA.live' });
        expect(outcomeOf(asText({ needsAuth: 'adobe' }))).toEqual({ kind: 'needsUser', text: 'Sign in to Adobe' });
    });

    it('reads a structured hand-back by what the user must do', () => {
        const result = asText(
            needsUser({
                reason: 'approval',
                what: 'Install the AEM Code Sync app',
                where: { command: 'demoBuilder.showDashboard' },
                tellUser: 'Install the app, then tell me.',
                resumeWith: 'check_github_app',
            }),
        );

        expect(outcomeOf(result)).toEqual({ kind: 'needsUser', text: 'Install the AEM Code Sync app' });
    });

    it('reads a failed answer as a failure, with its own reason', () => {
        const result = asText({ success: false, error: 'Mesh ID mismatch' });

        expect(outcomeOf(result)).toEqual({ kind: 'failed', text: 'Mesh ID mismatch' });
    });

    it('reads a failed prose answer by its text', () => {
        expect(outcomeOf(asRawText('The deploy was refused.', { isError: true }))).toEqual({
            kind: 'failed',
            text: 'The deploy was refused.',
        });
    });

    it('reads everything else as done', () => {
        expect(outcomeOf(asText({ success: true, meshId: 'm' }))).toEqual({ kind: 'done' });
        expect(outcomeOf(asRawText('Published.'))).toEqual({ kind: 'done' });
        expect(outcomeOf(undefined)).toEqual({ kind: 'done' });
        expect(outcomeOf({ ok: true })).toEqual({ kind: 'done' });
    });
});
