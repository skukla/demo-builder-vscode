/**
 * Shared preamble for the `ProjectClearWindow` suites: the canonical webviewClient double, imported
 * BEFORE the component (webview-test-authoring §3), the check each opening is answered with, and the
 * render. Specs import the component's render from here and never reach for it directly.
 */

import '../../../../helpers/webviewClientMock';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { press, settle } from '../../../../helpers/reactSettle';

// Below the mock import on purpose — see the module docstring.
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { ProjectClearWindow } from '@/features/data-installer/ui/components/ProjectClearWindow';
import type { DatapackRemovalChanges } from '@/features/data-installer/removalChanges';
import type { ClearCheck } from '@/types/demoDataWipe';
import type { HandlerResponse } from '@/types/handlers';

export { press, settle };

/** The datapack's changes, when the SC made none. */
export const NO_CHANGES: DatapackRemovalChanges = { count: 0, kinds: [], alwaysSave: false };

export const mockRequest = webviewClient.request as jest.Mock;

/** Answer the check with these, one per asking, the last again from then on; the datapack's changes read with `changes`; anything else succeeds empty. */
export function answering(...checks: ClearCheck[]): void {
    answeringWith({}, ...checks);
}

/** The same, the datapack's changes read answered as given (`get-datapack-removal-changes`). */
export function answeringWith(more: { changes?: DatapackRemovalChanges | 'fails' }, ...checks: ClearCheck[]): void {
    const queue = [...checks];
    mockRequest.mockReset();
    mockRequest.mockImplementation(async (type: string): Promise<HandlerResponse> => {
        if (type === 'get-datapack-removal-changes') {
            return more.changes === 'fails' ? { success: false, error: 'Commerce did not answer.' } : { success: true, data: more.changes ?? NO_CHANGES };
        }
        if (type !== 'check-demo-data') return { success: true };
        const next = queue.length > 1 ? queue.shift() : queue[0];
        return { success: true, data: next };
    });
}

/** Each request of this type, by its payload, in order. */
export const sent = (type: string): unknown[] => mockRequest.mock.calls.filter((c) => c[0] === type).map((c) => c[1]);

export async function openWindow(ownNames: readonly string[] = [], onClear: jest.Mock = jest.fn()) {
    const onClose = jest.fn();
    render(<ProjectClearWindow onClose={onClose} onClear={onClear} ownNames={ownNames} />);
    await settle();
    return { onClear, onClose };
}

export const button = (name: string | RegExp): HTMLElement => screen.getByRole('button', { name });

/** The footer's buttons, in order, by their words. */
export const footer = (): string[] =>
    Array.from(document.querySelectorAll('.modal-button')).map((b) => b.textContent ?? '');
