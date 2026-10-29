/**
 * WelcomeStep — the handlers it hands the gallery and the two demo dialogs.
 *
 * The sibling suites drive these through the real gallery, which can only ever ask
 * about the ONE added demo it rendered and never re-renders between the ask and the
 * answer. That left the decisions inside the handlers unconstrained: which row a
 * package id resolves to when there are several, what happens for an id that is not
 * an added demo, whether a selection that is NOT the demo is left alone, and whether
 * a handler still sees the props of the render it was made in after they change.
 *
 * So the three children are replaced by stubs that record the props they were handed,
 * and every assertion is on an ARGUMENT: what the step asked the host for, what it
 * told `updateState`, and what it passed back down to a dialog.
 *
 * The mocks are declared here and hoist above the imports, so the step in
 * `WelcomeStep.testUtils` binds to the stubs.
 */

import { act } from '@testing-library/react';
import { addedDemoId } from '@/features/components/services/storefrontResolver';
import type { AddDemoModalProps } from '@/features/project-creation/ui/components/add-demo/AddDemoModal';
import type { EditDemoPackageModalProps } from '@/features/project-creation/ui/components/add-demo/EditDemoPackageModal';
import type { BrandGalleryProps } from '@/features/project-creation/ui/components/BrandGallery';
import { makeAddedDemo } from '../../../../helpers/demoPackageFixtures';
import {
    PACKAGES,
    STACKS,
    renderWelcome,
    type RenderWelcomeOptions,
} from './WelcomeStep.testUtils';

const mockSeen: {
    gallery?: BrandGalleryProps;
    addModal?: AddDemoModalProps;
    editModal?: EditDemoPackageModalProps;
} = {};

jest.mock('@/features/project-creation/ui/components/BrandGallery', () => ({
    BrandGallery: (props: BrandGalleryProps) => {
        mockSeen.gallery = props;
        return null;
    },
}));
jest.mock('@/features/project-creation/ui/components/add-demo/AddDemoModal', () => ({
    AddDemoModal: (props: AddDemoModalProps) => {
        mockSeen.addModal = props;
        return null;
    },
}));
jest.mock('@/features/project-creation/ui/components/add-demo/EditDemoPackageModal', () => ({
    EditDemoPackageModal: (props: EditDemoPackageModalProps) => {
        mockSeen.editModal = props;
        return null;
    },
}));
jest.mock('@/core/ui/utils/vscode-api', () => ({
    webviewClient: { request: jest.fn() },
}));

import { webviewClient } from '@/core/ui/utils/vscode-api';

const request = webviewClient.request as jest.Mock;

// Two rows, and the one under test is deliberately SECOND: a lookup that ignores its
// predicate returns the first row, which is then visibly the wrong demo.
const OTHER = makeAddedDemo({ name: 'Bodea by Kai', source: { owner: 'kai', repo: 'bodea-demo' } });
const JEN = makeAddedDemo();
const BOTH = [OTHER, JEN];
const JEN_ID = addedDemoId(JEN);

const CATALOG: RenderWelcomeOptions = { packages: PACKAGES, stacks: STACKS };

function gallery(): BrandGalleryProps {
    if (!mockSeen.gallery) throw new Error('WelcomeStep rendered no gallery');
    return mockSeen.gallery;
}
function addModal(): AddDemoModalProps {
    if (!mockSeen.addModal) throw new Error('WelcomeStep rendered no Add dialog');
    return mockSeen.addModal;
}
function editModal(): EditDemoPackageModalProps {
    if (!mockSeen.editModal) throw new Error('WelcomeStep rendered no Edit dialog');
    return mockSeen.editModal;
}

async function forget(packageId: string): Promise<void> {
    await act(async () => {
        gallery().onForgetDemo?.(packageId);
    });
}

beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue({ success: true, result: { forgotten: true } });
    mockSeen.gallery = undefined;
    mockSeen.addModal = undefined;
    mockSeen.editModal = undefined;
});

describe('WelcomeStep — forgetting an added demo', () => {
    it('asks the host about the demo whose card was used, not the first one added', async () => {
        renderWelcome({ ...CATALOG, addedDemos: BOTH });

        await forget(JEN_ID);

        expect(request.mock.calls).toStrictEqual([
            [
                'forget-added-demo',
                { name: 'Isle5 by Jen', source: { owner: 'jen', repo: 'isle5-demo' } },
            ],
        ]);
    });

    it('asks the host nothing for a card that is not an added demo', async () => {
        renderWelcome({ ...CATALOG, addedDemos: BOTH });

        await forget('citisignal');

        expect(request).not.toHaveBeenCalled();
    });

    it('clears the selection AND the row when the forgotten demo was the selection', async () => {
        const { updateState } = renderWelcome({
            ...CATALOG,
            addedDemos: BOTH,
            state: { selectedPackage: JEN_ID, demo: JEN },
        });
        updateState.mockClear();

        await forget(JEN_ID);

        // Read off the call, key by key: `toHaveBeenCalledWith({ a: undefined })`
        // is satisfied by `{}`, which would leave the selection in place.
        expect(updateState).toHaveBeenCalledTimes(1);
        const [patch] = updateState.mock.calls[0];
        expect(Object.keys(patch).sort()).toStrictEqual(['demo', 'selectedPackage']);
        expect(patch.selectedPackage).toBeUndefined();
        expect(patch.demo).toBeUndefined();
    });

    it('leaves a different selection alone when another demo is forgotten', async () => {
        const { updateState } = renderWelcome({
            ...CATALOG,
            addedDemos: BOTH,
            state: { selectedPackage: addedDemoId(OTHER), demo: OTHER },
        });
        updateState.mockClear();

        await forget(JEN_ID);

        expect(request).toHaveBeenCalledTimes(1);
        expect(updateState).not.toHaveBeenCalled();
    });

    it('forgets a demo that was added after the step first rendered', async () => {
        const { rerender } = renderWelcome({ ...CATALOG, addedDemos: [] });
        rerender({ ...CATALOG, addedDemos: BOTH });

        await forget(JEN_ID);

        expect(request).toHaveBeenCalledWith(
            'forget-added-demo',
            expect.objectContaining({ name: 'Isle5 by Jen' })
        );
    });
});

describe('WelcomeStep — editing an added demo', () => {
    it('opens the Edit dialog on the demo whose card was used, not the first one added', () => {
        renderWelcome({ ...CATALOG, addedDemos: BOTH });
        expect(editModal().demo).toBeUndefined();

        act(() => gallery().onEditDemo?.(JEN_ID));

        expect(editModal().demo).toBe(JEN);
    });

    it('opens the Edit dialog on a demo that was added after the step first rendered', () => {
        const { rerender } = renderWelcome({ ...CATALOG, addedDemos: [] });
        rerender({ ...CATALOG, addedDemos: BOTH });

        act(() => gallery().onEditDemo?.(JEN_ID));

        expect(editModal().demo).toBe(JEN);
    });

    it('does not move the selected row when the edited demo is not the selection', () => {
        const { updateState } = renderWelcome({
            ...CATALOG,
            addedDemos: BOTH,
            state: { selectedPackage: addedDemoId(OTHER), demo: OTHER },
        });
        updateState.mockClear();

        act(() => editModal().onSaved({ ...JEN, name: 'Isle5 luxury' }));

        expect(updateState).not.toHaveBeenCalled();
    });

    it('moves the selected row to the saved edit when the demo was selected after first render', () => {
        const edited = { ...JEN, name: 'Isle5 luxury' };
        const { updateState, rerender } = renderWelcome({ ...CATALOG, addedDemos: BOTH });
        rerender({ ...CATALOG, addedDemos: BOTH, state: { selectedPackage: JEN_ID, demo: JEN } });
        updateState.mockClear();

        act(() => editModal().onSaved(edited));

        expect(updateState.mock.calls).toStrictEqual([[{ demo: edited }]]);
    });
});

describe('WelcomeStep — the Add a demo package dialog', () => {
    it('opens from the gallery and closes again when the dialog asks to', () => {
        renderWelcome(CATALOG);
        expect(addModal().isOpen).toBe(false);

        act(() => gallery().onAddDemo?.());
        expect(addModal().isOpen).toBe(true);

        act(() => addModal().onClose());
        expect(addModal().isOpen).toBe(false);
    });

    it('selects a demo the dialog just added, row included, with no container listening', () => {
        const { updateState } = renderWelcome(CATALOG);
        updateState.mockClear();

        expect(() => act(() => addModal().onDemoAdded(JEN))).not.toThrow();

        expect(updateState).toHaveBeenCalledWith(
            expect.objectContaining({ selectedPackage: JEN_ID, demo: JEN })
        );
    });

    it('tells the container about the demo, through the listener of the CURRENT render', () => {
        const onDemoAdded = jest.fn();
        const { rerender } = renderWelcome(CATALOG);
        rerender({ ...CATALOG, onDemoAdded });

        act(() => addModal().onDemoAdded(JEN));

        expect(onDemoAdded.mock.calls).toStrictEqual([[JEN]]);
    });
});
