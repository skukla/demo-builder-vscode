/**
 * Preamble for the ShareModal suite: the host boundary is mocked; the forms
 * and the core Modal render real over the global Spectrum stubs. Owns the SUT
 * import (webview-test-authoring §3).
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { settle } from '../../../../../helpers/reactSettle';
import '@testing-library/jest-dom';

export const mockRequest = jest.fn();
jest.mock('@/core/ui/utils/vscode-api', () => ({
    webviewClient: { request: (...args: unknown[]) => mockRequest(...args) },
}));

/** The clipboard the link button writes to; jsdom has none. */
export const mockWriteText = jest.fn();
Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: (...a: unknown[]) => mockWriteText(...a) },
    configurable: true,
});

// The SUT binds below the mocks on purpose (webview-test-authoring §3).
import { ShareModal, type ShareModalProps } from '@/features/dashboard/ui/components/share/ShareModal';
import type {
    DemoPackagePreview,
    RemoveDemoPackageResult,
    SaveDemoPackageResult,
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

export function answer<D>(data: D): { success: true; data: D } {
    return { success: true, data };
}

/** The link form reads the storefront preview on open for an Edge Delivery project. */
export async function renderShare(preview: unknown = answer(PREVIEW), overrides: Partial<ShareModalProps> = {}) {
    if (overrides.isEds !== false) mockRequest.mockResolvedValueOnce(preview);
    const props: ShareModalProps = { isOpen: true, isEds: true, onClose: jest.fn(), ...overrides };
    const view = render(<ShareModal {...props} />);
    await settle();
    return { ...view, props };
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

/** The stub puts the test id on the wrapper (checkbox, text field) or the control itself. */
function control<T extends HTMLElement>(testId: string, tag: string): T {
    const el = screen.getByTestId(testId);
    return (el.tagName === tag ? el : el.querySelector(tag.toLowerCase())) as T;
}

export function partBox(testId: string): HTMLInputElement {
    return control<HTMLInputElement>(testId, 'INPUT');
}

export function welcomeBox(): HTMLInputElement {
    return partBox('share-welcome');
}

export function nameInput(): HTMLInputElement {
    return control<HTMLInputElement>('share-name', 'INPUT');
}

/** Open the name and description fields behind their quiet link. */
export async function openDetails(): Promise<void> {
    await click('Change name or description');
}

/** The requests of one type the dialog sent, in order. */
export function sent(type: string): unknown[][] {
    return mockRequest.mock.calls.filter(([t]) => t === type);
}
