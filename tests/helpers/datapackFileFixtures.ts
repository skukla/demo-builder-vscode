/**
 * Add from File's answers, typed to the webview's own interfaces so `typecheck:tests` reads them
 * (step-07 F1/F2): what `open-datapack-zip` says about a file, and what `load-datapack-zip` did.
 * Shapes from `datapackZipHandlers.ts` (`open-datapack-zip`, `load-datapack-zip`).
 */

import type { LoadOutcome } from '@/features/data-installer/ui/components/AddDatapackFileModal';
import type { OpenedFile } from '@/features/data-installer/ui/components/AddFileForm';

/** A file holding two data types. */
export const OPENED_FILE: OpenedFile = {
    path: '/Users/sc/tailspin-v1.datapack.zip',
    datapackName: 'tailspin',
    version: 'v1',
    displayName: 'Tailspin B2B',
    dataTypes: ['categories', 'customer_groups'],
};

/** A clean load of that file into My Datapacks that created the datapack; `over` changes any field. */
export const loadedFile = (over: Partial<LoadOutcome> = {}): LoadOutcome => ({
    datapackName: 'tailspin',
    version: 'v1',
    target: 'library',
    pack: 'created',
    stored: ['categories', 'customer_groups'],
    failed: [],
    ...over,
});
