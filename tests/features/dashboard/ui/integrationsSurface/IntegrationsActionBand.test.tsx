/**
 * IntegrationsActionBand — the sticky band above the integrations grid.
 *
 * Moved out of IntegrationsScreen (EDS-8, 2026-10-08), with the
 * `formatDestination` cases that used to sit in IntegrationsScreen.test.tsx. The
 * screen suites still render the band in place; this pins what it hands
 * `SearchHeader`, which a stubbed header otherwise only partly shows.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import type { ReactNode } from 'react';

jest.mock('@adobe/react-spectrum', () => ({
    Button: ({ children, onPress, ...p }: any) => (
        <button onClick={onPress} {...p}>
            {children}
        </button>
    ),
    Flex: ({ children }: any) => <div>{children}</div>,
    View: ({ children }: any) => <div>{children}</div>,
}));

const mockSearchHeaderProps = jest.fn();
jest.mock('@/core/ui/components/navigation/SearchHeader', () => ({
    SearchHeader: (props: { countTrailing?: ReactNode }) => {
        mockSearchHeaderProps(props);
        return <div data-testid="search-header">{props.countTrailing}</div>;
    },
}));

// Below the mocks on purpose: babel-plugin-jest-hoist lifts them above every
// import in this file, so the band always loads against them.
import {
    formatDestination,
    IntegrationsActionBand,
    type IntegrationsActionBandProps,
} from '@/features/dashboard/ui/integrationsSurface/IntegrationsActionBand';
import type { IntegrationCardModel } from '@/features/dashboard/ui/components/integrations/integrationCardModel';

const INTEGRATION = { id: 'a', name: 'ERP Sync' } as unknown as IntegrationCardModel;
const SYSTEM = { id: 's', name: 'ERP', isSystem: true } as unknown as IntegrationCardModel;
const SET_QUERY = jest.fn();

function renderBand(overrides: Partial<IntegrationsActionBandProps> = {}) {
    const props: IntegrationsActionBandProps = {
        cards: [INTEGRATION, SYSTEM],
        search: {
            searchQuery: 'erp',
            setSearchQuery: SET_QUERY,
            visibleCards: [INTEGRATION],
            isFiltering: true,
            searchFoundNothing: false,
        },
        viewMode: 'rows',
        onViewModeChange: jest.fn(),
        onRefresh: jest.fn(),
        destination: { projectTitle: 'Kukla Mesh', workspaceTitle: 'Stage' },
        onChangeDestination: jest.fn(),
        onBack: jest.fn(),
        ...overrides,
    };
    render(<IntegrationsActionBand {...props} />);
    return props;
}

function headerProps(): Record<string, unknown> {
    return mockSearchHeaderProps.mock.calls.at(-1)?.[0];
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('formatDestination', () => {
    // Each integration has its own workspace (AB-23); the project-wide one was
    // wrong for all of them, so the line names the Adobe project only.
    it('names the Adobe project alone, never a workspace', () => {
        // The destination the screen is handed carries its workspace too.
        const destination = { projectTitle: 'Kukla Mesh', workspaceTitle: 'Stage' };
        expect(formatDestination(destination)).toBe('Kukla Mesh');
    });

    // Undefined, not an empty string — the caller hides the line on undefined,
    // so returning '' here would render an empty labelled row.
    it('returns undefined when neither part is known', () => {
        expect(formatDestination({})).toBeUndefined();
        expect(formatDestination(undefined)).toBeUndefined();
    });
});

describe('IntegrationsActionBand', () => {
    it('hands the header the search state, both counts and the view mode', () => {
        const props = renderBand();

        expect(headerProps()).toMatchObject({
            searchQuery: 'erp',
            onSearchQueryChange: SET_QUERY,
            searchPlaceholder: 'Filter integrations',
            searchThreshold: 0,
            totalCount: 2,
            filteredCount: 1,
            itemNoun: 'integration',
            onRefresh: props.onRefresh,
            refreshAriaLabel: 'Refresh integrations',
            viewMode: 'rows',
            onViewModeChange: props.onViewModeChange,
            hasLoadedOnce: true,
            alwaysShowCount: true,
        });
    });

    it.each([
        ['names both kinds once a system is on screen', [INTEGRATION, SYSTEM], '1 integration · 1 system'],
        ['counts integrations alone without a system', [INTEGRATION, INTEGRATION], '2 integrations'],
        ['says none for an empty project', [], '0 integrations'],
        ['pluralises systems', [SYSTEM, SYSTEM], '0 integrations · 2 systems'],
    ])('%s', (_label, cards, text) => {
        renderBand({ cards });

        expect(headerProps().countText).toBe(text);
    });

    it('puts the destination on the count row, labelled', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        const props = renderBand();

        const row = screen.getByTestId('page-destination');
        expect(row).toHaveTextContent('Deploys to');
        expect(row).toHaveTextContent('Kukla Mesh');
        expect(row).not.toHaveTextContent('Stage');

        await user.click(screen.getByRole('button', { name: 'Change' }));
        expect(props.onChangeDestination).toHaveBeenCalledTimes(1);
    });

    it('renders no destination row without a destination — control', () => {
        renderBand({ destination: undefined });

        expect(headerProps().countTrailing).toBeUndefined();
        expect(screen.queryByTestId('page-destination')).not.toBeInTheDocument();
    });

    it('routes the trailing button back to the project dashboard', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        const props = renderBand();

        await user.click(screen.getByRole('button', { name: 'Project Dashboard' }));

        expect(props.onBack).toHaveBeenCalledTimes(1);
    });
});
