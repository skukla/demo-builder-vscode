import {
    formatAdobeCliError,
    formatMeshDeploymentError,
    formatAdobeError
} from '@/features/mesh/utils/errorFormatter';

describe('ErrorFormatter', () => {
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
    });

    describe('formatMeshDeploymentError', () => {
        it('should add mesh deployment context to error', () => {
            const input = 'Config error › invalid schema › missing field';
            const expected = 'Failed to deploy Adobe Commerce API Mesh:\nConfig error\ninvalid schema\nmissing field';

            const result = formatMeshDeploymentError(input);

            expect(result).toBe(expected);
        });

        it('should handle Error objects', () => {
            const error = new Error('Deploy failed › connection timeout');
            const expected = 'Failed to deploy Adobe Commerce API Mesh:\nDeploy failed\nconnection timeout';

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
            const input = 'Failed › Config validation › Schema error › Missing required field › apiEndpoint';
            const context = 'Configuration';
            const expected = 'Configuration Error:\nFailed\nConfig validation\nSchema error\nMissing required field\napiEndpoint';

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
            const error = 'Mesh deployment failed › validation error › schema invalid › graphql-config.json';
            const expected = 'Failed to deploy Adobe Commerce API Mesh:\nMesh deployment failed\nvalidation error\nschema invalid\ngraphql-config.json';

            const result = formatMeshDeploymentError(error);

            expect(result).toBe(expected);
        });

        it('should handle organization access errors', () => {
            const error = 'Organization access denied › 403 Forbidden › insufficient permissions';
            const context = 'Console API';
            const expected = 'Console API Error:\nOrganization access denied\n403 Forbidden\ninsufficient permissions';

            const result = formatAdobeError(error, context);

            expect(result).toBe(expected);
        });
    });
});
