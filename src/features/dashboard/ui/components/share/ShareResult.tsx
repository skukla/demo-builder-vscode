/**
 * What Share Demo shows once Save File wrote the file (owner, 2026-11-18, walk F236: "the success
 * state is terrible"). A grey line under the boxes left the window looking as it did before the
 * save, so the window becomes the house result (`ResultBody`, walk F222): the large mark, File
 * Saved, then the file and the folder it is in. Its button shows the file in the operating system's
 * file browser, under the name VS Code gives that on each platform. A save that failed ends the
 * same way (walk F238): the red mark, Couldn't Save File and why, so no line ever has to arrive
 * under the form's boxes and the form needs no room held for one.
 *
 * @module features/dashboard/ui/components/share/ShareResult
 */

import React from 'react';
import { ResultBody } from '@/core/ui/components/feedback/ResultBody';

export const FILE_SAVED = 'File Saved';
export const FILE_NOT_SAVED = "Couldn't Save File";

/** VS Code's own name for showing a file in the file browser, by the platform the webview runs on. */
export function revealLabel(userAgent: string = navigator.userAgent): string {
    if (/Mac/.test(userAgent)) return 'Reveal in Finder';
    if (/Windows/.test(userAgent)) return 'Reveal in File Explorer';
    return 'Open Containing Folder';
}

/** "bodea-demo-bundle.zip in Desktop": the file, and the folder it is in, by name. */
export function savedWhere(filePath: string): string {
    const parts = filePath.split(/[\\/]/).filter(Boolean);
    const name = parts[parts.length - 1] ?? filePath;
    const folder = parts[parts.length - 2];
    return folder ? `${name} in ${folder}` : name;
}

/** The result: the mark, File Saved, and where the file went; or Couldn't Save File, and why. */
export function ShareResult({ path, failure }: { path?: string; failure?: string }): React.ReactElement {
    if (failure !== undefined) return <ResultBody status="error" outcome={FILE_NOT_SAVED} lines={[failure]} />;
    return <ResultBody status="success" outcome={FILE_SAVED} lines={[savedWhere(path ?? '')]} />;
}
