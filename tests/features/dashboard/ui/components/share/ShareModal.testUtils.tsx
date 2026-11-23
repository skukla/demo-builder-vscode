/**
 * Preamble for the ShareModal suite: the host boundary is mocked; the forms
 * and the core Modal render real over the global Spectrum stubs. Owns the SUT
 * import (webview-test-authoring §3).
 */

// Every request goes through the shared WebviewClient double: `vscode-api` only re-exports
// `webviewClient` from `WebviewClient`, so the share modules that import it reach the same
// `mockRequest` as the Datapacks screen's hook.
import { mockRequest } from '../../../../../helpers/webviewClientMock';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { settle } from '../../../../../helpers/reactSettle';
import '@testing-library/jest-dom';

export { mockRequest };

/** The clipboard the link button writes to; jsdom has none. */
export const mockWriteText = jest.fn();
Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: (...a: unknown[]) => mockWriteText(...a) },
    configurable: true,
});

// The SUT binds below the mocks on purpose (webview-test-authoring §3).
import { SavePackageModal } from '@/features/dashboard/ui/components/share/SavePackageModal';
import { ShareModal, type ShareModalProps } from '@/features/dashboard/ui/components/share/ShareModal';
import type {
    DemoPackageCheck,
    DemoPackagePreview,
    RemoveDemoPackageResult,
    SaveDemoPackageResult,
    ShareDatapackChecks,
} from '@/types/webviewRequests';

export const LINK = 'https://github.com/steve/kukla-bodea';

export const PREVIEW: DemoPackagePreview = {
    draft: { name: 'Bodea', description: 'Bodea-branded B2B demo' },
    checks: [
        { id: 'repository', ok: true, message: "Colleagues can open this storefront's code." },
        { id: 'index', ok: false, message: 'Colleagues would start with an empty site.', action: 'republish' },
    ],
    link: LINK,
    saved: false,
    onList: false,
};

export const SAVED: SaveDemoPackageResult = { link: LINK, file: 'written', onList: true, checks: PREVIEW.checks };
export const REMOVED: RemoveDemoPackageResult = { file: 'removed', removedFromList: true };

/** The check a pack only the SC can see answers, with its fix (walk F229). */
export const PRIVATE_PACK: DemoPackageCheck = {
    id: 'datapack',
    ok: false,
    title: "Colleagues Can't Use This Demo's Data Yet",
    message: 'Release Save Test 2 is only visible to you.',
    share: {
        pack: { name: 'release-save-test-2', version: '20261117-101500' },
        displayName: 'Release Save Test 2',
    },
};

export function answer<D>(data: D): { success: true; data: D } {
    return { success: true, data };
}

/** What a headless project's datapack read answers when the project's pack needs nothing. */
export const NO_PACK_CHECKS = answer<ShareDatapackChecks>({ checks: [] });

/**
 * The dialog reads on open: the storefront preview for an Edge Delivery project, the datapack
 * check alone for a headless one (`headlessRead`).
 */
export async function renderShare(
    preview: unknown = answer(PREVIEW),
    overrides: Partial<ShareModalProps> = {},
    headlessRead: unknown = NO_PACK_CHECKS,
) {
    mockRequest.mockResolvedValueOnce(overrides.isEds === false ? headlessRead : preview);
    const props: ShareModalProps = { isOpen: true, isEds: true, onClose: jest.fn(), ...overrides };
    const view = render(<ShareModal {...props} />);
    await settle();
    return { ...view, props };
}

/** Save as Package: it reads the storefront on open, as Share Demo's link step does (EDS-72). */
export async function renderSavePackage(preview: unknown = answer(PREVIEW)) {
    mockRequest.mockResolvedValueOnce(preview);
    const onClose = jest.fn();
    const view = render(<SavePackageModal isOpen onClose={onClose} />);
    await settle();
    return { ...view, onClose };
}

/** Save as Package with its read left unanswered, so its wait stays up. */
export function renderSavePackagePending(): void {
    mockRequest.mockReturnValueOnce(new Promise(() => undefined));
    render(<SavePackageModal isOpen onClose={jest.fn()} />);
}

/** Render with the storefront read left unanswered, so the loading state stays up. */
export function renderSharePending(): void {
    mockRequest.mockReturnValueOnce(new Promise(() => undefined));
    render(<ShareModal isOpen isEds onClose={jest.fn()} />);
}

export function resetShareMocks(): void {
    jest.clearAllMocks();
    mockRequest.mockReset();
    mockWriteText.mockReset();
    mockWriteText.mockResolvedValue(undefined);
}

export function button(name: string | RegExp): HTMLElement {
    return screen.getByRole('button', { name });
}

export async function click(name: string | RegExp): Promise<void> {
    fireEvent.click(button(name));
    await settle();
}

export async function chooseFile(): Promise<void> {
    fireEvent.click(screen.getByTestId('share-form-file'));
    await settle();
}

/** Step 1 to step 2: the chosen way's form. */
export async function next(): Promise<void> {
    await click('Next');
}

/** Open on step 1, then go on to the link form (the default choice). */
export async function renderShareLink(preview: unknown = answer(PREVIEW), overrides: Partial<ShareModalProps> = {}) {
    const view = await renderShare(preview, overrides);
    await next();
    return view;
}

/** Open on step 1, choose the file card, then go on to the file form. */
export async function renderShareFile(
    overrides: Partial<ShareModalProps> = {},
    preview: unknown = answer(PREVIEW),
    headlessRead: unknown = NO_PACK_CHECKS,
) {
    const view = await renderShare(preview, overrides, headlessRead);
    await chooseFile();
    await next();
    return view;
}

/** The stub puts the test id on the wrapper (checkbox, text field) or the control itself. */
function control<T extends HTMLElement>(testId: string, tag: string): T {
    const el = screen.getByTestId(testId);
    return (el.tagName === tag ? el : el.querySelector(tag.toLowerCase())) as T;
}

/** A part on the file form, a house checkbox row, found by its label (its line follows in the name). */
export function partBox(label: 'Setup' | 'Storefront'): HTMLInputElement {
    return screen.getByRole('checkbox', { name: new RegExp(`^${label}`) }) as HTMLInputElement;
}

export function nameInput(): HTMLInputElement {
    return control<HTMLInputElement>('share-name', 'INPUT');
}

/** The requests of one type the dialog sent, in order. */
export function sent(type: string): unknown[][] {
    return mockRequest.mock.calls.filter(([t]) => t === type);
}
