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

// The SUT binds below the mocks on purpose (webview-test-authoring §3).
import { ExportModal, type ExportModalProps } from '@/features/dashboard/ui/components/export/ExportModal';
import type { DemoPackagePreview } from '@/types/webviewRequests';

export const LINK = 'https://github.com/steve/kukla-bodea';

export const PREVIEW: DemoPackagePreview = {
    draft: { name: 'Bodea', description: 'Bodea-branded B2B demo' },
    checks: [{ id: 'repository', ok: true, message: 'steve/kukla-bodea is public.' }],
    link: LINK,
    saved: false,
    onList: false,
    templateFlagSet: false,
};

export function answer<D>(data: D): { success: true; data: D } {
    return { success: true, data };
}

/** The link form reads the storefront preview on open for an Edge Delivery project. */
export async function renderExport(preview: unknown = answer(PREVIEW), overrides: Partial<ExportModalProps> = {}) {
    if (overrides.isEds !== false) mockRequest.mockResolvedValueOnce(preview);
    const props: ExportModalProps = { isOpen: true, isEds: true, onClose: jest.fn(), onSaveDemoPackage: jest.fn(), ...overrides };
    const view = render(<ExportModal {...props} />);
    await settle();
    return { ...view, props };
}

export function resetExportMocks(): void {
    jest.clearAllMocks();
    mockRequest.mockReset();
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
