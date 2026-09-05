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

import { extractMeshErrorSummary } from '@/features/mesh/utils/errorFormatter';

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
