/**
 * ErrorFormatter — every formatter this module exports.
 *
 * One suite rather than three: the module is pure, so there is no scaffolding
 * for split suites to share, and the whole file fits comfortably under the
 * size limit.
 */

import {
    extractMeshErrorSummary,
    formatAdobeCliError,
    formatAdobeError,
    formatApiAccessError,
    formatMeshDeploymentError,
} from '@/features/mesh/utils/errorFormatter';

describe('ErrorFormatter', () => {
    describe('formatApiAccessError', () => {
        it('condenses a verbose 5xx SDK error to a short retry message', () => {
            const raw =
                '[CoreConsoleAPISDK:ERROR_GET_SERVICES_FOR_ORG] 500 - Internal Server Error ' +
                '({"id":"abc","messages":[{"template":"ERR_MSG_RETRY_ON_INTERNAL_ERROR",' +
                '"message":"a very long nested json blob that would flood the row"}]})';

            const result = formatApiAccessError(raw);

            expect(result).toContain('500');
            expect(result.toLowerCase()).toContain('retry');
            expect(result).not.toContain('CoreConsoleAPISDK');
            expect(result.length).toBeLessThan(120);
        });

        it('reports a 4xx as a permission-oriented message', () => {
            const result = formatApiAccessError('Request failed: 403 - Forbidden');

            expect(result).toContain('403');
            expect(result.length).toBeLessThan(120);
        });

        it('passes a short message through unchanged', () => {
            expect(formatApiAccessError('subscribe boom')).toBe('subscribe boom');
        });

        it('caps a long status-less blob with an ellipsis', () => {
            const result = formatApiAccessError('x'.repeat(500));

            expect(result.length).toBeLessThanOrEqual(201);
            expect(result.endsWith('…')).toBe(true);
        });
    });

    describe('formatAdobeCliError', () => {
        it('should replace arrows with newlines in error messages', () => {
            const input = 'Error: Issue in .env file › missing keys › ADOBE_CATALOG_ENDPOINT';
            const expected = 'Error: Issue in .env file\nmissing keys\nADOBE_CATALOG_ENDPOINT';

            const result = formatAdobeCliError(input);

            expect(result).toBe(expected);
        });

        it('should handle Error objects', () => {
            const error = new Error('First part › Second part › Third part');
            const expected = 'First part\nSecond part\nThird part';

            const result = formatAdobeCliError(error);

            expect(result).toBe(expected);
        });

        it('should handle arrows with spaces', () => {
            const input = 'Error › with › spaces';
            const expected = 'Error\nwith\nspaces';

            const result = formatAdobeCliError(input);

            expect(result).toBe(expected);
        });

        it('should handle arrows without spaces', () => {
            const input = 'Error›without›spaces';
            const expected = 'Error\nwithout\nspaces';

            const result = formatAdobeCliError(input);

            expect(result).toBe(expected);
        });

        it('should handle messages with no arrows', () => {
            const input = 'Simple error message';
            const expected = 'Simple error message';

            const result = formatAdobeCliError(input);

            expect(result).toBe(expected);
        });

        it('should handle empty strings', () => {
            const input = '';
            const expected = '';

            const result = formatAdobeCliError(input);

            expect(result).toBe(expected);
        });

        it('should handle multiple consecutive arrows', () => {
            const input = 'Error › › multiple arrows';
            const expected = 'Error\n\nmultiple arrows';

            const result = formatAdobeCliError(input);

            expect(result).toBe(expected);
        });

        // Regression: aio api-mesh stderr STARTS with an arrow (" ›   Error: ...").
        // The arrow→newline replacement turned that leading arrow into a LEADING
        // NEWLINE, so the first line of the formatted message was empty and
        // single-line renderers (the error log, toasts) displayed a blank error.
        it('puts content on the FIRST line when the CLI message starts with an arrow', () => {
            const liveStderr =
                ' ›   Error: Unable to create a mesh. Check the mesh configuration file and try \n' +
                ' ›   again. If the error persists please contact support. RequestId: \n' +
                ' ›   551a7566-51c5-4f1b-b6c1-b66aff0223da\n';

            const result = formatAdobeCliError(liveStderr);

            const firstLine = result.split('\n')[0];
            expect(firstLine).toContain('Error: Unable to create a mesh');
            expect(result).toBe(result.trim());
        });
    });

    describe('formatMeshDeploymentError', () => {
        it('should add mesh deployment context to error', () => {
            const input = 'Config error › invalid schema › missing field';
            const expected =
                'Failed to deploy Adobe Commerce API Mesh:\nConfig error\ninvalid schema\nmissing field';

            const result = formatMeshDeploymentError(input);

            expect(result).toBe(expected);
        });

        it('should handle Error objects', () => {
            const error = new Error('Deploy failed › connection timeout');
            const expected =
                'Failed to deploy Adobe Commerce API Mesh:\nDeploy failed\nconnection timeout';

            const result = formatMeshDeploymentError(error);

            expect(result).toBe(expected);
        });

        it('should handle simple errors', () => {
            const input = 'Network error';
            const expected = 'Failed to deploy Adobe Commerce API Mesh:\nNetwork error';

            const result = formatMeshDeploymentError(input);

            expect(result).toBe(expected);
        });
    });

    describe('formatAdobeError', () => {
        it('should format error with context', () => {
            const input = 'Token expired › re-authenticate required';
            const context = 'Authentication';
            const expected = 'Authentication Error:\nToken expired\nre-authenticate required';

            const result = formatAdobeError(input, context);

            expect(result).toBe(expected);
        });

        it('should format error without context', () => {
            const input = 'Request failed › timeout';
            const expected = 'Request failed\ntimeout';

            const result = formatAdobeError(input);

            expect(result).toBe(expected);
        });

        it('should handle Error objects with context', () => {
            const error = new Error('API error › rate limit exceeded');
            const context = 'API Mesh';
            const expected = 'API Mesh Error:\nAPI error\nrate limit exceeded';

            const result = formatAdobeError(error, context);

            expect(result).toBe(expected);
        });

        it('should handle complex error chains', () => {
            const input =
                'Failed › Config validation › Schema error › Missing required field › apiEndpoint';
            const context = 'Configuration';
            const expected =
                'Configuration Error:\nFailed\nConfig validation\nSchema error\nMissing required field\napiEndpoint';

            const result = formatAdobeError(input, context);

            expect(result).toBe(expected);
        });

        it('should handle empty context', () => {
            const input = 'Error message › with details';
            const expected = 'Error message\nwith details';

            const result = formatAdobeError(input, '');

            expect(result).toBe(expected);
        });
    });

    describe('Real-world Adobe CLI errors', () => {
        it('should handle authentication errors', () => {
            const error = 'Authentication failed › token invalid › please login again';
            const expected = 'Authentication failed\ntoken invalid\nplease login again';

            const result = formatAdobeCliError(error);

            expect(result).toBe(expected);
        });

        it('should handle configuration errors', () => {
            const error = 'Config validation failed › .env file › missing ADOBE_IMS_ORG';
            const expected = 'Config validation failed\n.env file\nmissing ADOBE_IMS_ORG';

            const result = formatAdobeCliError(error);

            expect(result).toBe(expected);
        });

        it('should handle API mesh deployment errors', () => {
            const error =
                'Mesh deployment failed › validation error › schema invalid › graphql-config.json';
            const expected =
                'Failed to deploy Adobe Commerce API Mesh:\nMesh deployment failed\nvalidation error\nschema invalid\ngraphql-config.json';

            const result = formatMeshDeploymentError(error);

            expect(result).toBe(expected);
        });

        it('should handle organization access errors', () => {
            const error = 'Organization access denied › 403 Forbidden › insufficient permissions';
            const context = 'Console API';
            const expected =
                'Console API Error:\nOrganization access denied\n403 Forbidden\ninsufficient permissions';

            const result = formatAdobeError(error, context);

            expect(result).toBe(expected);
        });
    });
});

/**
 * formatAdobeCliError — stripping HTML response bodies, and what
 * formatApiAccessError makes of a status buried in JSON.
 *
 * The Adobe CLI sometimes pastes an entire error PAGE into an error message.
 * Rendered verbatim that is tens of kilobytes in a status row, so the formatter
 * truncates at the first HTML marker it finds and tidies the separator that was
 * introducing it.
 */
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

/**
 * extractMeshErrorSummary — turning a mesh build's log dump into one line an SC
 * can act on.
 *
 * The function is a ladder: the most specific recognisable failure wins, and
 * only what nothing matches falls through to the noise filter. Several tests
 * here feed an error that would match TWO rungs, because the order is the
 * behaviour — a connection failure reported alongside a 401 is still a
 * connection failure.
 */
describe('extractMeshErrorSummary', () => {
    describe('a GraphQL endpoint it could not reach', () => {
        it('names the URL introspection failed against', () => {
            const result = extractMeshErrorSummary(
                'Failed to fetch introspection from https://demo.example.com/graphql: GraphQLError',
            );

            expect(result).toBe(
                'Could not reach GraphQL endpoint: https://demo.example.com/graphql\n' +
                    'The server returned an error. Check that the URL in your .env file is correct.',
            );
        });

        it('wins over a connection error reported in the same dump', () => {
            const result = extractMeshErrorSummary(
                'connect ECONNREFUSED 127.0.0.1:8080\n' +
                    'Failed to fetch introspection from https://demo.example.com/graphql: err',
            );

            expect(result).toContain('Could not reach GraphQL endpoint');
            expect(result).not.toContain('Could not connect to');
        });
    });

    describe('a host it could not connect to', () => {
        it.each([
            ['ECONNREFUSED', 'connect ECONNREFUSED 127.0.0.1:8080', '127.0.0.1:8080'],
            ['ENOTFOUND', 'Error: ENOTFOUND commerce.invalid', 'commerce.invalid'],
            ['ETIMEDOUT', 'ETIMEDOUT 10.0.0.5:443', '10.0.0.5:443'],
        ])('names the target of a %s', (_label, raw, target) => {
            const result = extractMeshErrorSummary(raw);

            expect(result).toBe(
                `Could not connect to: ${target}\n` +
                    'Check that the server is running and the URL is correct.',
            );
        });

        it('wins over a schema complaint in the same dump', () => {
            const result = extractMeshErrorSummary(
                'must NOT have additional properties\nENOTFOUND commerce.invalid',
            );

            expect(result).toContain('Could not connect to: commerce.invalid');
        });
    });

    describe('a mesh.json the validator rejected', () => {
        it.each([
            ['must NOT have additional properties'],
            ['missing required property'],
            ['should be string'],
            ['should be array'],
            ['should be object'],
            ['should be number'],
            ['should be boolean'],
        ])('quotes the complaint: %s', (complaint) => {
            const result = extractMeshErrorSummary(`mesh.json: ${complaint} at /sources/0`);

            expect(result).toBe(
                `Invalid mesh.json configuration: ${complaint}\n` +
                    'Check your mesh.json file for syntax errors.',
            );
        });

        it('wins over an authentication complaint in the same dump', () => {
            const result = extractMeshErrorSummary('401 unauthorized\nmissing required property');

            expect(result).toContain('Invalid mesh.json configuration');
        });
    });

    describe('credentials', () => {
        it.each([['unauthorized'], ['403'], ['401'], ['access denied'], ['not authorized']])(
            'reads %s as expired Adobe credentials',
            (marker) => {
                const result = extractMeshErrorSummary(`Mesh API responded ${marker}`);

                expect(result).toBe(
                    'Authentication failed. Your Adobe credentials may have expired.\n' +
                        'Try signing out and back in via the Project Dashboard.',
                );
            },
        );

        it('wins over a rate-limit mention in the same dump', () => {
            const result = extractMeshErrorSummary('rate limit reached after a 403');

            expect(result).toContain('Authentication failed');
        });
    });

    describe('rate limiting', () => {
        it.each([['rate limit'], ['too many requests'], ['429']])(
            'reads %s as an Adobe rate limit',
            (marker) => {
                const result = extractMeshErrorSummary(`Mesh API responded: ${marker}`);

                expect(result).toBe(
                    'Adobe API rate limit reached. Please wait a few minutes and try again.',
                );
            },
        );

        it('wins over a truncated build header in the same dump', () => {
            const result = extractMeshErrorSummary(
                'Building Mesh with config: /usr/src/node-app/\ntoo many requests',
            );

            expect(result).toContain('rate limit');
        });
    });

    describe('a build header with nothing after it', () => {
        it('explains the usual causes when the dump only starts with the header', () => {
            const result = extractMeshErrorSummary('Building Mesh with config: /usr/src/x');

            expect(result).toContain('Mesh build failed. This is usually caused by:');
            expect(result).toContain('Invalid Commerce GraphQL endpoint URL');
            expect(result).toContain('Check the Debug logs for more details.');
        });

        it('ignores a header that is neither at the start nor at the end', () => {
            // The first regex is anchored at the END (the dump stops mid-path),
            // the second at the START. This message satisfies neither, so it has
            // to fall through to the noise filter instead.
            const result = extractMeshErrorSummary('aio: Building Mesh with config: /usr/src/x');

            expect(result).toBe('Mesh deployment failed. Check the Debug logs for details.');
        });

        it('explains them too when the header is buried but the dump ends at the path', () => {
            const result = extractMeshErrorSummary(
                'aio: Building Mesh with config: /usr/src/node-app/',
            );

            expect(result).toContain('Mesh build failed. This is usually caused by:');
        });
    });

    describe('the fatal 💥 line', () => {
        it('strips the mesh banner and the container path around the failure', () => {
            const result = extractMeshErrorSummary(
                'aio mesh: starting run\n' +
                    '💥 🕸️  Mesh - CommerceGraphQL Failed to build /usr/src/node-app/mesh.json here',
            );

            expect(result).toBe('CommerceGraphQL Failed to build  here');
        });

        it('also strips an HTML body the fatal line dragged in', () => {
            const result = extractMeshErrorSummary(
                '💥 🕸️  Mesh - Failed: <!DOCTYPE html><html><body>oops</body></html>',
            );

            expect(result).toBe('Failed');
        });


        it.each([
            ['no space after the burst', '💥🕸️ Mesh - Boom Failed here'],
            ['no space before the dash', '💥 🕸️ Mesh- Boom Failed here'],
            ['no dash at all', '💥 🕸️ Mesh Boom Failed here'],
            ['no space after the dash', '💥 🕸️ Mesh -Boom Failed here'],
        ])('strips the banner with %s', (_label, raw) => {
            expect(extractMeshErrorSummary(raw)).toBe('Boom Failed here');
        });

        it('is preferred over the plain first-line fallback', () => {
            const result = extractMeshErrorSummary(
                'some earlier noise line\n💥 Mesh Error while compiling',
            );

            expect(result).toContain('Error while compiling');
            expect(result).not.toContain('some earlier noise line');
        });
    });

    describe('the fallback: the first line that says anything', () => {
        it('skips blank lines, the build banner, hints and cleaning chatter', () => {
            // The blank and whitespace-only lines sit in the MIDDLE on purpose:
            // the formatter trims the whole message first, so leading blanks
            // never reach the filter and would test nothing.
            const result = extractMeshErrorSummary(
                'Building Mesh step 2\n' +
                    '\n' +
                    '   \n' +
                    '💡 tip: check your config\n' +
                    'Cleaning existing artifacts\n' +
                    'Something specific went wrong\n' +
                    'a later line nobody should see',
            );

            expect(result).toBe('Something specific went wrong');
        });

        it('splits an arrow-separated message before picking the line', () => {
            const result = extractMeshErrorSummary('› first part › second part');

            expect(result).toBe('first part');
        });

        it('falls all the way back when every line is noise', () => {
            const result = extractMeshErrorSummary(
                '💡 hint\n\nCleaning existing artifacts\n   \nBuilding Mesh step 2',
            );

            expect(result).toBe('Mesh deployment failed. Check the Debug logs for details.');
        });

        it('falls back on an empty dump', () => {
            expect(extractMeshErrorSummary('')).toBe(
                'Mesh deployment failed. Check the Debug logs for details.',
            );
        });
    });
});
