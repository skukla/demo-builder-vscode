/**
 * "Clear Demo Data", the interim window of step 06's C2a (C2b rebuilds it to J1): no picker; it asks
 * what clearing every website the project uses would do, lists one line per data type, says the
 * check's warning and problem where the list lands, and Clear hands that list's token to the screen.
 * Every request is asserted by its payload, because the handler decides on those fields.
 */

import '../../../../helpers/webviewClientMock';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { press, settle } from '../../../../helpers/reactSettle';

// Below the mock import on purpose — see webview-test-authoring §3.
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { ClearDemoDataModal } from '@/features/data-installer/ui/components/ClearDemoDataModal';
import type { ClearCheck } from '@/types/demoDataWipe';
import { BODEA_CHECK, EMPTY_CHECK } from '../../../../helpers/clearCheckFixtures';

const mockRequest = webviewClient.request as jest.Mock;

function answering(check: ClearCheck): void {
    mockRequest.mockReset();
    mockRequest.mockImplementation(async (type: string) => (type === 'check-demo-data' ? { success: true, data: check } : { success: true, data: null }));
}

const checks = () => mockRequest.mock.calls.filter((c) => c[0] === 'check-demo-data').map((c) => c[1]);

async function openModal() {
    const onClear = jest.fn();
    const onClose = jest.fn();
    render(<ClearDemoDataModal onClose={onClose} onClear={onClear} />);
    await settle();
    return { onClear, onClose };
}

beforeEach(() => answering(BODEA_CHECK));

it("asks once, naming no stores: the handler covers every website the project uses", async () => {
    await openModal();

    expect(checks()).toEqual([{}]);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});

it('names the websites and says it is permanent in the opening sentence', async () => {
    await openModal();

    expect(screen.getByText(/^Clearing permanently removes the demo data on the website Bodea, and closes their orders\./)).toBeInTheDocument();
});

it("says the project's datapack is left for its uninstall, when the check names one", async () => {
    answering({ ...BODEA_CHECK, datapack: { name: 'Bodea B2B', changes: 'unchecked' } });

    await openModal();

    expect(screen.getByText('What the datapack Bodea B2B installed is left for its uninstall.')).toBeInTheDocument();
});

it('lists one line per data type, as the check counts them', async () => {
    await openModal();

    const lines = Array.from(document.querySelectorAll('dt')).map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]);
    expect(lines).toEqual([
        ['Products', '2 removed'],
        ['Categories', '2 removed'],
        ['Customers', '1 removed'],
        ['Orders', '3 closed'],
    ]);
    expect(screen.getByRole('button', { name: 'Clear 8 Items' })).toBeInTheDocument();
});

it('hands the shown list’s token and its websites to the screen on Clear', async () => {
    const { onClear } = await openModal();

    await press(screen.getByRole('button', { name: 'Clear 8 Items' }));

    expect(onClear).toHaveBeenCalledWith('tok-1', ['bodea']);
});

it('says another project uses the website, and still offers the clearing (P6-Q2)', async () => {
    const warning = 'The project Neighbour also uses the website bodea. Clearing it also removes what was added there by hand for that project.';
    answering({ ...BODEA_CHECK, warning });

    await openModal();

    expect(screen.getByText(warning)).toHaveClass('dialog-problem', 'text-notice');
    expect(screen.getByRole('button', { name: 'Clear 8 Items' })).not.toHaveAttribute('aria-disabled', 'true');
});

it('says a type Commerce was too slow to answer, offers Retry instead of Clear, and asks again on Retry', async () => {
    answering({ ...BODEA_CHECK, unread: { customers: 'slow' }, problem: "Commerce didn't answer for Customers." });
    const { onClear } = await openModal();

    expect(screen.getByText("Commerce didn't answer for Customers.")).toHaveClass('dialog-problem');
    expect(screen.queryByRole('button', { name: /^Clear/ })).not.toBeInTheDocument();
    await press(screen.getByRole('button', { name: 'Retry' }));
    await settle();

    expect(checks()).toEqual([{}, {}]);
    expect(onClear).not.toHaveBeenCalled();
});

it('says there is nothing to clear, and offers no clearing', async () => {
    answering(EMPTY_CHECK);

    await openModal();

    expect(screen.getByText('Nothing to clear on these websites.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toHaveAttribute('aria-disabled', 'true');
});

it('waits saying what it reads while it reads', async () => {
    mockRequest.mockReset();
    mockRequest.mockImplementation(() => new Promise(() => undefined));

    await openModal();

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByText('Reading demo data')).toBeInTheDocument();
});

it('titles the window with the failure when the check is refused', async () => {
    mockRequest.mockReset();
    mockRequest.mockResolvedValue({ success: false, error: 'Sign In to Adobe first.' });

    await openModal();

    expect(screen.getByRole('heading', { name: /Couldn't Read the Demo Data/ })).toBeInTheDocument();
    expect(screen.getByText('Sign In to Adobe first.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Clear/ })).not.toBeInTheDocument();
});
