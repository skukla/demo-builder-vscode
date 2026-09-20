/**
 * resolveCloudCleanup — the agent's version of the button's checklist (AI-9).
 *
 * The delete-project button shows two boxes, both unticked, over the setting
 * `demoBuilder.cleanupBehavior`. These pin that an agent gets the same answer
 * from the same setting: `ask` leaves them unticked, `deleteAll` ticks both, and
 * `localOnly` refuses them however the call was written.
 */

import * as vscode from 'vscode';
import { resolveCloudCleanup } from '@/features/ai/server/agentProjectCleanup';

const getConfiguration = vscode.workspace.getConfiguration as jest.Mock;

/** Put the SC's setting where the resolver reads it. */
function behavior(value: string): void {
    getConfiguration.mockReturnValue({ get: (_key: string, fallback: string) => value ?? fallback });
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('the default, "ask"', () => {
    it('leaves both boxes unticked when the call names neither', () => {
        behavior('ask');

        expect(resolveCloudCleanup({})).toEqual({
            deleteGithubRepo: false,
            deleteDaLiveSite: false,
        });
    });

    it('ticks exactly what the call asked for', () => {
        behavior('ask');

        expect(resolveCloudCleanup({ deleteDaLiveSite: true })).toEqual({
            deleteGithubRepo: false,
            deleteDaLiveSite: true,
        });
    });
});

describe('"deleteAll"', () => {
    it('ticks both, as the dialog does', () => {
        behavior('deleteAll');

        expect(resolveCloudCleanup({})).toEqual({
            deleteGithubRepo: true,
            deleteDaLiveSite: true,
        });
    });

    it('still lets a call keep one of them', () => {
        behavior('deleteAll');

        expect(resolveCloudCleanup({ deleteGithubRepo: false })).toEqual({
            deleteGithubRepo: false,
            deleteDaLiveSite: true,
        });
    });
});

describe('"localOnly"', () => {
    it('refuses both, and says why, when a call asked for them', () => {
        behavior('localOnly');

        const choice = resolveCloudCleanup({ deleteGithubRepo: true, deleteDaLiveSite: true });

        expect(choice.deleteGithubRepo).toBe(false);
        expect(choice.deleteDaLiveSite).toBe(false);
        expect(choice.refusedBySetting).toContain('localOnly');
    });

    it('says nothing when nothing was asked for', () => {
        behavior('localOnly');

        expect(resolveCloudCleanup({}).refusedBySetting).toBeUndefined();
    });
});
