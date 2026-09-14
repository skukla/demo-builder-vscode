/**
 * Preamble for the DemoPackageModal suite: the host boundary is mocked; the
 * body and the core Modal render real over the global Spectrum stubs. Owns the
 * SUT import (webview-test-authoring §3).
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
import { DemoPackageModal } from '@/features/dashboard/ui/components/demo-package/DemoPackageModal';
import type { DemoPackagePreview, RemoveDemoPackageResult, SaveDemoPackageResult } from '@/types/webviewRequests';

export const LINK = 'https://github.com/steve/kukla-bodea';

export const PREVIEW: DemoPackagePreview = {
    draft: { name: 'Bodea', description: 'Bodea-branded B2B demo' },
    checks: [
        { id: 'repository', ok: true, message: 'steve/kukla-bodea is public.' },
        { id: 'branch', ok: true, message: 'Built from main, the default branch.' },
        { id: 'index', ok: false, message: 'No published page list, so new projects would start empty.', action: 'republish' },
    ],
    link: LINK,
    saved: false,
    onList: false,
    templateFlagSet: false,
};

export const SAVED: SaveDemoPackageResult = { link: LINK, file: 'written', onList: true, templateFlagSet: false, checks: PREVIEW.checks };
export const REMOVED: RemoveDemoPackageResult = { file: 'removed', templateFlagUnset: true, removedFromList: true };

export function answer<D>(data: D): { success: true; data: D } {
    return { success: true, data };
}

export async function renderPackage(preview: unknown = answer(PREVIEW)) {
    mockRequest.mockResolvedValueOnce(preview);
    const onClose = jest.fn();
    const view = render(<DemoPackageModal isOpen onClose={onClose} />);
    await settle();
    return { ...view, onClose };
}

export function resetPackageMocks(): void {
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

/** The stubs put the test id on the control for a TextField and on the label for a Checkbox. */
function control(testId: string): HTMLInputElement {
    const el = screen.getByTestId(testId);
    return (el.tagName === 'INPUT' ? el : el.querySelector('input')) as HTMLInputElement;
}

export function nameInput(): HTMLInputElement {
    return control('package-name');
}

export function templateBox(): HTMLInputElement {
    return control('package-template');
}
