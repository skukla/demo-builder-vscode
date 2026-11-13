/**
 * Shared preamble for the `DatapackJobWindow` suites: the canonical webviewClient double, imported
 * BEFORE the component (webview-test-authoring §3), the answers each request gets, and the render.
 * Specs import the component from here and never reach for it directly.
 */

import { mockPostMessage } from '../../../../../helpers/webviewClientMock';
import React from 'react';
import { render } from '@testing-library/react';
import { press, settle } from '../../../../../helpers/reactSettle';

// Below the mock on purpose — see the module docstring.
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { KindChanges } from '@/features/data-installer/services/demoBuilderEngine/storeChanges';
import type { ImportJobRecord } from '@/features/data-installer/types';
import { DatapackJobWindow } from '@/features/data-installer/ui/components/job/DatapackJobWindow';
import type { DatapackRecordsResult } from '@/types/webviewRequests';

export { mockPostMessage, press, settle };

export const mockRequest = webviewClient.request as jest.Mock;

const named = (count: number) => ({ count, names: [] });
const kind = (code: string, add: number, update = 0): KindChanges => ({
    kind: code,
    add: named(add),
    update: named(update),
    inStore: named(0),
    remove: named(0),
    keep: named(0),
});

/** What an install of Bodea adds, as the check reads it. */
export const BODEA_PREVIEW = {
    installed: false,
    kinds: [kind('categories', 21), kind('products', 53, 3)],
};

export const BODEA_RECORDS: DatapackRecordsResult = {
    records: {
        categories: ['Lab Equipment', 'Lab Equipment/Centrifuges'],
        products: ['BD-CENTRIFUGE', 'BD-GLOVES'],
    },
};

/** The project's own website and store view, as `get-datapack-import-target` reports them. */
export const PROJECT_SCOPE = { websiteCode: 'bodea', storeCode: 'bodea_us' };

/** A job record for `act-1`, the activation every start answers with. */
export function record(over: Partial<ImportJobRecord> = {}): ImportJobRecord {
    return {
        activationId: 'act-1',
        datapackName: 'bodea',
        version: 'main',
        commerceInstance: 'inst',
        dataTypes: ['categories', 'products'],
        startedAt: '2026-11-12T10:00:00.000Z',
        outcome: 'watching',
        perType: {},
        ...over,
    };
}

/** What each request answers; a spec overrides the ones it is about. */
export interface Answers {
    target: unknown;
    /** Before Install is pressed. */
    statusBefore: ImportJobRecord | null;
    /** Once Install has been pressed. */
    statusAfter: ImportJobRecord | null;
    preview: unknown;
    validate: unknown;
    start: unknown;
    records: unknown;
    /** What the held datapack's changes read answers (a switch's check, S6). */
    changes: unknown;
    /** What an uninstall takes, from the install record (S7). */
    scope: unknown;
    /** An uninstall's start (S7). */
    reset: unknown;
}

const DEFAULT_ANSWERS: Answers = {
    target: {
        success: true,
        data: { instance: 'inst', projectName: 'demo-1', scope: PROJECT_SCOPE },
    },
    statusBefore: null,
    statusAfter: record({
        outcome: 'success',
        perType: { categories: 'success', products: 'success' },
    }),
    preview: { success: true, data: BODEA_PREVIEW },
    validate: { success: true, data: { valid: true } },
    start: { success: true, data: { activationId: 'act-1' } },
    records: { success: true, data: BODEA_RECORDS },
    changes: { success: true, data: { count: 0, kinds: [], alwaysSave: false } },
    scope: { success: true, data: { kinds: null } },
    reset: { success: true, data: { activationId: 'act-1' } },
};

/** Answer every request the window sends; `never` leaves that one unanswered. */
export function answer(over: Partial<Answers> = {}, never: string[] = []): void {
    const a = { ...DEFAULT_ANSWERS, ...over };
    let started = false;
    mockRequest.mockReset();
    mockRequest.mockImplementation(async (type: string) => {
        if (never.includes(type)) return new Promise(() => undefined);
        switch (type) {
            case 'get-datapack-import-target':
                return a.target;
            case 'get-datapack-import-status':
                return { success: true, data: started ? a.statusAfter : a.statusBefore };
            case 'preview-datapack-changes':
                return a.preview;
            case 'validate-datapack-import':
                return a.validate;
            case 'start-datapack-import':
                started = true;
                return a.start;
            case 'get-datapack-records':
                return a.records;
            case 'get-datapack-removal-changes':
                return a.changes;
            case 'get-datapack-removal-scope':
                return a.scope;
            case 'reset-datapack':
                started = true;
                return a.reset;
            default:
                return { success: true, data: null };
        }
    });
}

/** The payload of the first request of `type`. */
export const sent = (type: string): unknown =>
    mockRequest.mock.calls.find((c) => c[0] === type)?.[1];
/** How many requests of `type` were sent. */
export const sends = (type: string): number =>
    mockRequest.mock.calls.filter((c) => c[0] === type).length;

export function renderWindow(over: Partial<React.ComponentProps<typeof DatapackJobWindow>> = {}) {
    const onClose = jest.fn();
    const view = render(
        <DatapackJobWindow
            id={{ name: 'bodea', version: 'main' }}
            displayName="Bodea"
            types={['categories', 'products']}
            startsAt="check"
            onClose={onClose}
            {...over}
        />
    );
    return { ...view, onClose };
}
