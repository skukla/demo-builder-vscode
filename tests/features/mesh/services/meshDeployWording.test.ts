/**
 * What a PERSON reads when a mesh deploy does not finish — one wording for the
 * palette command's pop-ups and the progress modal's failure view (PL-59 phase 2).
 * The agent's own wording (with its tool names) stays in `deployHandler.ts`.
 */
import { meshFailureForPerson } from '@/features/mesh/services/meshDeployWording';

describe('meshFailureForPerson', () => {
    it.each([
        [{ blockedBy: 'auth' as const }, 'Sign-in failed or was cancelled. Please try again.'],
        [
            { blockedBy: 'org' as const },
            'Still signed into the wrong Adobe organization. Close any other Adobe browser tab, then try again.',
        ],
        [{ blockedBy: 'no-mesh' as const }, 'This project does not have an API Mesh component.'],
    ])('names what blocked it: %o', (result, expected) => {
        expect(meshFailureForPerson({ success: false, ...result })).toBe(expected);
    });

    it("keeps the permission check's own reason when it gives one", () => {
        expect(
            meshFailureForPerson({ success: false, blockedBy: 'permission', error: 'You need the Developer role.' }),
        ).toBe('You need the Developer role.');
    });

    it('never shows the raw command output for a failed deploy; that is in Debug Logs', () => {
        expect(meshFailureForPerson({ success: false, error: 'Error: aio exited 1: ECONNRESET' })).toBe(
            'Mesh deployment failed. Check logs for details.',
        );
    });
});
