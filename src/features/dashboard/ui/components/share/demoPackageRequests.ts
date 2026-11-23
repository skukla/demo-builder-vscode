/**
 * The demo package's three host requests, shared by Share Demo's link step and Save as Package
 * (EDS-72): read the storefront's preview, save the details file (with or without the card on the
 * SC's own Welcome step), and remove them. Each answers its data or the handler's own words.
 *
 * @module features/dashboard/ui/components/share/demoPackageRequests
 */

import { webviewClient } from '@/core/ui/utils/vscode-api';
import type {
    DemoPackageCheck,
    DemoPackagePreview,
    RemoveDemoPackageResult,
    SaveDemoPackageRequest,
    SaveDemoPackageResult,
} from '@/types/webviewRequests';

/** A handler's answer: branch on `success` before reading anything else (webview-command-handler). */
export interface Answer<D> {
    success: boolean;
    error?: string;
    data?: D;
}

/**
 * What a dialog knows about the storefront: read once on open, before anything else shows. A
 * project with no storefront reads its datapack check alone, for Share's file step (walk F230).
 */
export type StorefrontState =
    | { status: 'loading' }
    | { status: 'none'; checks: DemoPackageCheck[] }
    | { status: 'failed'; error: string }
    | { status: 'ready'; preview: DemoPackagePreview };

/** Why the storefront could not be read, when the handler gave no reason or no answer came back. */
const UNREAD_REASON = 'The storefront could not be read.';

/**
 * Ask for the storefront's preview: its data, or the handler's reason it could not be read. A
 * request that threw carries transport words (the webview gave up waiting), not words for the SC.
 */
export async function readPreview(): Promise<StorefrontState> {
    try {
        const answer = await webviewClient.request<Answer<DemoPackagePreview>>('getDemoPackagePreview');
        if (!answer.success || !answer.data) return { status: 'failed', error: answer.error ?? UNREAD_REASON };
        return { status: 'ready', preview: answer.data };
    } catch {
        return { status: 'failed', error: UNREAD_REASON };
    }
}

/** Write the details file; the host's words when it could not. */
export async function saveDetails(request: SaveDemoPackageRequest): Promise<SaveDemoPackageResult> {
    const answer = await webviewClient.request<Answer<SaveDemoPackageResult>>('saveDemoPackage', request);
    if (!answer.success || !answer.data) throw new Error(answer.error ?? 'The details could not be saved.');
    return answer.data;
}

/** Take the details file out and the card off the Welcome step; the host's words when it could not. */
export async function removeDetails(): Promise<RemoveDemoPackageResult> {
    const answer = await webviewClient.request<Answer<RemoveDemoPackageResult>>('removeDemoPackage');
    if (!answer.success || !answer.data) throw new Error(answer.error ?? 'The details could not be removed.');
    return answer.data;
}
