/**
 * Shared set-up for the Add from File suites (split for step-07 F1/F2): the host's answers to
 * `open-datapack-zip`, `load-datapack-zip` and `delete-library-datapack`, the modal rendered, and the
 * payloads each request carried, since the handlers decide on those fields.
 *
 * Owns the SUT import (webview-test-authoring §3): the client mock is imported first, so it is in
 * place before the modal binds to the client. Specs import the modal only through `openModal`.
 */

import '../../../../helpers/webviewClientMock';
import React from 'react';
import { render } from '@testing-library/react';
import { OPENED_FILE, loadedFile } from '../../../../helpers/datapackFileFixtures';
import { settle } from '../../../../helpers/reactSettle';

// Below the mock import on purpose — see webview-test-authoring §3.
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import {
    AddDatapackFileModal,
    type AddDatapackFileModalProps,
} from '@/features/data-installer/ui/components/AddDatapackFileModal';

export const mockRequest = webviewClient.request as jest.Mock;

export const OPENED = OPENED_FILE;

/** The host, answering each request; `over` replaces an answer by request type. */
export function withService(over: Record<string, unknown> = {}): void {
    mockRequest.mockReset();
    mockRequest.mockImplementation(async (type: string) => {
        if (type in over) return over[type];
        if (type === 'open-datapack-zip') return { success: true, data: OPENED };
        if (type === 'load-datapack-zip') return { success: true, data: loadedFile() };
        if (type === 'delete-library-datapack') return { success: true, data: { deleted: true } };
        return { success: true, data: null };
    });
}

/** The modal, once the file is open. */
export async function openModal(
    props: Partial<AddDatapackFileModalProps> = {}
): Promise<jest.Mock> {
    const onClose = jest.fn();
    render(<AddDatapackFileModal onClose={onClose} {...props} />);
    await settle();
    return onClose;
}

/** What the load sent, or nothing when it never ran. */
export function loadCall(): Record<string, unknown> | undefined {
    return mockRequest.mock.calls.find((c) => c[0] === 'load-datapack-zip')?.[1];
}

/** Every delete sent, in order. */
export function deleteCalls(): unknown[] {
    return mockRequest.mock.calls
        .filter((c) => c[0] === 'delete-library-datapack')
        .map((c) => c[1]);
}
