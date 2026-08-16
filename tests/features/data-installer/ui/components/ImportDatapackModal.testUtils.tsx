/**
 * Shared preamble for the split ImportDatapackModal suites.
 *
 * Owns the WebviewClient mock AND the SUT import (§3 of webview-test-authoring:
 * jest.mock hoists only within the module it appears in, so if a spec imported
 * the component itself, the component could bind to the REAL client). Specs
 * import everything from here and never reach for the SUT directly.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: { request: jest.fn(), onMessage: jest.fn(() => jest.fn()) },
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

/**
 * Reset the shared mock; each spec calls this from its own beforeEach.
 *
 * The target answers with an instance by default. The modal no longer offers an
 * editable instance field — it comes from the open project — so without this
 * every action stays disabled and nothing can be driven. Specs that need the
 * no-instance case override this with their own implementation.
 */
export function resetModalMocks(): void {
    mockRequest.mockReset();
    mockRequest.mockImplementation(async (type: string) =>
        type === 'get-datapack-import-target'
            ? { success: true, data: { instance: 'inst', projectName: 'demo-1' } }
            : { success: true, data: null },
    );
}

/**
 * The answer every spec wants for the requests it is NOT testing.
 *
 * Chiefly the target: the modal derives its instance from the open project, so a
 * spec whose own `mockImplementation` returns `data: null` for everything else
 * leaves the modal with no instance and every action disabled. Use this as the
 * fallback arm rather than `{ success: true, data: null }`.
 */
export async function defaultResponse(type: string): Promise<unknown> {
    if (type === 'get-datapack-import-target') {
        return { success: true, data: { instance: 'inst', projectName: 'demo-1' } };
    }
    return { success: true, data: null };
}

/**
 * Wait until the form is usable.
 *
 * Replaces the old `instanceField()` helper: the instance is derived now, so
 * there is nothing to type, and readiness means the seeded instance has landed.
 */
export async function awaitForm(): Promise<void> {
    await screen.findByRole('checkbox', { name: 'Categories' });
}
