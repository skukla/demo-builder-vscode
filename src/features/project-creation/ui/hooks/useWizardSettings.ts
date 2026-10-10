/**
 * The three VS Code settings the wizard keeps LIVE: the built-in block-library
 * defaults, the custom block libraries, and the demos the SC has added from a
 * link. Each is seeded from the value the host sent at open, refreshed when the
 * extension pushes a change, and — for added demos — appended optimistically
 * when the dialog adds one (the push then echoes it).
 *
 * Subscribes through `vscode.onMessage` in ONE effect, as the container did:
 * `useVSCodeMessage` (core/ui/hooks) was considered and rejected because it
 * subscribes through `webviewClient`, a different seam from the one every
 * container suite mocks and observes.
 *
 * Moved out of WizardContainer.tsx on 2026-10-08 (EDS-8).
 *
 * @module features/project-creation/ui/hooks/useWizardSettings
 */

import { useCallback, useEffect, useState } from 'react';
import { withAddedDemo } from '../wizard/addedDemoCards';
import { vscode } from '@/core/ui/utils/vscode-api';
import type { CustomBlockLibrary } from '@/types/blockLibraries';
import type { AddedDemo } from '@/types/projectFile';
import type {
    AddedDemosUpdatedPayload,
    BlockLibraryDefaultsUpdatedPayload,
    CustomBlockLibraryDefaultsUpdatedPayload,
} from '@/types/webviewPayloads';

export interface WizardSettings {
    /** Built-in libraries the Project Builder step pre-selects */
    blockLibraryDefaults: string[] | undefined;
    /** Custom block libraries that seed the custom block-library checkboxes */
    customBlockLibraryDefaults: CustomBlockLibrary[] | undefined;
    /** The remembered demos, in the same shape */
    addedDemos: AddedDemo[];
    /** The dialog added (and the host remembered) a demo: show its card at once. */
    handleDemoAdded: (demo: AddedDemo) => void;
}

/**
 * @param blockLibraryDefaults - the SC's saved block-library preferences, as sent at open
 * @param customBlockLibraryDefaults - the custom block libraries from VS Code settings
 * @param addedDemos - the demos the SC has added from a link, from VS Code settings
 * @returns the three lists as they stand now, and the optimistic add for a demo
 */
export function useWizardSettings({
    blockLibraryDefaults: initialBlockLibraryDefaults,
    customBlockLibraryDefaults: initialCustomBlockLibraryDefaults,
    addedDemos: initialAddedDemos,
}: {
    blockLibraryDefaults: string[] | undefined;
    customBlockLibraryDefaults: CustomBlockLibrary[] | undefined;
    addedDemos: AddedDemo[];
}): WizardSettings {
    // Block-library defaults — live state, refreshed when VS Code settings change.
    // The Project Builder step pre-selects built-in libs (`blockLibraryDefaults`)
    // and seeds the custom block-library checkboxes (`customBlockLibraryDefaults`).
    const [blockLibraryDefaults, setBlockLibraryDefaults] = useState(initialBlockLibraryDefaults);
    const [customBlockLibraryDefaults, setCustomBlockLibraryDefaults] = useState(
        initialCustomBlockLibraryDefaults,
    );
    // The remembered demos, in the same shape: read at open, pushed live on change,
    // and appended optimistically when the dialog adds one (the push then echoes it).
    const [addedDemos, setAddedDemos] = useState<AddedDemo[]>(initialAddedDemos);

    useEffect(() => {
        const unsubDefaults = vscode.onMessage(
            'blockLibraryDefaultsUpdated',
            (data: BlockLibraryDefaultsUpdatedPayload) => {
                setBlockLibraryDefaults(data.blockLibraryDefaults);
            },
        );
        const unsubCustom = vscode.onMessage(
            'customBlockLibraryDefaultsUpdated',
            (data: CustomBlockLibraryDefaultsUpdatedPayload) => {
                setCustomBlockLibraryDefaults(data.customBlockLibraryDefaults);
            },
        );
        const unsubDemos = vscode.onMessage('addedDemosUpdated', (data: AddedDemosUpdatedPayload) => {
            setAddedDemos(data.addedDemos);
        });
        return () => {
            unsubDefaults();
            unsubCustom();
            unsubDemos();
        };
    }, []);

    /** The dialog added (and the host remembered) a demo: show its card at once. */
    const handleDemoAdded = useCallback((demo: AddedDemo): void => {
        setAddedDemos((prev) => withAddedDemo(prev, demo));
    }, []);

    return { blockLibraryDefaults, customBlockLibraryDefaults, addedDemos, handleDemoAdded };
}
