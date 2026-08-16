/**
 * useDataInstallerRequest tests — the envelope contract.
 *
 * A handler that RETURNS `{success:false, error, code}` does not reject: the
 * communication manager puts the whole `HandlerResponse` in the response payload
 * (the `sendRawMessage` that echoes the handler `result`) and
 * `webviewClient.request` rejects only on a response carrying `message.error`,
 * which the manager sets only when the handler THROWS. So `useVSCodeRequest` resolves
 * with the envelope and leaves `error` null — a refusal from the guard reads as a
 * success unless something unwraps it.
 *
 * That is what this hook exists for, and why the connectivity line it replaces
 * reported "Connected" for every guard refusal. Both failure shapes — a thrown
 * transport error and a returned refusal — arrive here as one `failure`.
 *
 * Strict TDD: written BEFORE the hook exists.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: { request: jest.fn() },
}));

// Below the mock on purpose: `jest.mock` is hoisted above the imports of THIS
// module only, so the client must be imported after it to bind to the mock.
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { useDataInstallerRequest } from '@/features/data-installer/ui/hooks/useDataInstallerRequest';

const mockRequest = webviewClient.request as jest.Mock;

/**
 * The type and payload of the most recent request.
 *
 * `webviewClient.request(type, payload, timeoutMs)` takes a third argument the
 * hook leaves undefined, so asserting on the raw call array pins an argument
 * nothing here is about.
 */
function lastRequest(): { type: unknown; payload: unknown } {
    const call = mockRequest.mock.calls[mockRequest.mock.calls.length - 1] ?? [];
    return { type: call[0], payload: call[1] };
}

/** A probe that renders every field of the hook's return, plus a retry. */
function Probe(): React.JSX.Element {
    const { load, loading, value, failure } = useDataInstallerRequest<{ items: string[] }>(
        'find-datapacks',
    );

    React.useEffect(() => {
        load({ includeCommunity: false });
    }, [load]);

    return (
        <div>
            <button type="button" onClick={() => load()}>
                Retry
            </button>
            <span data-testid="loading">{String(loading)}</span>
            <span data-testid="value">{value ? value.items.join(',') : 'none'}</span>
            <span data-testid="failure">{failure ? failure.message : 'none'}</span>
            <span data-testid="code">{failure?.code ?? 'none'}</span>
        </div>
    );
}

describe('useDataInstallerRequest', () => {
    beforeEach(() => {
        mockRequest.mockReset();
    });

    it('sends the payload it is given', async () => {
        mockRequest.mockResolvedValue({ success: true, data: { items: [] } });

        render(<Probe />);

        await waitFor(() =>
            expect(lastRequest()).toEqual({
                type: 'find-datapacks',
                payload: { includeCommunity: false },
            }),
        );
    });

    it('unwraps a successful envelope to its data', async () => {
        mockRequest.mockResolvedValue({ success: true, data: { items: ['bodea', 'wknd'] } });

        render(<Probe />);

        await waitFor(() => expect(screen.getByTestId('value')).toHaveTextContent('bodea,wknd'));
        expect(screen.getByTestId('failure')).toHaveTextContent('none');
    });

    it('turns a RETURNED refusal into a failure, carrying its code', async () => {
        mockRequest.mockResolvedValue({
            success: false,
            error: 'Adobe sign-in is required.',
            code: 'AUTH_REQUIRED',
        });

        render(<Probe />);

        await waitFor(() =>
            expect(screen.getByTestId('failure')).toHaveTextContent('Adobe sign-in is required.'),
        );
        expect(screen.getByTestId('code')).toHaveTextContent('AUTH_REQUIRED');
        expect(screen.getByTestId('value')).toHaveTextContent('none');
    });

    it('turns a THROWN transport error into a failure with no code', async () => {
        mockRequest.mockRejectedValue(new Error('Request timeout: find-datapacks'));

        render(<Probe />);

        await waitFor(() =>
            expect(screen.getByTestId('failure')).toHaveTextContent(
                'Request timeout: find-datapacks',
            ),
        );
        expect(screen.getByTestId('code')).toHaveTextContent('none');
    });

    it('clears the failure when a retry succeeds', async () => {
        mockRequest.mockRejectedValueOnce(new Error('boom'));
        mockRequest.mockResolvedValue({ success: true, data: { items: ['bodea'] } });

        render(<Probe />);
        await waitFor(() => expect(screen.getByTestId('failure')).toHaveTextContent('boom'));

        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

        await waitFor(() => expect(screen.getByTestId('value')).toHaveTextContent('bodea'));
        expect(screen.getByTestId('failure')).toHaveTextContent('none');
    });

    it('reports loading while a request is in flight', async () => {
        let resolve: (value: unknown) => void = () => undefined;
        mockRequest.mockReturnValue(new Promise((r) => { resolve = r; }));

        render(<Probe />);

        await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('true'));

        resolve({ success: true, data: { items: [] } });

        await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    });
});
// The refusal envelope can carry structured data (e.g. needsAccsCredentials, so
// the modal can offer provisioning without matching a message string).
describe('failure data passthrough', () => {
    function DataProbe(): React.JSX.Element {
        const { load, failure } = useDataInstallerRequest('validate-datapack-import');
        React.useEffect(() => {
            load({});
        }, [load]);
        return <span data-testid="failure-data">{JSON.stringify(failure?.data ?? null)}</span>;
    }

    it('exposes the envelope data on a refusal', async () => {
        mockRequest.mockResolvedValue({
            success: false,
            error: 'ACCS imports need a pair.',
            code: 'INVALID_OPERATION',
            data: { needsAccsCredentials: true },
        });

        render(<DataProbe />);

        await waitFor(() =>
            expect(screen.getByTestId('failure-data')).toHaveTextContent(
                '{"needsAccsCredentials":true}',
            ),
        );
    });
});
