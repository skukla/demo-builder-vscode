/**
 * The fetch fakes both write-client suites build their responses from.
 *
 * The client takes its `fetchImpl` and its token provider by parameter, so
 * there is no module wall here at all — only the two shapes of canned response
 * (a JSON body, and whatever text the service actually sent) and the client
 * wired to them.
 */
import { DataInstallerWriteClient } from '@/features/data-installer/services/dataInstallerWriteClient';

/** The action namespace every URL in these suites is built from. */
export const BASE = 'https://example-namespace.adobeioruntime.net/api/v1/web/data-installer-api';

/** A response carrying a JSON body. */
export function ok(body: unknown, status = 200): jest.Mock {
    return jest.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        text: async () => JSON.stringify(body),
    });
}

/**
 * A response whose body is whatever text the service actually sent.
 *
 * The service answers a gateway failure with HTML and a store failure with an
 * empty body, so "the body is JSON" is an assumption the client must not make.
 */
export function raw(text: string, status = 200): jest.Mock {
    return jest.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        text: async () => text,
    });
}

/** A client wired to `fetchImpl`, optionally with a log sink. */
export function makeClient(fetchImpl: jest.Mock, log?: (line: string) => void) {
    return new DataInstallerWriteClient({
        baseUrl: BASE,
        getToken: async () => 'ims-token',
        fetchImpl: fetchImpl as unknown as typeof fetch,
        ...(log ? { log } : {}),
    });
}

/** The JSON body of one recorded request. */
export function bodyOf(fetchImpl: jest.Mock, call = 0): Record<string, unknown> {
    return JSON.parse(fetchImpl.mock.calls[call][1].body);
}
