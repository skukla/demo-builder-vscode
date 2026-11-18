/**
 * Save as Package's words (EDS-72), in one place so the window and its tests read the same
 * strings. House rules: Title Case for what names a thing, short, plain, no middle dots.
 *
 * @module features/dashboard/ui/components/share/savePackageCopy
 */

import type { RemoveDemoPackageResult } from '@/types/webviewRequests';

export const SAVE_PACKAGE_COPY = {
    title: 'Save as Package',
    save: 'Save as Package',
    remove: 'Remove Package',
    tryAgain: 'Try Again',
    saved: 'Package Saved',
    saveFailed: "Couldn't Save the Package",
    removed: 'Package Removed',
    removeFailed: "Couldn't Remove the Package",
    // Plain application words for the file and the card (walk F244).
    removedFile: 'The package file was removed from your repository',
    removedFileSkipped: "The package file in your repository wasn't created by Demo Builder, so it was left unchanged",
    removedCard: 'the card was removed from your Welcome step',
    fileKept: "The package file in your repository wasn't created by Demo Builder, so it was left unchanged.",
} as const;

/** The saved result's one line: where the package now is. */
export function onWelcomeLine(name: string): string {
    return `${name} is on your Welcome step.`;
}

/** What Remove Package did, in one sentence. */
export function removedSentence(result: RemoveDemoPackageResult): string {
    const file = result.file === 'skipped' ? SAVE_PACKAGE_COPY.removedFileSkipped : SAVE_PACKAGE_COPY.removedFile;
    return result.removedFromList ? `${file} and ${SAVE_PACKAGE_COPY.removedCard}.` : `${file}.`;
}
