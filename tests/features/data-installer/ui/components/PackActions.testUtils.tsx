/**
 * Shared setup for the PackActions suites (the base one and -mark): the webview channel's mock, the
 * request it answers through, a pack's detail, and how a spec reads the Actions list.
 *
 * The channel mock is imported here FIRST, and each spec imports this file before anything that
 * reaches the channel, so the mock registers in time (webview-test-authoring §3).
 */

import '../../../../helpers/webviewClientMock';
import { screen, within } from '@testing-library/react';

// Below the mock on purpose.
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { DatapackDetail } from '@/features/data-installer/types';

export const mockRequest = webviewClient.request as jest.Mock;

/** A Data Installer pack unless the overrides say otherwise. */
export function makeDetail(overrides: Partial<DatapackDetail> = {}): DatapackDetail {
    return {
        id: { name: 'bodea', version: 'main' },
        displayName: 'Bodea',
        shared: true,
        dataTypes: ['categories', 'products'],
        art: {},
        ...overrides,
    };
}

/** The flyout's Actions list (owner, 2026-11-17: visible, as the integration flyouts'). */
const actions = (): HTMLElement => screen.getByRole('region', { name: 'Actions' });

/** A row's label, less its icon (the icon mock draws text of its own). */
const labelOf = (button: HTMLElement): string =>
    Array.from(button.childNodes)
        .filter((node) => !(node instanceof Element && node.classList.contains('integration-panel-action-icon')))
        .map((node) => node.textContent)
        .join('');

/** The Actions list's rows, in order, the main action first. */
export const menuLabels = (): string[] => within(actions()).getAllByRole('button').map(labelOf);

/** Every button on screen, the list's by their labels: proves there is no other button (no More). */
export const buttonLabels = (): string[] => screen.getAllByRole('button').map(labelOf);

/** One row of the Actions list, by its label. */
export const row = (name: string): HTMLElement => within(actions()).getByRole('button', { name });

/** The per-test reset both suites run: every request succeeds with nothing to say. */
export function resetRequests(): void {
    mockRequest.mockReset();
    mockRequest.mockResolvedValue({ success: true, data: null });
}
