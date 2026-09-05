/**
 * formatAdobeCliError — stripping HTML response bodies, and what
 * formatApiAccessError makes of a status buried in JSON.
 *
 * The Adobe CLI sometimes pastes an entire error PAGE into an error message.
 * Rendered verbatim that is tens of kilobytes in a status row, so the formatter
 * truncates at the first HTML marker it finds and tidies the separator that was
 * introducing it.
 */

import { formatAdobeCliError, formatApiAccessError } from '@/features/mesh/utils/errorFormatter';

describe('formatAdobeCliError - HTML response bodies', () => {
    it.each([
        ['<!DOCTYPE', '<!DOCTYPE html><html><body>Not Found</body></html>'],
        ['<html', '<html><body>Not Found</body></html>'],
        ['<HTML', '<HTML><BODY>Not Found</BODY></HTML>'],
        ['<!doctype', '<!doctype html><body>Not Found</body>'],
    ])('truncates at %s and drops the separator introducing it', (_marker, body) => {
        expect(formatAdobeCliError(`HTTP error: 404 - ${body}`)).toBe('HTTP error: 404');
    });

    it('cuts once, at the first marker in its own list, and stops looking', () => {
        // The markers are tried in list order, not by position: '<!DOCTYPE' is
        // checked first, so the cut lands at index 30 even though '<html' sits at
        // index 7. Without the break the loop would go on and cut again at the
        // earlier one, which is a different — and shorter — message.
        const result = formatAdobeCliError('Broke: <html>page</html> then <!DOCTYPE html>');

        expect(result).toBe('Broke: <html>page</html> then');
    });

    it('keeps a message that carries no HTML at all', () => {
        expect(formatAdobeCliError('HTTP error: 404 - Not Found')).toBe('HTTP error: 404 - Not Found');
    });

    it('still splits the arrows in the part it kept', () => {
        const result = formatAdobeCliError('Error › config missing: <!DOCTYPE html><body/>');

        expect(result).toBe('Error\nconfig missing');
    });

    it('leaves nothing behind when the message is only HTML', () => {
        expect(formatAdobeCliError('<!DOCTYPE html><body>x</body>')).toBe('');
    });
});

describe('formatApiAccessError - a status inside the JSON body', () => {
    it('reads a 5xx off a "status" field when there is no "NNN - " prefix', () => {
        const result = formatApiAccessError('SDK failure ({"status": 503, "detail":"upstream"})');

        expect(result).toBe(
            'Adobe returned a temporary server error (503) while enabling API access. Please retry.',
        );
    });

    it('reads a 4xx off a "status" field the same way', () => {
        const result = formatApiAccessError('SDK failure ({"status": 404})');

        expect(result).toBe(
            "Couldn't enable API access (error 404). Please retry, or check your Adobe permissions.",
        );
    });

    it('prefers the "NNN - " form when both are present', () => {
        const result = formatApiAccessError('500 - Internal ({"status": 404})');

        expect(result).toContain('(500)');
    });

    it('ignores a status that is neither 4xx nor 5xx', () => {
        expect(formatApiAccessError('302 - Found')).toBe('302 - Found');
    });

    it('keeps only the first line of a multi-line message', () => {
        expect(formatApiAccessError('first line › second line')).toBe('first line');
    });

    it('tolerates a status written without spaces around the dash', () => {
        // The prefix pattern allows any run of whitespace on either side of the
        // dash, including none — SDK wrappers are not consistent about it.
        expect(formatApiAccessError('502- Bad Gateway')).toContain('(502)');
    });

    it('tolerates a status field written with no space after the colon', () => {
        expect(formatApiAccessError('SDK failure ({"status":429})')).toContain('error 429');
    });

    it('trims the line it keeps', () => {
        expect(formatApiAccessError('padded message   \nsecond line')).toBe('padded message');
    });

    it('leaves a message exactly at the cap alone', () => {
        const exact = 'z'.repeat(20);

        const result = formatApiAccessError(exact, 20);

        expect(result).toBe(exact);
        expect(result.endsWith('…')).toBe(false);
    });

    it('honours a caller-supplied cap', () => {
        const result = formatApiAccessError('y'.repeat(80), 20);

        expect(result).toHaveLength(20);
        expect(result.endsWith('…')).toBe(true);
    });
});
