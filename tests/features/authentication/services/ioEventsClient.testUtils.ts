/**
 * The response stub both ioEventsClient suites build.
 *
 * Nine identical lines each: a `Response` shaped just enough for the client —
 * `ok` derived from the status, and a `json()` that resolves the body. The
 * suites mock no modules in common, so this helper is the whole overlap.
 */

/** A fetch `Response` carrying `body` as JSON, with `ok` derived from `status`. */
export function jsonResponse(status: number, body: unknown): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: 'Stub',
        json: jest.fn().mockResolvedValue(body),
    } as unknown as Response;
}

/** A fetch `Response` whose body is not valid JSON, with `ok` derived from `status`. */
export function nonJsonResponse(status: number): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: 'Stub',
        json: jest.fn().mockRejectedValue(new SyntaxError('Unexpected token < in JSON')),
    } as unknown as Response;
}
