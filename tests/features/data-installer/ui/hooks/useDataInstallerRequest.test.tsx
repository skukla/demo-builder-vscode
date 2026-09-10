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

import '../../../../helpers/webviewClientMock';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

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
        'find-datapacks'
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
            })
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
            expect(screen.getByTestId('failure')).toHaveTextContent('Adobe sign-in is required.')
        );
        expect(screen.getByTestId('code')).toHaveTextContent('AUTH_REQUIRED');
        expect(screen.getByTestId('value')).toHaveTextContent('none');
    });

    it('turns a THROWN transport error into a failure with no code', async () => {
        mockRequest.mockRejectedValue(new Error('Request timeout: find-datapacks'));

        render(<Probe />);

        await waitFor(() =>
            expect(screen.getByTestId('failure')).toHaveTextContent(
                'Request timeout: find-datapacks'
            )
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
        mockRequest.mockReturnValue(
            new Promise((r) => {
                resolve = r;
            })
        );

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
                '{"needsAccsCredentials":true}'
            )
        );
    });
});

/**
 * `settled` answers "did anything come back yet", which no other field can:
 * a handler that returns no data on success leaves `value` null and `failure`
 * null, which is indistinguishable from "never ran".
 */
describe('settled', () => {
    function SettledProbe(): React.JSX.Element {
        const { load, settled } = useDataInstallerRequest('find-datapacks');
        return (
            <div>
                <button type="button" onClick={() => load()}>
                    Load
                </button>
                <span data-testid="settled">{String(settled)}</span>
            </div>
        );
    }

    beforeEach(() => {
        mockRequest.mockReset();
    });

    it('is false before anything has been asked for', () => {
        mockRequest.mockResolvedValue({ success: true });

        render(<SettledProbe />);

        expect(screen.getByTestId('settled')).toHaveTextContent('false');
    });

    it('is true once a response arrives, even one carrying no data', async () => {
        mockRequest.mockResolvedValue({ success: true });

        render(<SettledProbe />);
        fireEvent.click(screen.getByRole('button', { name: 'Load' }));

        await waitFor(() => expect(screen.getByTestId('settled')).toHaveTextContent('true'));
    });

    it('is true once a THROWN transport error arrives', async () => {
        mockRequest.mockRejectedValue(new Error('Request timeout: find-datapacks'));

        render(<SettledProbe />);
        fireEvent.click(screen.getByRole('button', { name: 'Load' }));

        await waitFor(() => expect(screen.getByTestId('settled')).toHaveTextContent('true'));
    });
});

/**
 * The optional halves of a failure are OMITTED, not set to undefined. A caller
 * asking `'code' in failure` — the reason the field exists, so the UI branches on
 * facts rather than message strings — must not be told yes for a refusal that
 * carried neither. Rendering `failure.code` cannot see the difference; the KEYS
 * can.
 */
describe('failure keys', () => {
    function KeysProbe(): React.JSX.Element {
        const { load, failure } = useDataInstallerRequest('validate-datapack-import');
        React.useEffect(() => {
            load({});
        }, [load]);
        return (
            <span data-testid="failure-keys">
                {failure ? Object.keys(failure).sort().join(',') : 'none'}
            </span>
        );
    }

    beforeEach(() => {
        mockRequest.mockReset();
    });

    it('carries message alone when the refusal states nothing else', async () => {
        mockRequest.mockResolvedValue({ success: false, error: 'Not configured.' });

        render(<KeysProbe />);

        await waitFor(() =>
            expect(screen.getByTestId('failure-keys')).toHaveTextContent('message')
        );
        expect(screen.getByTestId('failure-keys').textContent).toBe('message');
    });

    it('drops a code that is not a string rather than passing it through', async () => {
        // `HandlerResponse` is index-signed, so `code` arrives as `unknown` — a
        // handler answering with a number would otherwise reach the UI as one.
        mockRequest.mockResolvedValue({ success: false, error: 'Not configured.', code: 42 });

        render(<KeysProbe />);

        await waitFor(() =>
            expect(screen.getByTestId('failure-keys')).toHaveTextContent('message')
        );
        expect(screen.getByTestId('failure-keys').textContent).toBe('message');
    });
});

/**
 * `load` is rebuilt when `execute` is — and `useVSCodeRequest` rebuilds `execute`
 * on a change of `type`. Freezing it would send every later request to the
 * handler named on the first render.
 */
describe('the handler it sends to', () => {
    function TypeProbe({ type }: { type: string }): React.JSX.Element {
        const { load } = useDataInstallerRequest(type);
        return (
            <button type="button" onClick={() => load({ id: 'bodea' })}>
                Load
            </button>
        );
    }

    beforeEach(() => {
        mockRequest.mockReset();
        mockRequest.mockResolvedValue({ success: true, data: null });
    });

    it('follows the type it is currently given, not the first one', async () => {
        const { rerender } = render(<TypeProbe type="find-datapacks" />);

        rerender(<TypeProbe type="validate-datapack-import" />);
        fireEvent.click(screen.getByRole('button', { name: 'Load' }));

        await waitFor(() =>
            expect(lastRequest()).toEqual({
                type: 'validate-datapack-import',
                payload: { id: 'bodea' },
            })
        );
    });
});
