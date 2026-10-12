/**
 * useBlockLibraryChoices Hook
 *
 * The block libraries the Configure screen offers, kept LIVE (EDS-39). The
 * catalog lists are fixed for the screen's lifetime; the custom list comes from
 * the `demoBuilder.blockLibraries.custom` setting, which the SC edits through
 * the picker's own "Configure custom libraries in Settings" link while Configure
 * stays open. The extension pushes `customBlockLibraryDefaultsUpdated` when that
 * setting changes (`commands/configure.ts`), the same message the wizard follows
 * (`useWizardSettings`), and this hook swaps the new list in.
 *
 * @module features/dashboard/ui/configure/hooks/useBlockLibraryChoices
 */

import { useEffect, useMemo, useState } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { CustomBlockLibrary } from '@/types/blockLibraries';
import type {
    ConfigureBlockLibraryChoices,
    CustomBlockLibraryDefaultsUpdatedPayload,
} from '@/types/webviewPayloads';

/**
 * Hold the Configure screen's block-library choices, following setting changes.
 *
 * @param initialChoices - what the extension sent at open, if anything
 * @returns the choices with the latest custom list, or undefined when none were sent
 */
export function useBlockLibraryChoices(
    initialChoices: ConfigureBlockLibraryChoices | undefined,
): ConfigureBlockLibraryChoices | undefined {
    const [customDefaults, setCustomDefaults] = useState<CustomBlockLibrary[] | undefined>();

    useEffect(
        () =>
            webviewClient.onMessage('customBlockLibraryDefaultsUpdated', (data) => {
                const payload = data as CustomBlockLibraryDefaultsUpdatedPayload;
                setCustomDefaults(payload.customBlockLibraryDefaults);
            }),
        [],
    );

    return useMemo(() => {
        if (!initialChoices || !customDefaults) return initialChoices;
        return { ...initialChoices, customDefaults };
    }, [initialChoices, customDefaults]);
}
