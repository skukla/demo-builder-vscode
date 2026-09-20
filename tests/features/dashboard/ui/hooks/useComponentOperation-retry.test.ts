/**
 * Retrying a failed ADD re-sends the add (owner, 2026-09-20).
 *
 * It used to send a DEPLOY, on the reasoning that a failed add leaves the
 * integration persisted in an error state. True when the add got that far — and
 * false when it did not: an add whose BOUND SYSTEM fails persists nothing, so
 * Retry asked to deploy something that had never existed and answered
 * `AppBuilderComponent "erp-integration" not found`. Two dead ends in a row, on a
 * button whose whole job is the second chance.
 *
 * Re-adding is also what the add handler documents as the recovery: an
 * error-state component is exempt from its already-added refusal for exactly this.
 */

import { renderHook } from '@testing-library/react';
import { useComponentOperation } from '@/features/dashboard/ui/hooks/useComponentOperation';

const mockShow = jest.fn();
const mockStart = jest.fn();
jest.mock('@/core/ui/hooks/useOperationRunner', () => ({
    useOperationRunner: () => ({
        open: null,
        start: (...args: unknown[]) => mockStart(...args),
        show: (...args: unknown[]) => mockShow(...args),
        startWhenItBegins: jest.fn(),
        reopen: jest.fn(),
        retry: jest.fn(),
        close: jest.fn(),
    }),
}));

beforeEach(() => {
    jest.clearAllMocks();
});

it('shows the modal for an add whose Retry re-sends that same add', () => {
    const { result } = renderHook(() => useComponentOperation());

    result.current.started('erp-integration', 'Northwind ERP', {
        id: 'erp-integration',
        name: 'Northwind ERP',
    });

    expect(mockShow).toHaveBeenCalledWith({
        id: 'erp-integration',
        name: 'Northwind ERP',
        // The add, NOT a deploy: an add that fails at its bound system persists
        // nothing, and a deploy of nothing answers "not found".
        message: 'addAppBuilderComponent',
        payload: { id: 'erp-integration', name: 'Northwind ERP' },
        title: 'Adding Northwind ERP',
        failureTitle: "Couldn't add Northwind ERP",
        successTitle: 'Northwind ERP added',
    });
});

// A card action is a different thing: the component is already in the project,
// so its Retry is the action it ran.
it('leaves a card action retrying the action it ran', () => {
    const { result } = renderHook(() => useComponentOperation());

    expect(result.current.run('erp-integration', 'ERP integration', 'redeploy')).toBe(true);

    expect(mockStart).toHaveBeenCalledWith(
        expect.objectContaining({
            message: 'redeployAppBuilderComponent',
            title: 'Redeploying ERP integration',
            successTitle: 'ERP integration redeployed',
        }),
    );
});
