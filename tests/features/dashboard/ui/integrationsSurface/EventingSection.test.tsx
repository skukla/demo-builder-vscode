/**
 * EventingSection — lazy load, the three loaded states, and delete wiring.
 *
 * @jest-environment jsdom
 */

const mockRequest = jest.fn();
jest.mock('@/core/ui/utils/vscode-api', () => ({
    webviewClient: {
        request: (...args: unknown[]) => mockRequest(...args),
        postMessage: jest.fn(),
    },
}));

jest.mock('@adobe/react-spectrum', () => ({
    ActionButton: ({ children, onPress, ...props }: any) => (
        <button onClick={onPress} {...props}>
            {children}
        </button>
    ),
    ProgressCircle: (props: any) => <div role="progressbar" aria-label={props['aria-label']} />,
}));
jest.mock('@spectrum-icons/workflow/ChevronDown', () => ({
    __esModule: true,
    default: () => <span />,
}));
jest.mock('@spectrum-icons/workflow/ChevronRight', () => ({
    __esModule: true,
    default: () => <span />,
}));
jest.mock('@spectrum-icons/workflow/Delete', () => ({ __esModule: true, default: () => <span /> }));
jest.mock('@spectrum-icons/workflow/Refresh', () => ({
    __esModule: true,
    default: () => <span />,
}));

import { render, screen, waitFor } from '@testing-library/react';

import { press, settle } from '../../../../helpers/reactSettle';
import React from 'react';
import { EventingSection } from '@/features/dashboard/ui/integrationsSurface/EventingSection';

describe('EventingSection', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('loads NOTHING until expanded — a screen open costs no Console round-trip', async () => {
        render(<EventingSection />);
        // Mount effects fire requests; settle so their responses commit inside
        // act() rather than in the next query's wait loop.
        await settle();
        expect(mockRequest).not.toHaveBeenCalled();
    });

    it('expanding loads and renders providers + registrations with delete affordances', async () => {
        mockRequest.mockResolvedValue({
            available: true,
            providers: [{ id: 'prov-1', label: 'ERP events' }],
            registrations: [{ id: 'reg-1', name: 'erp-journal' }],
        });
        render(<EventingSection />);
        // Mount effects fire requests; settle so their responses commit inside
        // act() rather than in the next query's wait loop.
        await settle();

        await press(screen.getByText('Event providers'));

        await waitFor(() => expect(screen.getByText('ERP events')).toBeTruthy());
        expect(mockRequest).toHaveBeenCalledWith('getEventEntities', {});
        expect(screen.getByText('erp-journal')).toBeTruthy();
        expect(screen.getByLabelText('Delete provider ERP events')).toBeTruthy();
        expect(screen.getByLabelText('Delete registration erp-journal')).toBeTruthy();
    });

    it('renders the unavailability reason as text when the handler says not available', async () => {
        mockRequest.mockResolvedValue({
            available: false,
            reason: 'This project has no Adobe Console context yet.',
        });
        render(<EventingSection />);
        // Mount effects fire requests; settle so their responses commit inside
        // act() rather than in the next query's wait loop.
        await settle();

        await press(screen.getByText('Event providers'));

        await waitFor(() =>
            expect(screen.getByText('This project has no Adobe Console context yet.')).toBeTruthy()
        );
    });

    it('a delete posts the entity and reloads on success', async () => {
        mockRequest
            .mockResolvedValueOnce({
                available: true,
                providers: [{ id: 'prov-1', label: 'ERP events' }],
                registrations: [],
            })
            .mockResolvedValueOnce({ deleted: true })
            .mockResolvedValueOnce({ available: true, providers: [], registrations: [] });
        render(<EventingSection />);
        // Mount effects fire requests; settle so their responses commit inside
        // act() rather than in the next query's wait loop.
        await settle();
        await press(screen.getByText('Event providers'));
        await waitFor(() => expect(screen.getByText('ERP events')).toBeTruthy());

        await press(screen.getByLabelText('Delete provider ERP events'));

        await waitFor(() =>
            expect(mockRequest).toHaveBeenCalledWith('deleteEventEntity', {
                kind: 'provider',
                id: 'prov-1',
                label: 'ERP events',
            })
        );
        // The reload after a confirmed delete (call 3).
        await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(3));
    });

    it('a cancelled delete (deleted:false) does NOT reload', async () => {
        mockRequest
            .mockResolvedValueOnce({
                available: true,
                providers: [{ id: 'prov-1', label: 'ERP events' }],
                registrations: [],
            })
            .mockResolvedValueOnce({ deleted: false, cancelled: true });
        render(<EventingSection />);
        // Mount effects fire requests; settle so their responses commit inside
        // act() rather than in the next query's wait loop.
        await settle();
        await press(screen.getByText('Event providers'));
        await waitFor(() => expect(screen.getByText('ERP events')).toBeTruthy());

        await press(screen.getByLabelText('Delete provider ERP events'));

        await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(2));
        expect(screen.getByText('ERP events')).toBeTruthy();
    });
});
