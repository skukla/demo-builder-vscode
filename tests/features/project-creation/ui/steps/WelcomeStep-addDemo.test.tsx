/**
 * WelcomeStep with added demos: their cards select like a brand and carry the
 * row (D2); a shipped brand clears it; the plus card opens the dialog.
 */

import { fireEvent, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { addedDemoId, packageFromAddedDemo } from '@/features/components/services/storefrontResolver';
import { makeAddedDemo } from '../../../../helpers/demoPackageFixtures';
import { PACKAGES, STACKS, renderWelcome } from './WelcomeStep.testUtils';

jest.mock('@/core/ui/utils/vscode-api', () => ({
    webviewClient: { request: jest.fn() },
}));

import { webviewClient } from '@/core/ui/utils/vscode-api';
import { act } from '@testing-library/react';

const JEN = makeAddedDemo({ configDefaults: { ACCS_WEBSITE_CODE: 'isle5' } });
const JEN_CARD = packageFromAddedDemo(JEN, undefined);

describe('WelcomeStep — added demos', () => {
    it("selecting an added demo's card records its id and its row, with its own defaults", () => {
        const { updateState } = renderWelcome({ packages: [...PACKAGES, JEN_CARD], stacks: STACKS, addedDemos: [JEN] });

        fireEvent.click(screen.getByRole('button', { name: /^Isle5 by Jen:/ }));

        expect(updateState).toHaveBeenCalledWith(
            expect.objectContaining({
                selectedPackage: addedDemoId(JEN),
                demo: JEN,
                packageConfigDefaults: { ACCS_WEBSITE_CODE: 'isle5' },
                selectedStack: undefined,
            }),
        );
    });

    it('selecting a shipped brand afterwards clears the row', () => {
        const { updateState } = renderWelcome({
            packages: [...PACKAGES, JEN_CARD],
            stacks: STACKS,
            addedDemos: [JEN],
            state: { selectedPackage: addedDemoId(JEN), demo: JEN },
        });

        fireEvent.click(screen.getByRole('button', { name: /^CitiSignal:/ }));

        expect(updateState).toHaveBeenCalledWith(
            expect.objectContaining({ selectedPackage: 'citisignal', demo: undefined }),
        );
    });

    it('opens the Add a demo package dialog from the plus card', () => {
        renderWelcome({ packages: PACKAGES, stacks: STACKS });
        expect(screen.queryByRole('heading', { name: 'Add a demo package' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('add-demo-card'));

        expect(screen.getByRole('heading', { name: 'Add a demo package' })).toBeInTheDocument();
    });
});

describe('WelcomeStep — forgetting an added demo', () => {
    const request = webviewClient.request as jest.Mock;

    beforeEach(() => {
        request.mockReset();
    });

    it('asks the host to forget the demo by name and source', async () => {
        request.mockResolvedValue({ success: true, result: { forgotten: true } });
        renderWelcome({ packages: [...PACKAGES, JEN_CARD], stacks: STACKS, addedDemos: [JEN] });

        await act(async () => {
            screen.getByLabelText('More actions for Isle5 by Jen').click();
        });
        await act(async () => {
            screen.getByRole('menuitem', { name: 'Remove' }).click();
        });

        expect(request).toHaveBeenCalledWith('forget-added-demo', {
            name: 'Isle5 by Jen',
            source: { owner: 'jen', repo: 'isle5-demo' },
        });
    });

    it('deselects a forgotten demo that was the selection, row included; leaves a cancelled one alone', async () => {
        request.mockResolvedValueOnce({ success: true, result: { forgotten: false } });
        const { updateState } = renderWelcome({
            packages: [...PACKAGES, JEN_CARD],
            stacks: STACKS,
            addedDemos: [JEN],
            state: { selectedPackage: addedDemoId(JEN), demo: JEN },
        });
        updateState.mockClear();

        await act(async () => {
            screen.getByLabelText('More actions for Isle5 by Jen').click();
        });
        await act(async () => {
            screen.getByRole('menuitem', { name: 'Remove' }).click();
        });
        expect(updateState).not.toHaveBeenCalled();

        request.mockResolvedValueOnce({ success: true, result: { forgotten: true } });
        await act(async () => {
            screen.getByLabelText('More actions for Isle5 by Jen').click();
        });
        await act(async () => {
            screen.getByRole('menuitem', { name: 'Remove' }).click();
        });
        expect(updateState).toHaveBeenCalledWith({ selectedPackage: undefined, demo: undefined });
    });
});

describe('WelcomeStep — editing an added demo', () => {
    const request = webviewClient.request as jest.Mock;

    beforeEach(() => {
        request.mockReset();
    });

    async function openEdit(): Promise<void> {
        await act(async () => {
            screen.getByLabelText('More actions for Isle5 by Jen').click();
        });
        await act(async () => {
            screen.getByRole('menuitem', { name: 'Edit' }).click();
        });
    }

    it('opens Edit demo package with the name and description filled in, and saves both by the demo\'s repository', async () => {
        const described = { ...JEN, description: 'Old words' };
        const edited = { ...described, name: 'Isle5 luxury', description: 'New words' };
        request.mockResolvedValue({ success: true, result: { demo: edited } });
        const { updateState } = renderWelcome({
            packages: [...PACKAGES, packageFromAddedDemo(described, undefined)],
            stacks: STACKS,
            addedDemos: [described],
            state: { selectedPackage: addedDemoId(described), demo: described },
        });
        updateState.mockClear();

        await openEdit();
        expect(screen.getByRole('heading', { name: 'Edit demo package' })).toBeInTheDocument();
        const name = screen.getByLabelText('Demo name', { selector: 'input' }) as HTMLInputElement;
        const description = screen.getByLabelText('Description', { selector: 'textarea' }) as HTMLTextAreaElement;
        expect(name.value).toBe('Isle5 by Jen');
        expect(description.value).toBe('Old words');
        // Where the card reads from, shown and not editable: a new repository is
        // re-added through Add a demo package, which reads it (owner, 2026-09-15).
        expect(screen.getByTestId('found-Code')).toHaveTextContent('github.com/jen/isle5-demo');
        expect(screen.getByTestId('found-Code').querySelector('input')).toBeNull();

        fireEvent.change(name, { target: { value: 'Isle5 luxury' } });
        fireEvent.change(description, { target: { value: 'New words' } });
        await act(async () => {
            screen.getByRole('button', { name: 'Save' }).click();
        });

        expect(request).toHaveBeenCalledWith('edit-added-demo', {
            source: { owner: 'jen', repo: 'isle5-demo' },
            name: 'Isle5 luxury',
            description: 'New words',
        });
        // The selected card's row follows, so the Build summary shows the new name.
        expect(updateState).toHaveBeenCalledWith({ demo: edited });
        expect(screen.queryByRole('heading', { name: 'Edit demo package' })).not.toBeInTheDocument();
    });

    it('will not save a blank name, and keeps the dialog open with the refusal when the host says no', async () => {
        request.mockResolvedValue({ success: false, error: 'jen/isle5-demo is not on your Welcome step.' });
        renderWelcome({ packages: [...PACKAGES, JEN_CARD], stacks: STACKS, addedDemos: [JEN] });

        await openEdit();
        const name = screen.getByLabelText('Demo name', { selector: 'input' });
        fireEvent.change(name, { target: { value: '   ' } });
        expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-disabled', 'true');

        fireEvent.change(name, { target: { value: 'Isle5' } });
        await act(async () => {
            screen.getByRole('button', { name: 'Save' }).click();
        });

        expect(screen.getByTestId('edit-demo-error')).toHaveTextContent('jen/isle5-demo is not on your Welcome step.');
        expect(screen.getByRole('heading', { name: 'Edit demo package' })).toBeInTheDocument();
    });
});
