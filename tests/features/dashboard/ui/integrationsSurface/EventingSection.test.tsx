/**
 * EventingSection — lazy load, the loaded states, delete wiring, and what each
 * state actually PUTS ON THE SCREEN.
 *
 * The section renders five mutually exclusive bodies (spinner, failure note,
 * unavailability reason, empty note, rows) from four booleans over two pieces of
 * state. The first describe proves each body can appear; the second proves the
 * others do not appear with it, and that a reload shows the spinner rather than
 * the stale answer it is replacing.
 *
 * Negative assertions carry the weight in the second half: a condition widened
 * by one operand still renders the right thing, and only ever gives itself away
 * by rendering something extra.
 */

const mockRequest = jest.fn();
jest.mock('@/core/ui/utils/vscode-api', () => ({
    webviewClient: {
        request: (...args: unknown[]) => mockRequest(...args),
        postMessage: jest.fn(),
    },
}));

jest.mock('@adobe/react-spectrum', () => {
    const { domProps } = jest.requireActual('../../../../helpers/spectrumStubProps');
    return {
        ActionButton: ({ children, onPress, ...props }: any) => (
            <button onClick={onPress} {...domProps(props)}>
                {children}
            </button>
        ),
        ProgressCircle: (props: any) => <div role="progressbar" aria-label={props['aria-label']} />,
    };
});
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

const EMPTY_NOTE = /No event providers or registrations in this workspace/;
const FAILURE_NOTE = 'Could not load event providers.';

/** Every body the section can render, so "only this one" is expressible. */
function bodies(container: HTMLElement): number {
    return container.querySelectorAll('.eventing-section-body').length;
}

function toggleButton(): HTMLElement {
    return screen.getByText('Event providers');
}

/** Render collapsed, then expand — the listing the request answers with. */
async function expandWith(listing: unknown) {
    mockRequest.mockResolvedValue(listing);
    const view = render(<EventingSection />);
    await settle();
    await press(toggleButton());
    return view;
}

/** A request that never settles, plus the resolver to release it. */
function pending(): { release: (value: unknown) => void } {
    let release: (value: unknown) => void = () => undefined;
    mockRequest.mockReturnValueOnce(new Promise((r) => {
        release = r;
    }));
    return { release: (value) => release(value) };
}

describe('EventingSection — load states', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('collapsed renders the header alone — no body, no refresh, no notes', async () => {
        const { container } = render(<EventingSection />);
        await settle();

        expect(bodies(container)).toBe(0);
        expect(screen.queryByLabelText('Refresh event providers')).toBeNull();
        expect(screen.queryByRole('progressbar')).toBeNull();
        expect(screen.queryByText(FAILURE_NOTE)).toBeNull();
        expect(screen.queryByText(EMPTY_NOTE)).toBeNull();
        expect(toggleButton().closest('button')?.getAttribute('aria-expanded')).toBe('false');
    });

    it('loading shows only the spinner, and the header reads as expanded', async () => {
        const { release } = pending();
        const { container } = render(<EventingSection />);
        await settle();

        await press(toggleButton());

        expect(screen.getByRole('progressbar')).toBeTruthy();
        expect(bodies(container)).toBe(1);
        expect(screen.queryByLabelText('Refresh event providers')).toBeNull();
        expect(toggleButton().closest('button')?.getAttribute('aria-expanded')).toBe('true');

        release({ available: true, providers: [], registrations: [] });
        await settle();
    });

    // Collapsing mid-flight would leave the response committing into a section
    // the user has closed, so the toggle deliberately does nothing while loading.
    it('a second press while loading neither collapses nor re-requests', async () => {
        const { release } = pending();
        render(<EventingSection />);
        await settle();
        await press(toggleButton());

        await press(toggleButton());

        expect(screen.getByRole('progressbar')).toBeTruthy();
        expect(toggleButton().closest('button')?.getAttribute('aria-expanded')).toBe('true');
        expect(mockRequest).toHaveBeenCalledTimes(1);

        release({ available: true, providers: [], registrations: [] });
        await settle();
    });

    it('a failed request shows the failure note and nothing else', async () => {
        mockRequest.mockRejectedValue(new Error('Console unreachable'));
        const { container } = render(<EventingSection />);
        await settle();

        await press(toggleButton());

        expect(screen.getByText(FAILURE_NOTE)).toBeTruthy();
        expect(bodies(container)).toBe(1);
        expect(screen.queryByRole('progressbar')).toBeNull();
        expect(screen.queryByLabelText('Refresh event providers')).toBeNull();
    });

    it('loaded rows show the refresh affordance and no notes', async () => {
        const { container } = await expandWith({
            available: true,
            providers: [{ id: 'prov-1', label: 'ERP events' }],
            registrations: [{ id: 'reg-1', name: 'erp-journal' }],
        });

        expect(screen.getByText('ERP events')).toBeTruthy();
        expect(bodies(container)).toBe(1);
        expect(screen.getByLabelText('Refresh event providers')).toBeTruthy();
        expect(screen.queryByText(EMPTY_NOTE)).toBeNull();
        expect(toggleButton().closest('button')?.getAttribute('aria-expanded')).toBe('true');
    });

    it('an available workspace with nothing in it shows the empty note alone', async () => {
        const { container } = await expandWith({
            available: true,
            providers: [],
            registrations: [],
        });

        expect(screen.getByText(EMPTY_NOTE)).toBeTruthy();
        expect(bodies(container)).toBe(1);
    });

    // The handler may answer `available` with neither list present; that is the
    // same workspace as two empty lists, not a workspace with one of each.
    it('treats missing provider and registration lists as empty', async () => {
        const { container } = await expandWith({ available: true });

        expect(screen.getByText(EMPTY_NOTE)).toBeTruthy();
        expect(bodies(container)).toBe(1);
    });

    it.each([
        [
            'only providers',
            { available: true, providers: [{ id: 'prov-1', label: 'ERP events' }], registrations: [] },
            'ERP events',
        ],
        [
            'only registrations',
            { available: true, providers: [], registrations: [{ id: 'reg-1', name: 'erp-journal' }] },
            'erp-journal',
        ],
    ])('a workspace with %s is not empty', async (_label, listing, visible) => {
        const { container } = await expandWith(listing);

        expect(screen.getByText(visible as string)).toBeTruthy();
        expect(screen.queryByText(EMPTY_NOTE)).toBeNull();
        expect(bodies(container)).toBe(1);
    });

    it('an unavailable workspace shows its reason alone', async () => {
        const { container } = await expandWith({
            available: false,
            reason: 'This project has no Adobe Console context yet.',
        });

        expect(screen.getByText('This project has no Adobe Console context yet.')).toBeTruthy();
        expect(bodies(container)).toBe(1);
        expect(screen.queryByText(EMPTY_NOTE)).toBeNull();
    });

    // A handler that answers with nothing at all must not take the panel down.
    it('survives a response carrying no listing', async () => {
        const { container } = await expandWith(undefined);

        expect(bodies(container)).toBe(0);
        expect(screen.getByLabelText('Refresh event providers')).toBeTruthy();
        expect(screen.queryByText(EMPTY_NOTE)).toBeNull();
    });

    // A refresh replaces the answer; showing the previous one under a spinner
    // would say the workspace is in a state it may already have left.
    describe('refreshing replaces the body rather than sitting behind it', () => {
        it.each([
            [
                'rows',
                { available: true, providers: [{ id: 'p', label: 'ERP events' }], registrations: [] },
                'ERP events',
            ],
            ['the empty note', { available: true, providers: [], registrations: [] }, EMPTY_NOTE],
            [
                'an unavailability reason',
                { available: false, reason: 'No Console context yet.' },
                'No Console context yet.',
            ],
        ])('%s give way to the spinner', async (_label, listing, visible) => {
            const { container } = await expandWith(listing);
            const { release } = pending();

            await press(screen.getByLabelText('Refresh event providers'));

            expect(screen.getByRole('progressbar')).toBeTruthy();
            expect(bodies(container)).toBe(1);
            expect(screen.queryByText(EMPTY_NOTE)).toBeNull();
            expect(screen.queryByText(visible as string | RegExp)).toBeNull();

            release(listing);
            await settle();
        });
    });

    it('collapsing hides the body and does not re-request', async () => {
        const { container } = await expandWith({
            available: true,
            providers: [{ id: 'prov-1', label: 'ERP events' }],
            registrations: [],
        });

        await press(toggleButton());

        expect(bodies(container)).toBe(0);
        expect(screen.queryByText('ERP events')).toBeNull();
        expect(toggleButton().closest('button')?.getAttribute('aria-expanded')).toBe('false');
        // One request for the expand, and none for the collapse.
        expect(mockRequest).toHaveBeenCalledTimes(1);
    });

    it('a delete whose request fails leaves the list alone', async () => {
        mockRequest.mockResolvedValueOnce({
            available: true,
            providers: [{ id: 'prov-1', label: 'ERP events' }],
            registrations: [],
        });
        render(<EventingSection />);
        await settle();
        await press(toggleButton());
        mockRequest.mockRejectedValueOnce(new Error('Console unreachable'));

        await press(screen.getByLabelText('Delete provider ERP events'));

        // Two calls: the initial load and the failed delete. No reload.
        expect(mockRequest).toHaveBeenCalledTimes(2);
        expect(screen.getByText('ERP events')).toBeTruthy();
    });
});
