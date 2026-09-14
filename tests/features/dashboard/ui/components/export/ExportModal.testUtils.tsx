/**
 * Preamble for the ExportModal suite: the host boundary is mocked; the forms
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

/** The clipboard the Copy link button writes to; jsdom has none. */
export const mockWriteText = jest.fn();
Object.defineProperty(navigator, 'clipboard', { value: { writeText: (...a: unknown[]) => mockWriteText(...a) }, configurable: true });

// The SUT binds below the mocks on purpose (webview-test-authoring §3).
import { ExportModal, type ExportModalProps } from '@/features/dashboard/ui/components/export/ExportModal';
import type { DemoPackagePreview } from '@/types/webviewRequests';

export const LINK = 'https://github.com/steve/kukla-bodea';

export const PREVIEW: DemoPackagePreview = {
    draft: { name: 'Bodea', description: 'Bodea-branded B2B demo' },
    checks: [{ id: 'repository', ok: true, message: "Colleagues can open this storefront's code." }],
    link: LINK,
    saved: false,
    onList: false,
};

export function answer<D>(data: D): { success: true; data: D } {
    return { success: true, data };
}

/** The link form reads the storefront preview on open for an Edge Delivery project. */
export async function renderExport(preview: unknown = answer(PREVIEW), overrides: Partial<ExportModalProps> = {}) {
    if (overrides.isEds !== false) mockRequest.mockResolvedValueOnce(preview);
    const props: ExportModalProps = { isOpen: true, isEds: true, onClose: jest.fn(), ...overrides };
    const view = render(<ExportModal {...props} />);
    await settle();
    return { ...view, props };
}

/** Render with the storefront read left unanswered, so the loading state stays up. */
export function renderExportPending(): void {
    mockRequest.mockReturnValueOnce(new Promise(() => undefined));
    render(<ExportModal isOpen isEds onClose={jest.fn()} />);
}

export function resetExportMocks(): void {
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
    fireEvent.click(screen.getByTestId('export-form-file'));
    await settle();
}

export function partBox(testId: string): HTMLInputElement {
    const el = screen.getByTestId(testId);
    return (el.tagName === 'INPUT' ? el : el.querySelector('input')) as HTMLInputElement;
}
