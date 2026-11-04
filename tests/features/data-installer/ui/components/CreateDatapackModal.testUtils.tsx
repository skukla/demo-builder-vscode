/**
 * Shared harness for the `CreateDatapackModal` suite family: the export routes, reached the way the
 * SC reaches them, by the cards and checkboxes.
 *
 * THIS FILE OWNS THE MOCK WALL AND THE SUT IMPORT: `jest.mock` hoists above the imports of the module
 * it appears in, not across modules, so a spec that imported the modal itself could bind to an
 * unmocked client.
 */

import '../../../../helpers/webviewClientMock';
import React from 'react';
import { render, screen } from '@testing-library/react';

import { change, press, settle } from '../../../../helpers/reactSettle';

// Below the wall on purpose: see webview-test-authoring §3.
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { CreateDatapackModal } from '@/features/data-installer/ui/components/CreateDatapackModal';
import type { TargetWebsite } from '@/features/data-installer/ui/hooks/useImportScopes';

export { CreateDatapackModal };
export const mockRequest = webviewClient.request as jest.Mock;

/**
 * The export type catalog, as `list-datapack-data-types` really answers it.
 *
 * `dataTypes` is a STRING ARRAY: `getProcessorOrder` returns names. An earlier fixture used
 * `[{dataType: '…'}]`, which matched the component's wrong assumption and let an empty list ship.
 * Caught only in the Extension Dev Host.
 */
export const EXPORT_TYPES = { mode: 'export', dataTypes: ['attribute_sets', 'categories'] };

const WEBSITES: TargetWebsite[] = [
    {
        code: 'base',
        name: 'Main Website',
        storeViews: [
            { code: 'default', name: 'Default Store View' },
            { code: 'fr', name: 'French' },
        ],
    },
    { code: 'citisignal', name: 'CitiSignal Website', storeViews: [{ code: 'citisignal_us', name: 'CitiSignal US' }] },
];

/** What `list-datapack-import-scopes` answers: websites, each with its store views. */
export const SCOPES = { 'list-datapack-import-scopes': { success: true, data: { websites: WEBSITES } } };

export function withService(over: Record<string, unknown> = {}) {
    mockRequest.mockImplementation(async (type: string, payload?: Record<string, unknown>) => {
        if (type in over) return over[type];
        if (type === 'list-datapack-data-types') {
            // HONOURS the payload, exactly as the handler does. A mock that answers regardless of
            // the key let `mode` instead of `operationMode` ship: the section rendered empty in the
            // Dev Host while all seven tests passed.
            return payload?.operationMode
                ? { success: true, data: EXPORT_TYPES }
                : { success: false, error: 'An operation mode is required (import, export, delete or validate).' };
        }
        if (type === 'get-datapack-import-target') {
            return { success: true, data: { instance: 'inst-1', projectName: 'demo-1' } };
        }
        return { success: true, data: null };
    });
}

/** A card, by the name it starts with: its accessible name runs on into its line and note. */
export const card = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });
export const check = (name: string) => screen.getByRole('checkbox', { name: new RegExp(`^${name}`) });
export const button = (name: string) => screen.getByRole('button', { name });

/** The first screen, with nothing pressed. */
export async function renderCreate(engine?: 'service' | 'demo-builder') {
    const props = { onClose: jest.fn() };
    const result = render(<CreateDatapackModal engine={engine} {...props} />);
    await settle();
    return { ...props, ...result };
}

/**
 * The Commerce pack's first screen, the data types. There is no pack-type screen while ACO packs
 * are held back (owner, 2026-11-03); the ACO line reverts this.
 */
export async function renderExport() {
    return renderCreate('service');
}

/**
 * The house Modal renders its action buttons as `div role="button"` with `aria-disabled`, not native
 * `<button disabled>`, so assert the attribute.
 */
export function isOff(name: string): boolean {
    return button(name).getAttribute('aria-disabled') === 'true';
}

export async function fillIdentity(name: string, version: string): Promise<void> {
    await change(screen.getByRole('textbox', { name: /datapack name/i }), name);
    await change(screen.getByRole('textbox', { name: /version/i }), version);
}

/** From the data types: tick one, name the pack, and press Export. */
export async function exportAs(name: string, version: string) {
    await press(check('Attribute Sets'));
    await press(button('Continue'));
    await fillIdentity(name, version);
    await press(button('Export'));
}

/** The payload `start-datapack-export` was called with, or undefined. */
export function exportCall(): Record<string, unknown> | undefined {
    return mockRequest.mock.calls.find((c) => c[0] === 'start-datapack-export')?.[1];
}

/** A successful export envelope carrying `perType` verbatim. */
export function exportAnswer(perType: unknown[], success = true) {
    return { 'start-datapack-export': { success: true, data: { success, perType } } };
}
