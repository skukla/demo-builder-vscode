/**
 * `fetchMeshInfoFromAdobeIO` — reading a mesh id and endpoint out of whatever
 * `aio api-mesh:describe` printed.
 *
 * It has to cope with two unrelated output formats because the CLI has changed
 * which one it emits: a JSON document, and a human-readable listing that is
 * parsed with regexes. Both are tried in that order, and every failure is
 * reported the same way — as null, never as a throw — because the callers are
 * reset and self-heal paths that must not be taken down by an unparseable
 * describe.
 *
 * The regex half was reached by no test at all before this suite: 17 of the
 * module's uncovered mutants were the two patterns.
 */

import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import {
    fetchMeshInfoFromAdobeIO,
    setupMeshVerifier,
    type MeshCommandExecutorFake,
} from './meshVerifier.testUtils';
import { createSuccessResult, createFailureResult } from '../../../helpers/commandResultFake';
import type { createMockLogger } from '../../../helpers/loggerFake';

let mockCommandManager: MeshCommandExecutorFake;
let mockLogger: ReturnType<typeof createMockLogger>;

/** Run the fetch against a clean exit printing `stdout`. */
function describePrints(stdout: string) {
    mockCommandManager.execute.mockResolvedValue(createSuccessResult(stdout));
    return fetchMeshInfoFromAdobeIO(mockCommandManager, mockLogger);
}

beforeEach(() => {
    ({ mockCommandManager, mockLogger } = setupMeshVerifier());
});

describe('the describe command it runs', () => {
    it('runs api-mesh:describe with the mesh Node version and the enhanced PATH', async () => {
        // The mesh CLI plugin runs under its own Node version, and `aio` is only
        // on the PATH once the npm global directories are prepended. Telemetry
        // configuration is off because this is a read on a recovery path.
        await describePrints('');

        expect(mockCommandManager.execute).toHaveBeenCalledWith('aio api-mesh:describe', {
            timeout: TIMEOUTS.NORMAL,
            configureTelemetry: false,
            useNodeVersion: expect.any(String),
            enhancePath: true,
        });
    });
});

describe('JSON output', () => {
    it('reads meshId and endpoint', async () => {
        const info = await describePrints(
            JSON.stringify({ meshId: 'abc123', endpoint: 'https://mesh.example/graphql' }),
        );

        expect(info).toEqual({ meshId: 'abc123', endpoint: 'https://mesh.example/graphql' });
    });

    it('accepts the snake_case spelling of the id', async () => {
        // Both spellings come out of the CLI depending on its version.
        const info = await describePrints(JSON.stringify({ mesh_id: 'abc123' }));

        expect(info?.meshId).toBe('abc123');
    });

    it('accepts the meshEndpoint spelling of the endpoint', async () => {
        const info = await describePrints(
            JSON.stringify({ meshEndpoint: 'https://mesh.example/graphql' }),
        );

        expect(info?.endpoint).toBe('https://mesh.example/graphql');
    });

    it('prefers meshId over mesh_id when the document carries both', async () => {
        const info = await describePrints(
            JSON.stringify({ meshId: 'preferred', mesh_id: 'other' }),
        );

        expect(info?.meshId).toBe('preferred');
    });

    it('prefers meshEndpoint over endpoint when the document carries both', async () => {
        const info = await describePrints(
            JSON.stringify({ meshEndpoint: 'https://preferred', endpoint: 'https://other' }),
        );

        expect(info?.endpoint).toBe('https://preferred');
    });

    it('reports a document with neither field as present but empty', async () => {
        const info = await describePrints(JSON.stringify({ status: 'ok' }));

        expect(info).toEqual({ meshId: undefined, endpoint: undefined });
    });
});

describe('the human-readable listing', () => {
    it('reads "Mesh ID: <id>" and "Endpoint: <url>"', async () => {
        const info = await describePrints(
            'Mesh ID: abc123\nEndpoint: https://mesh.example/graphql',
        );

        expect(info).toEqual({ meshId: 'abc123', endpoint: 'https://mesh.example/graphql' });
    });

    it('reads the snake_case listing', async () => {
        const info = await describePrints('mesh_id: 9f8e7d6c-1234-4321-abcd-000000000000');

        expect(info?.meshId).toBe('9f8e7d6c-1234-4321-abcd-000000000000');
    });

    it('reads the hyphenated listing', async () => {
        const info = await describePrints('mesh-id: abc123');

        expect(info?.meshId).toBe('abc123');
    });

    it('reads the run-together listing', async () => {
        const info = await describePrints('meshid: abc123');

        expect(info?.meshId).toBe('abc123');
    });

    it('reads an endpoint prefixed with "Mesh Endpoint"', async () => {
        const info = await describePrints('Mesh Endpoint: https://mesh.example/graphql');

        expect(info?.endpoint).toBe('https://mesh.example/graphql');
    });

    it('reports an id with no endpoint', async () => {
        const info = await describePrints('Mesh ID: abc123');

        expect(info).toEqual({ meshId: 'abc123', endpoint: undefined });
    });

    it('reports an endpoint with no id', async () => {
        const info = await describePrints('Endpoint: https://mesh.example/graphql');

        expect(info).toEqual({ meshId: undefined, endpoint: 'https://mesh.example/graphql' });
    });

    it('stops the id at the first character that cannot be part of one', async () => {
        // The ids are hex with hyphens; taking anything else would carry the
        // rest of the line into the value.
        const info = await describePrints('Mesh ID: abc123 (deployed)');

        expect(info?.meshId).toBe('abc123');
    });

    it('stops the endpoint at whitespace', async () => {
        const info = await describePrints('Endpoint: https://mesh.example/graphql (live)');

        expect(info?.endpoint).toBe('https://mesh.example/graphql');
    });
});

describe('output it cannot read', () => {
    it('reports nothing when the describe command exits non-zero', async () => {
        mockCommandManager.execute.mockResolvedValue(createFailureResult('not signed in'));

        await expect(
            fetchMeshInfoFromAdobeIO(mockCommandManager, mockLogger),
        ).resolves.toBeNull();
    });

    it('reports nothing when the command exited non-zero, whatever it printed', async () => {
        // A failed describe can still print a listing — from a previous line of
        // output, or a partially written response. Reading it would report a
        // mesh that the command just failed to confirm.
        mockCommandManager.execute.mockResolvedValue({
            stdout: 'Mesh ID: abc123',
            stderr: 'not signed in',
            code: 1,
            duration: 0,
        });

        await expect(
            fetchMeshInfoFromAdobeIO(mockCommandManager, mockLogger),
        ).resolves.toBeNull();
    });

    it('reports nothing when the command printed nothing', async () => {
        await expect(describePrints('')).resolves.toBeNull();
    });

    it('reports nothing when the command printed only whitespace', async () => {
        await expect(describePrints('   \n  ')).resolves.toBeNull();
    });

    it('reports nothing for text carrying neither an id nor an endpoint', async () => {
        await expect(describePrints('No meshes found for this workspace.')).resolves.toBeNull();
    });

    it('reports nothing — rather than throwing — when the command itself fails', async () => {
        // The callers are reset and self-heal paths; a throw here takes down the
        // operation that was trying to recover.
        mockCommandManager.execute.mockRejectedValue(new Error('aio exploded'));

        await expect(
            fetchMeshInfoFromAdobeIO(mockCommandManager, mockLogger),
        ).resolves.toBeNull();
    });
});
