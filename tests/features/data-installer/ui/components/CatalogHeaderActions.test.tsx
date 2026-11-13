/**
 * The Datapacks header's actions (step-04 S1; decisions Phase 7 and 7b): in a project's Datapacks
 * the save button, Install from File, then the Clear menu (Clear Demo Data, Clear Commerce Instance;
 * step 06 C5, J1-1); in the Datapack Library Add from File alone. The save button is one state (`headerSave`), and its words never change while it is on
 * screen: until the state is known it is a disabled, waiting button with no words.
 */

import '../../../../helpers/webviewClientMock';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { press, settle } from '../../../../helpers/reactSettle';

// Below the mock on purpose — see webview-test-authoring §3.
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import {
    CatalogHeaderActions,
    type HeaderSaveActions,
} from '@/features/data-installer/ui/components/CatalogHeaderActions';
import type { HeaderSave } from '@/features/data-installer/ui/headerSave';
import type { ClearWindowKind } from '@/types/demoDataWipe';

const mockRequest = webviewClient.request as jest.Mock;

const SAVE_WORDS = /^(Create|Save|Save As New)$/;

function saveActions(state: HeaderSave): HeaderSaveActions {
    return { state, onCreate: jest.fn(), onSave: jest.fn(), onSaveAsNew: jest.fn() };
}

function renderHeader(save?: HeaderSaveActions): ReturnType<typeof render> {
    return render(<CatalogHeaderActions onCatalogChanged={jest.fn()} save={save} />);
}

/** The items of the menu a labelled trigger opens (the Spectrum mock draws every menu open). */
function menuItemsOf(trigger: string): string[] {
    const shell = screen.getByRole('button', { name: trigger }).closest('div') as HTMLElement;
    return within(within(shell).getByRole('menu')).getAllByRole('menuitem').map((row) => row.textContent ?? '');
}

/** The `check-demo-data` payloads asked so far: `{}` is Clear Demo Data's, `{ websites: [] }` the instance's. */
function checks(): unknown[] {
    return mockRequest.mock.calls.filter((call) => call[0] === 'check-demo-data').map((call) => call[1]);
}

/** The named buttons, in the order the header draws them: every button it has, or a name is missing. */
function buttonsInOrder(names: string[]): string[] {
    const all = screen.getAllByRole('button');
    const found = names.map((name) => ({ name, at: all.indexOf(screen.getByRole('button', { name })) }));
    return all.length === names.length ? found.sort((a, b) => a.at - b.at).map((each) => each.name) : [`${all.length} buttons`];
}

beforeEach(() => {
    mockRequest.mockReset();
    mockRequest.mockResolvedValue({ success: true, data: null });
});

describe("in a project's Datapacks", () => {
    it('waits, disabled and with no words, until the state is known', () => {
        renderHeader(saveActions('pending'));

        const waiting = screen.getByRole('button', { name: 'Loading' });
        expect(waiting).toBeDisabled();
        expect(waiting).not.toHaveTextContent(/\S/);
        expect(screen.queryByRole('button', { name: SAVE_WORDS })).not.toBeInTheDocument();
    });

    it('reads Create with no datapack, and opens the create flow', async () => {
        const save = saveActions('create');
        renderHeader(save);

        await press(screen.getByRole('button', { name: 'Create' }));

        expect(save.onCreate).toHaveBeenCalledTimes(1);
        expect(save.onSave).not.toHaveBeenCalled();
        expect(save.onSaveAsNew).not.toHaveBeenCalled();
    });

    it("is Save ▾ on the SC's own datapack, with Save and Save As New", async () => {
        const save = saveActions('save-menu');
        renderHeader(save);

        expect(screen.getByRole('button', { name: 'Save' })).toHaveTextContent('Save▾');
        expect(menuItemsOf('Save')).toEqual(['Save', 'Save As New']);

        await press(screen.getByRole('menuitem', { name: 'Save' }));
        expect(save.onSave).toHaveBeenCalledTimes(1);
        await press(screen.getByRole('menuitem', { name: 'Save As New' }));
        expect(save.onSaveAsNew).toHaveBeenCalledTimes(1);
        expect(save.onCreate).not.toHaveBeenCalled();
    });

    it("is a plain Save As New on someone else's datapack", async () => {
        const save = saveActions('save-as-new');
        renderHeader(save);

        expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
        await press(screen.getByRole('button', { name: 'Save As New' }));

        expect(save.onSaveAsNew).toHaveBeenCalledTimes(1);
        expect(save.onSave).not.toHaveBeenCalled();
    });

    it('offers no save button when the datapack has no install record (P4-Q4)', () => {
        renderHeader(saveActions('none'));

        expect(screen.queryByRole('button', { name: SAVE_WORDS })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Loading' })).not.toBeInTheDocument();
        expect(buttonsInOrder(['Install from File', 'Clear'])).toEqual(['Install from File', 'Clear']);
    });

    it('puts the save button first, then Install from File, then Clear', () => {
        renderHeader(saveActions('save-as-new'));

        expect(buttonsInOrder(['Save As New', 'Install from File', 'Clear'])).toEqual(['Save As New', 'Install from File', 'Clear']);
    });

    it("opens today's file load from Install from File", async () => {
        renderHeader(saveActions('create'));

        await press(screen.getByRole('button', { name: 'Install from File' }));

        expect(mockRequest.mock.calls.map((call) => call[0])).toContain('open-datapack-zip');
    });

    // 7b: a button's words never change while it is on screen. The first words drawn are the last.
    it.each<[HeaderSave, string]>([
        ['create', 'Create'],
        ['save-menu', 'Save'],
        ['save-as-new', 'Save As New'],
    ])('never shows another label before %s as the answers arrive', (settled, words) => {
        const frames: string[][] = [];
        const record = (): void => {
            frames.push(
                ['Create', 'Save', 'Save As New'].filter((name) =>
                    screen.queryByRole('button', { name })
                )
            );
        };
        const { rerender } = renderHeader(saveActions('pending'));
        record();
        rerender(
            <CatalogHeaderActions onCatalogChanged={jest.fn()} save={saveActions('pending')} />
        );
        record();
        rerender(<CatalogHeaderActions onCatalogChanged={jest.fn()} save={saveActions(settled)} />);
        record();

        expect(frames).toEqual([[], [], [words]]);
    });
});

describe("the Clear menu (step 06 C5, J1-1)", () => {
    it('is Clear ▾ with two items: Clear Demo Data, then Clear Commerce Instance', () => {
        renderHeader(saveActions('create'));

        expect(screen.getByRole('button', { name: 'Clear' })).toHaveTextContent('Clear▾');
        expect(menuItemsOf('Clear')).toEqual(['Clear Demo Data', 'Clear Commerce Instance']);
    });

    it("opens Clear Demo Data's window from its item, and no other", async () => {
        renderHeader(saveActions('create'));
        expect(checks()).toStrictEqual([]);

        await press(screen.getByRole('menuitem', { name: 'Clear Demo Data' }));
        await settle();

        expect(checks()).toEqual([{}]);
        expect(screen.queryByRole('heading', { name: 'Clear Commerce Instance' })).not.toBeInTheDocument();
    });

    it("opens Clear Commerce Instance's window from its item, asking for the instance's websites", async () => {
        renderHeader(saveActions('create'));

        await press(screen.getByRole('menuitem', { name: 'Clear Commerce Instance' }));
        await settle();

        expect(checks()).toEqual([{ websites: [] }]);
        expect(screen.getByRole('heading', { name: 'Clear Commerce Instance' })).toBeInTheDocument();
    });

    // The Command Palette's doors (P6-Q5): the screen hands the header the window it was asked for.
    it.each<[ClearWindowKind, unknown]>([
        ['project', {}],
        ['instance', { websites: [] }],
    ])('opens the %s window it is asked for on arrival, and says it took the request', async (kind, payload) => {
        const taken = jest.fn();
        render(
            <CatalogHeaderActions onCatalogChanged={jest.fn()} save={saveActions('create')} clearRequest={kind} onClearRequestTaken={taken} />
        );
        await settle();

        expect(checks()).toEqual([payload]);
        expect(taken).toHaveBeenCalledTimes(1);
    });

    it('opens nothing on arrival in the Datapack Library, where there is no Clear', async () => {
        const taken = jest.fn();
        render(<CatalogHeaderActions onCatalogChanged={jest.fn()} clearRequest="instance" onClearRequestTaken={taken} />);
        await settle();

        expect(checks()).toStrictEqual([]);
        expect(taken).not.toHaveBeenCalled();
    });
});

describe('in the Datapack Library', () => {
    it('offers Add from File alone: no save button, no Clear', () => {
        renderHeader();

        expect(buttonsInOrder(['Add from File'])).toEqual(['Add from File']);
    });
});
