/**
 * The chosen datapack is named by its NAME, not its id (F284).
 *
 * The summary's Datapacks row and the Final Review's Datapack row both read
 * `chosenDatapackName`. Its name comes from the card the SC pressed
 * (`datapackDisplayName`); an imported, copied or edited project arrives with only the
 * id, so `useChosenDatapackName` reads the catalog once and records the card's name.
 * The id is shown only when the catalog does not list the pack at all.
 *
 * The mock returns the handler ENVELOPE (`{success, data}`), as the real channel does,
 * so the real unwrapping in `useDataInstallerRequest` runs.
 */

import { renderHook } from '@testing-library/react';

const mockExecute = jest.fn().mockResolvedValue(undefined);
let mockData: unknown = null;
jest.mock('@/core/ui/hooks/useVSCodeRequest', () => ({
    useVSCodeRequest: () => ({
        execute: mockExecute,
        reset: jest.fn(),
        loading: false,
        error: null,
        data: mockData,
    }),
}));

import { chosenDatapackName } from '@/features/project-creation/ui/steps/datapackName';
import { useChosenDatapackName } from '@/features/project-creation/ui/steps/useChosenDatapackName';
import type { WizardState } from '@/types/webview';

const PACK = { name: 'release-save-test-2-50de15', version: 'main', store: 'library' as const };

function state(overrides: Partial<WizardState>): WizardState {
    return { currentStep: 'build-your-project', ...overrides } as WizardState;
}

function catalog(displayName: string, name = PACK.name) {
    return {
        success: true,
        data: {
            items: [
                {
                    id: { name, version: 'main' },
                    displayName,
                    shared: false,
                    dataTypes: [],
                    art: {},
                },
            ],
        },
    };
}

beforeEach(() => {
    mockExecute.mockClear();
    mockData = null;
});

describe('chosenDatapackName', () => {
    it('names the pack as its card did', () => {
        expect(
            chosenDatapackName(
                state({ datapack: PACK, datapackDisplayName: 'Release Save Test 2' })
            )
        ).toBe('Release Save Test 2');
    });

    it('falls back to the recorded id when no name is known', () => {
        expect(chosenDatapackName(state({ datapack: PACK }))).toBe(PACK.name);
    });

    it('is nothing when no pack is chosen', () => {
        expect(chosenDatapackName(state({}))).toBeUndefined();
    });
});

describe('useChosenDatapackName', () => {
    it('reads the catalog when a pack arrives with no name', () => {
        renderHook(() => useChosenDatapackName(state({ datapack: PACK }), jest.fn()));

        expect(mockExecute).toHaveBeenCalledTimes(1);
    });

    it("records the catalog card's name for a pack that arrived with only its id", () => {
        mockData = catalog('Release Save Test 2');
        const updateState = jest.fn();

        renderHook(() => useChosenDatapackName(state({ datapack: PACK }), updateState));

        expect(updateState).toHaveBeenCalledWith({ datapackDisplayName: 'Release Save Test 2' });
    });

    it('records nothing when the catalog does not list the pack', () => {
        mockData = catalog('Some Other Pack', 'some-other-pack');
        const updateState = jest.fn();

        renderHook(() => useChosenDatapackName(state({ datapack: PACK }), updateState));

        expect(updateState).not.toHaveBeenCalled();
    });

    it('reads nothing when the name is already known', () => {
        renderHook(() =>
            useChosenDatapackName(
                state({ datapack: PACK, datapackDisplayName: 'Release Save Test 2' }),
                jest.fn()
            )
        );

        expect(mockExecute).not.toHaveBeenCalled();
    });

    it('reads nothing when no pack is chosen', () => {
        renderHook(() => useChosenDatapackName(state({}), jest.fn()));

        expect(mockExecute).not.toHaveBeenCalled();
    });
});
