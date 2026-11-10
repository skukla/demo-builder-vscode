/**
 * Importing a pack the project has again (owner, 2026-11-08, walk F56): the window opens on the
 * house wait while the store is compared with the pack, then the form shows what each data type
 * would change, and Import runs straight away. A first install compares nothing.
 */

import { screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { defaultResponse, mockRequest, press, renderModal, resetModalMocks, settle } from './ImportDatapackModal.testUtils';
import type { KindChanges } from '@/features/data-installer/services/demoBuilderEngine/storeChanges';
import type { HandlerResponse } from '@/types/handlers';

const named = (count: number) => ({ count, names: [] });
const kind = (name: string, update: number, add: number, remove: number): KindChanges => ({
    kind: name,
    update: named(update),
    add: named(add),
    inStore: named(0),
    remove: named(remove),
    keep: named(0),
});
const PREVIEW = { installed: true, kinds: [kind('products', 12, 3, 0), kind('categories', 0, 0, 0)] };

const previewCalls = () => mockRequest.mock.calls.filter(([type]) => type === 'preview-datapack-changes');

const SCOPES = {
    websites: [
        { code: 'base', name: 'Main Website', storeViews: [{ code: 'default', name: 'Default View' }] },
        { code: 'bodea', name: 'Bodea Website', storeViews: [{ code: 'bodea_view', name: 'Bodea View' }] },
    ],
};
const INSTALLED_AT = { websiteCode: 'bodea', storeCode: 'bodea_view' };

/** The project has the pack when `recorded` names kinds; the preview answers `preview`. */
function answers(
    recorded: string[],
    preview: HandlerResponse | (() => Promise<HandlerResponse>),
    installedAt?: typeof INSTALLED_AT,
): void {
    mockRequest.mockImplementation(async (type: string) => {
        if (type === 'list-datapack-import-scopes') return { success: true, data: SCOPES };
        if (type === 'get-datapack-removal-scope') {
            return { success: true, data: { recordedKinds: recorded, ...(installedAt ? { installedAt } : {}) } };
        }
        if (type === 'preview-datapack-changes') return typeof preview === 'function' ? preview() : preview;
        return defaultResponse(type);
    });
}

/** The form is up: its checkboxes carry their change line in their name, so match the start. */
async function awaitForm(): Promise<void> {
    await settle();
    await screen.findByRole('checkbox', { name: /^Categories/ });
}

beforeEach(() => resetModalMocks());

describe('importing a pack the project has', () => {
    it('waits on the comparison, saying so, with no Import to press', async () => {
        answers(['products'], () => new Promise(() => undefined));
        renderModal();
        await settle();

        // The same check, in the same words, as before a removal or a replace (walk F114).
        expect(screen.getByText('Checking for your changes')).toBeInTheDocument();
        expect(screen.getByText("Since this demo's last save")).toBeInTheDocument();
        expect(screen.getByText('Usually about a minute')).toBeInTheDocument();
        expect(screen.queryByRole('checkbox', { name: /Categories/ })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Import' })).toBeNull();
        expect(previewCalls()[0][1]).toEqual({ datapackName: 'bodea', version: 'main' });
    });

    it('then shows what each data type would change under its name', async () => {
        answers(['products'], { success: true, data: PREVIEW });
        renderModal();
        await awaitForm();

        expect(screen.getByRole('checkbox', { name: /Products/ })).toHaveAccessibleName(/12 updated, 3 added/);
        expect(screen.getByRole('checkbox', { name: /Categories/ })).toHaveAccessibleName(/No changes/);
        expect(previewCalls()).toHaveLength(1);
    });

    it('names a library pack’s store, as the import does', async () => {
        answers(['products'], { success: true, data: PREVIEW });
        renderModal({ source: 'library' });
        await awaitForm();

        expect(previewCalls()[0][1]).toEqual({ datapackName: 'bodea', version: 'main', source: 'library' });
    });

    it('says so when the comparison could not be read, and still offers the form', async () => {
        answers(['products'], { success: false, error: 'The store did not answer.' });
        renderModal();
        await awaitForm();

        expect(screen.getByText('What importing again would change could not be read.')).toBeInTheDocument();
        expect(screen.queryByText('No changes')).toBeNull();
    });

    it('stops showing the counts once something has run from the window', async () => {
        answers(['products'], { success: true, data: PREVIEW });
        renderModal();
        await awaitForm();

        await press(screen.getByRole('checkbox', { name: /^Products/ }));
        await press(screen.getByRole('button', { name: 'Import' }));
        await settle();

        expect(mockRequest.mock.calls.some(([type]) => type === 'start-datapack-import')).toBe(true);

        expect(screen.queryByText('12 updated, 3 added')).toBeNull();
    });
});

/** A scope picker's select, by its accessible name (the mock puts `aria-label` on its button). */
function pickerFor(label: RegExp): HTMLSelectElement {
    const button = screen.getAllByTestId('spectrum-picker').find((node) => label.test(node.getAttribute('aria-label') ?? ''));
    const wrapper = button?.closest('[data-testid="spectrum-picker-wrapper"]');
    return wrapper?.querySelector('[data-testid="spectrum-picker-select"]') as HTMLSelectElement;
}

describe('where an installed pack goes', () => {
    it('locks the website and store view to where it is installed, and imports there', async () => {
        answers(['products'], { success: true, data: PREVIEW }, INSTALLED_AT);
        renderModal();
        await awaitForm();

        expect(pickerFor(/^website$/i)).toBeDisabled();
        expect(pickerFor(/store view/i)).toBeDisabled();
        expect(pickerFor(/^website$/i)).toHaveValue('bodea');

        await press(screen.getByRole('checkbox', { name: /^Products/ }));
        await press(screen.getByRole('button', { name: 'Import' }));
        const start = mockRequest.mock.calls.find(([type]) => type === 'start-datapack-import');
        expect(start?.[1]).toEqual(expect.objectContaining(INSTALLED_AT));
    });

    it('leaves them free for a pack the project does not have', async () => {
        answers([], { success: true, data: PREVIEW });
        renderModal();
        await awaitForm();

        expect(pickerFor(/^website$/i)).not.toBeDisabled();
    });
});

describe('a first install', () => {
    it('compares nothing and opens on the form with no counts', async () => {
        answers([], { success: true, data: PREVIEW });
        renderModal();
        await awaitForm();

        expect(previewCalls()).toHaveLength(0);
        expect(screen.queryByText('Comparing with Commerce')).toBeNull();
        expect(screen.queryByText('No changes')).toBeNull();
    });
});
