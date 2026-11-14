/**
 * Configure's Save, when the extension answers that it would leave a datapack in the current
 * Commerce instance (step-07 D6): the confirm asks "Change the Commerce Connection?", and each of
 * its three answers is what the save is sent again with.
 */

import './ConfigureScreen.mocks';
import { mockRequest } from '../../../../helpers/webviewClientMock';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { ConfigureScreen } from '@/features/dashboard/ui/configure/ConfigureScreen';
import '@testing-library/jest-dom';
import { mockComponentsData, mockProject } from './ConfigureScreen.testUtils';

Element.prototype.scrollIntoView = jest.fn();

const VALID = {
    headless: {
        ADOBE_COMMERCE_URL: 'https://example.com',
        ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
    },
    'adobe-commerce-paas': { ADOBE_COMMERCE_ADMIN_USERNAME: 'admin' },
    'catalog-service': { ADOBE_CATALOG_API_KEY: 'test-key-123' },
};
const LINE =
    'Luma is installed in the current Commerce instance. Uninstall it first, or it stays there.';

/** Render, press Save, and wait for the confirm the extension's question opens. */
async function saveAndAsk() {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockRequest.mockResolvedValueOnce({ success: false, data: { installedDatapack: 'Luma' } });
    mockRequest.mockResolvedValue({ success: true });
    render(
        <Provider theme={defaultTheme}>
            <ConfigureScreen
                project={mockProject}
                componentsData={mockComponentsData}
                existingEnvValues={VALID}
            />
        </Provider>
    );
    await waitFor(() => expect(screen.getByText('Save Changes')).not.toBeDisabled());
    await user.click(screen.getByText('Save Changes'));
    await screen.findByText('Change the Commerce Connection?');
    return user;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockRequest.mockReset();
});

it('asks, naming the datapack, with Cancel, Change Anyway and Uninstall First', async () => {
    await saveAndAsk();

    expect(screen.getByText(LINE)).toBeInTheDocument();
    for (const label of ['Cancel', 'Change Anyway', 'Uninstall First']) {
        expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
});

it.each([
    ['Uninstall First', 'uninstall'],
    ['Change Anyway', 'keep'],
])('%s sends the save again with installedDatapack "%s"', async (label, answer) => {
    const user = await saveAndAsk();

    await user.click(screen.getByRole('button', { name: label }));

    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(2));
    expect(mockRequest.mock.calls[1]).toEqual([
        'save-configuration',
        { configChanges: {}, installedDatapack: answer },
    ]);
    await waitFor(() =>
        expect(screen.queryByText('Change the Commerce Connection?')).not.toBeInTheDocument()
    );
});

it('Cancel closes the confirm and sends nothing more', async () => {
    const user = await saveAndAsk();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
        expect(screen.queryByText('Change the Commerce Connection?')).not.toBeInTheDocument()
    );
    expect(mockRequest).toHaveBeenCalledTimes(1);
});
