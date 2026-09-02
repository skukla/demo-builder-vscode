/**
 * An `Error` carrying the extra fields Node and the Adobe SDKs hang off one.
 *
 * Node's filesystem errors carry `code` (`EACCES`, `ENOSPC`); HTTP-shaped failures
 * carry `status` or `statusCode`. `Error` declares none of them, so tests attach
 * them — and the usual way is `(error as any).code = 'EACCES'`, which tells the
 * compiler nothing about what the code under test goes looking for.
 *
 * Production names this shape itself. `errorFormatters.ts` declares
 * `error as Error & { code?: string; status?: number }` three times, and reads
 * `status` on two paths while reading `statusCode` on a third — so this type spans
 * both names deliberately. A fixture setting the wrong one prints "Status: N/A" and
 * still looks right, which is exactly the sort of thing a shared shape prevents.
 *
 * SMALL ON PURPOSE. Ten sites across three files is under the bar that justified the
 * big canonical fakes, and this is not one — it is eight lines and a name. It exists
 * because the alternative was knowingly writing a third copy of it.
 */

/** An Error with the fields production actually reads off one. */
export type CodedError = Error & {
    code?: string;
    status?: number;
    statusCode?: number;
    errno?: number;
    syscall?: string;
};

/**
 * @param message - the Error message
 * @param extra - the fields the code under test reads
 */
export function codedError(message: string, extra: Partial<CodedError> = {}): CodedError {
    return Object.assign(new Error(message), extra);
}
