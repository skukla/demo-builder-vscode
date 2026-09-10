/**
 * Fixtures for the projectDeletionService suites — the projects, the handler context,
 * the CDN-unpublish service seam, and the QuickPick that performs one gesture.
 *
 * Separate from `projectDeletionService.testUtils` because that file is the jest.mock
 * WALL and must be imported first; this one is ordinary values built on top of it.
 */

import { mockCreateQuickPick } from './projectDeletionService.testUtils';
import type { DeletionServices } from './projectDeletionService.testUtils';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import type { HandlerContext } from '@/types/handlers';
import type { Project } from '@/types/base';

/** A plain, non-EDS project — takes the simple warning-modal path. */
export function plainProject(over: Partial<Project> = {}): Project {
    return createMockProject({ name: 'demo-project', path: '/projects/demo', ...over });
}

/**
 * An EDS project — takes the cleanup-options dialog path instead.
 *
 * `isEdsProject` keys off `componentInstances`, NOT `componentSelections`
 * (resourceCleanupHelpers.ts:90). Getting that wrong is silent: the project
 * simply takes the plain path and every assertion still passes, which is
 * exactly what the first draft of this file did.
 *
 * The metadata fields are the ones `extractEdsMetadata` reads; without them
 * it returns a null-ish shape and `deleteProject` skips the EDS branch again.
 */
export function edsProject(over: Partial<Project> = {}): Project {
    return createMockProject({
        name: 'demo-project',
        path: '/projects/demo',
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: {
                    githubRepo: 'skukla/demo-storefront',
                    daLiveOrg: 'skukla',
                    daLiveSite: 'demo-storefront',
                },
            },
        },
        ...over,
    });
}

export function context(): HandlerContext {
    return createMockHandlerContext();
}

/**
 * The CDN-unpublish services, handed in through the seam.
 *
 * There used to be a `jest.mock` here instead, supplying an `unpublishAllContent`
 * the source had stopped calling and NO `initKeyStore` static. The key-store init is
 * the first statement inside the step's try block, so it threw a TypeError, the catch
 * logged it as a warning, and every Helix call below was unreachable — with 23 tests
 * green. Measured 2026-08-31 by planting a throw inside that try: the suite did not
 * notice.
 */
export const mockInitKeyStore = jest.fn();
export const mockListAllPages = jest.fn();
export const mockUnpublishPages = jest.fn();
export const mockDeleteAdminApiKey = jest.fn();
export const SERVICES: DeletionServices = {
    initKeyStore: mockInitKeyStore,
    makeHelix: () => ({
        listAllPages: mockListAllPages,
        unpublishPages: mockUnpublishPages,
        deleteAdminApiKey: mockDeleteAdminApiKey,
    }),
};

/**
 * The ways a user leaves the cleanup dialog. Two of them are cancels, and
 * `acceptThenHide` is what real VS Code does: onDidHide fires AFTER onDidAccept,
 * which the production `resolved` guard exists to absorb.
 */
export type Gesture = 'escape' | 'cancelButton' | 'accept' | 'acceptThenHide';

/** What a test can read back off the dialog the code configured. */
export interface ArmedQuickPick {
    /** The rows offered, in the order they were pushed. */
    items: () => Array<{ id: string; picked?: boolean }>;
    /** What was ticked at the moment `show()` was called — before the gesture. */
    selectedAtShow: () => Array<{ id: string }>;
    /** What the user left ticked when they pressed Enter. */
    selected: () => unknown[];
    buttons: () => unknown[];
    flags: () => { canSelectMany: boolean; ignoreFocusOut: boolean };
}

/**
 * A fake `QuickPick` that performs one gesture when the code calls `show()`.
 *
 * The dialog is event-driven — `showCleanupConfirmation` returns a promise that
 * only settles inside `onDidHide` / `onDidTriggerButton` / `onDidAccept` — so a
 * stub that merely records the call would hang the test forever.
 */
export function armQuickPick(
    gesture: Gesture,
    /** Which resource rows the user leaves ticked when they press Enter. */
    keep: Array<'github' | 'daLive'> = ['github', 'daLive']
): ArmedQuickPick {
    const handlers: Record<string, () => void> = {};
    let selectedAtShow: Array<{ id: string }> = [];
    const pick = {
        title: '',
        placeholder: '',
        canSelectMany: false,
        ignoreFocusOut: false,
        items: [] as Array<{ id: string; picked?: boolean }>,
        selectedItems: [] as Array<{ id: string }>,
        buttons: [] as unknown[],
        onDidTriggerButton: (h: () => void) => (handlers.button = h),
        onDidAccept: (h: () => void) => (handlers.accept = h),
        onDidHide: (h: () => void) => (handlers.hide = h),
        hide: () => {},
        dispose: () => {},
        show: () => {
            selectedAtShow = [...pick.selectedItems];
            if (gesture === 'escape') handlers.hide?.();
            if (gesture === 'cancelButton') handlers.button?.();
            if (gesture === 'accept' || gesture === 'acceptThenHide') {
                // Untick whatever `keep` leaves out — the production code reads
                // `selectedItems`, so this IS the user's choice.
                pick.selectedItems = pick.items.filter((i) =>
                    keep.includes(i.id as 'github' | 'daLive')
                );
                handlers.accept?.();
                // VS Code hides the dialog after an accept. A second settle here
                // would overwrite the answer with a cancel.
                if (gesture === 'acceptThenHide') handlers.hide?.();
            }
        },
    };
    mockCreateQuickPick.mockReturnValue(pick);
    return {
        items: () => pick.items,
        selectedAtShow: () => selectedAtShow,
        selected: () => pick.selectedItems,
        buttons: () => pick.buttons,
        flags: () => ({
            canSelectMany: pick.canSelectMany,
            ignoreFocusOut: pick.ignoreFocusOut,
        }),
    };
}
