/**
 * Shared preamble for the split ImportDatapackModal suites.
 *
 * Owns the WebviewClient mock AND the SUT import (§3 of webview-test-authoring:
 * jest.mock hoists only within the module it appears in, so if a spec imported
 * the component itself, the component could bind to the REAL client). Specs
 * import everything from here and never reach for the SUT directly.
 */

import React from 'react';
import { render } from '@testing-library/react';

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: { request: jest.fn() },
}));

// Below the mock on purpose — see the module docstring.
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { ImportDatapackModal } from '@/features/data-installer/ui/components/ImportDatapackModal';

export const mockRequest = webviewClient.request as jest.Mock;

export const DEFAULTS = {
    id: { name: 'bodea', version: 'main' },
    displayName: 'Bodea',
    availableTypes: ['categories', 'products'],
    onClose: jest.fn(),
};

export function renderModal(over: Partial<React.ComponentProps<typeof ImportDatapackModal>> = {}) {
    return render(<ImportDatapackModal {...DEFAULTS} {...over} />);
}

/** Reset the shared mock; each spec calls this from its own beforeEach. */
export function resetModalMocks(): void {
    mockRequest.mockReset();
    mockRequest.mockResolvedValue({ success: true, data: null });
}
