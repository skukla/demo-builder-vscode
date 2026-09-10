/**
 * ConfigureScreen — the project-name field, its error, and the rename it saves.
 *
 * The name is the Project section's one required field, so it is also the only
 * thing that can make the first rail tab carry an error. Two rules govern it:
 * the error appears only once the field has been TOUCHED (a project that opens
 * with an invalid name must not greet the user with a complaint), and the
 * rename is compared against the TITLE, trimmed, so capitalisation counts and
 * stray whitespace does not.
 */

import './ConfigureScreen.mocks';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';

import { ConfigureScreen } from '@/features/dashboard/ui/configure/ConfigureScreen';
import { createMockProject } from '../../../../helpers/projectFake';
import { mockProject, mockComponentsData, railTab } from './ConfigureScreen.testUtils';

jest.mock('@/features/components/ui/hooks/useAutoStoreDetect', () => ({
    useAutoStoreDetect: () => ({ autoDetectKey: undefined, forceFetch: jest.fn() }),
}));

jest.mock('@/features/components/ui/components/StoreConfigFieldRow', () => ({
    StoreConfigFieldRow: () => null,
}));

const REQUIRED = 'Project name is required';

/**
 * Every required env var filled, so Save is enabled and the name is the ONLY
 * thing that can disable it. Without this the rename tests would be asserting
 * against a button that is disabled for an unrelated reason.
 */
const COMPLETE_ENV = {
    headless: {
        ADOBE_COMMERCE_URL: 'https://example.com',
        ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
    },
    'adobe-commerce-paas': { ADOBE_COMMERCE_ADMIN_USERNAME: 'admin' },
    'catalog-service': { ADOBE_CATALOG_API_KEY: 'test-key-123' },
};

function renderScreen(props: Partial<React.ComponentProps<typeof ConfigureScreen>> = {}) {
    return render(
        <Provider theme={defaultTheme}>
            <ConfigureScreen
                project={mockProject}
                componentsData={mockComponentsData}
                existingEnvValues={COMPLETE_ENV}
                {...props}
            />
        </Provider>
    );
}

function nameField(): HTMLElement {
    return screen.getByLabelText(/Project Name/i);
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('ConfigureScreen — project name validation', () => {
    // 'ab' normalizes to a two-character slug, which the shared validator
    // rejects for length. Untouched, that must stay silent: the user has not
    // typed anything yet, and the project opened this way.
    const shortNameProject = createMockProject({ name: 'ab', path: '/test/ab' });

    it('says nothing about a name the user has not touched', () => {
        renderScreen({ project: shortNameProject });

        expect(screen.queryByText(/at least 3 characters/i)).not.toBeInTheDocument();
        expect(railTab('Project').textContent).not.toMatch(/has errors/i);
    });

    it('reports the error once the field is edited', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        renderScreen();

        await user.clear(nameField());

        expect(await screen.findByText(REQUIRED)).toBeInTheDocument();
    });

    // A disabled Save with no visible cause is a dead end, so the error rides
    // the rail tab too — the tab is how the user finds a section they cannot see.
    it('marks the Project rail tab when the name is invalid', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        renderScreen();
        expect(railTab('Project').textContent).not.toMatch(/has errors/i);

        await user.clear(nameField());

        await waitFor(() => expect(railTab('Project').textContent).toMatch(/has errors/i));
    });
});

describe('ConfigureScreen — saving a rename', () => {
    let mockRequest: jest.Mock;

    beforeEach(() => {
        const { webviewClient } = require('@/core/ui/utils/WebviewClient');
        mockRequest = webviewClient.request as jest.Mock;
        mockRequest.mockResolvedValue({ success: true });
    });

    async function save(user: ReturnType<typeof userEvent.setup>) {
        await user.click(screen.getByText('Save Changes'));
        await waitFor(() => expect(mockRequest).toHaveBeenCalled());
        return mockRequest.mock.calls[0][1];
    }

    it('sends the new title when the name changed', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        renderScreen();

        await user.clear(nameField());
        await user.type(nameField(), 'Renamed Project');

        expect(await save(user)).toEqual(
            expect.objectContaining({ newProjectName: 'Renamed Project' })
        );
    });

    // Trimmed on BOTH sides of the comparison: typing a trailing space is not a
    // rename, and the value that goes over the wire carries no whitespace either.
    it('treats surrounding whitespace as no change at all', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        renderScreen();

        await user.type(nameField(), '  ');

        expect(await save(user)).toEqual(
            expect.objectContaining({ newProjectName: undefined })
        );
    });

    it('trims the title it does send', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        renderScreen();

        await user.clear(nameField());
        await user.type(nameField(), '  Renamed Project  ');

        expect(await save(user)).toEqual(
            expect.objectContaining({ newProjectName: 'Renamed Project' })
        );
    });
});
