/**
 * Shared setup for the PackActions suites (the base one and -mark): the webview channel's mock, the
 * request it answers through, a pack's detail, and how a spec reads the More menu.
 *
 * The channel mock is imported here FIRST, and each spec imports this file before anything that
 * reaches the channel, so the mock registers in time (webview-test-authoring §3).
 */

import '../../../../helpers/webviewClientMock';
import { screen } from '@testing-library/react';

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

/** The More menu's rows, in order. */
export const menuLabels = (): (string | null)[] => screen.getAllByRole('menuitem').map((row) => row.textContent);

/** One More menu row, by its label. */
export const row = (name: string): HTMLElement => screen.getByRole('menuitem', { name });

/** The per-test reset both suites run: every request succeeds with nothing to say. */
export function resetRequests(): void {
    mockRequest.mockReset();
    mockRequest.mockResolvedValue({ success: true, data: null });
}
