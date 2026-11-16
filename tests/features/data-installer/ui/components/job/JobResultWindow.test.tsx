/**
 * The uninstall's "One Step Left" result (walk F153, release test 1.4, 2026-11-16): the SC could not
 * tell what had happened or where to go, and opened another store's page. It now says it in plain
 * words, offers Open Admin as the install's Admin step does, and names the root to set back as the
 * store's root before the datapack.
 */

import { mockRequest } from '../../../../../helpers/webviewClientMock';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { ResultContent } from '@/features/data-installer/ui/components/importResult';
import { JobResultWindow } from '@/features/data-installer/ui/components/job/JobResultWindow';

const KEPT: ResultContent = {
    variant: 'warning',
    title: 'One Step Left to Uninstall Frescopa',
    message: "Tailspin Test Store still uses the category Frescopa as its root category, so Demo Builder couldn't delete that category. Everything else is uninstalled.",
    keptRoot: { store: 'Tailspin Test Store', category: 'Frescopa', restore: 'Tailspin Catalog' },
};

beforeEach(() => {
    mockRequest.mockReset();
    mockRequest.mockResolvedValue({ success: true });
});

describe('a removal that left the root a store uses', () => {
    it('offers Open Admin, which opens the project\'s Admin', async () => {
        render(<JobResultWindow result={KEPT} onClose={jest.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Open Admin' }));
        // The spinner clears once the extension answers.
        await act(async () => undefined);

        expect(mockRequest).toHaveBeenCalledWith('openAdminPanel', {});
    });

    it('names the root to set as the store\'s root before the datapack', () => {
        render(<JobResultWindow result={KEPT} onClose={jest.fn()} />);

        expect(screen.getByText(/Tailspin Catalog, its root before the datapack/)).toBeInTheDocument();
    });

    // Walk F153 (owner, 2026-11-16): Check finishes the uninstall once the root is changed.
    it('offers Check, which hands back to run the uninstall again', () => {
        const onCheck = jest.fn();
        render(<JobResultWindow result={KEPT} onClose={jest.fn()} onCheck={onCheck} />);

        fireEvent.click(screen.getByRole('button', { name: 'Check' }));

        expect(onCheck).toHaveBeenCalledTimes(1);
    });

    it('offers no Open Admin on a result with no Admin step', () => {
        render(<JobResultWindow result={{ variant: 'error', title: "Couldn't Uninstall Frescopa", message: 'Stopped.' }} onClose={jest.fn()} />);

        expect(screen.queryByRole('button', { name: 'Open Admin' })).not.toBeInTheDocument();
    });
});
