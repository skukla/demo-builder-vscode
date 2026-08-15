/**
 * The AEM Code Sync install instructions have ONE source.
 *
 * Two surfaces walk the user through the same GitHub screens:
 *
 *   - `CodeSyncStatusView` — the wizard's Code Sync sub-step (configure time)
 *   - `GitHubAppInstallDialog` — the mid-run recovery panel, shown when the setup
 *     pipeline or project creation stops on a missing app
 *
 * They had drifted into two different scripts with two different button names
 * ("Install App" / "Check Again" vs "Open Installation Page" / "Check
 * Installation"), so a user who met both was told to press differently-named
 * buttons for the same screens. This module is the single source; these tests
 * pin the content that both must render.
 *
 * The codebase already names this failure mode, in edsResetService:
 * "Two remedy texts one line apart is the drift, not the fix for it."
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    CODE_SYNC_INSTALL_ACTION,
    CODE_SYNC_RECHECK_ACTION,
    buildCodeSyncInstallSteps,
} from '@/features/eds/ui/helpers/codeSyncInstallContent';

describe('codeSyncInstallContent', () => {
    it('names the repository the user must actually grant access to', () => {
        const steps = buildCodeSyncInstallSteps('skukla', 'demo-builder-test');

        // The owner and repo carry the whole value of these instructions — the
        // GitHub App page lists many repositories and the user has to pick one.
        expect(JSON.stringify(steps)).toContain('skukla');
        expect(JSON.stringify(steps)).toContain('demo-builder-test');
    });

    it('ends by telling the user to come back and re-check, naming that button', () => {
        const steps = buildCodeSyncInstallSteps('owner', 'repo');
        const last = steps[steps.length - 1];

        // The final step must name the button that actually exists, or the user
        // completes the install and has no idea what closes the loop.
        expect(`${last.step} ${last.details}`).toContain(CODE_SYNC_RECHECK_ACTION);
    });

    it('opens by naming the install button', () => {
        const steps = buildCodeSyncInstallSteps('owner', 'repo');

        expect(`${steps[0].step} ${steps[0].details}`).toContain(CODE_SYNC_INSTALL_ACTION);
    });

    it('exposes stable action labels for both surfaces to share', () => {
        expect(CODE_SYNC_INSTALL_ACTION).toBe('Install App');
        expect(CODE_SYNC_RECHECK_ACTION).toBe('Check Again');
    });

    it('returns a fresh array so a caller cannot mutate the shared script', () => {
        const a = buildCodeSyncInstallSteps('owner', 'repo');
        const b = buildCodeSyncInstallSteps('owner', 'repo');

        expect(a).not.toBe(b);
        expect(a).toEqual(b);
    });
});

/**
 * Structural guard: neither surface may grow its own copy.
 *
 * Read from SOURCE because that is the only way to see a second copy appear —
 * a rendering test passes happily while two components show two different
 * scripts. Same technique the repo uses in `flowStages.test.ts`.
 */
describe('both surfaces use the shared script', () => {
    const SURFACES = [
        'src/features/eds/ui/steps/repoSelectionInline.helpers.tsx',
        'src/features/eds/ui/components/GitHubAppInstallDialog.tsx',
    ];

    const read = (rel: string): string =>
        fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

    it.each(SURFACES)('%s builds its steps from the shared module', (rel) => {
        expect(read(rel)).toContain('buildCodeSyncInstallSteps');
    });

    it.each(SURFACES)('%s does not hand-write the install steps', (rel) => {
        // A distinctive phrase from the script. If it reappears in a surface, a
        // second copy has been pasted back in and the two will drift again.
        expect(read(rel)).not.toContain('Only select repositories');
    });

    it.each(SURFACES)('%s does not hand-write the action labels', (rel) => {
        const src = read(rel);

        expect(src).not.toContain("'Open Installation Page'");
        expect(src).not.toContain("'Check Installation'");
    });

    it('positive control: the shared module DOES contain the script', () => {
        // Proves the assertions above would actually catch a copy, rather than
        // passing because the phrase is nowhere in the repo.
        expect(read('src/features/eds/ui/helpers/codeSyncInstallContent.ts')).toContain(
            'Only select repositories',
        );
    });
});

