/**
 * Setup-result classification.
 *
 * The handler previously had two branches: success, or throw. That collapsed
 * "stop, the user is installing the App" into "failed", which overwrote the
 * install dialog with an error screen. Three outcomes, not two.
 */

import { classifySetupResult } from '@/features/eds/handlers/storefrontSetup/storefrontSetupHandlers';

describe('classifySetupResult', () => {
    it('treats success as complete', () => {
        expect(classifySetupResult({ success: true })).toBe('complete');
    });

    it('treats an awaiting-install halt as its own outcome', () => {
        expect(
            classifySetupResult({
                success: false,
                error: 'GitHub App installation required',
                awaitingGitHubApp: true,
            }),
        ).toBe('awaiting-github-app');
    });

    it('treats every other failure as an error', () => {
        expect(classifySetupResult({ success: false, error: 'Couldn\'t verify AEM Code Sync' }))
            .toBe('error');
    });

    it('does not rely on the error string to decide', () => {
        // Matching on message text would break the moment the wording changes —
        // and the wording changed twice in this release alone.
        expect(
            classifySetupResult({ success: false, error: 'GitHub App installation required' }),
        ).toBe('error');
    });
});
