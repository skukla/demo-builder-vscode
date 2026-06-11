/**
 * Config-as-content writer (Slice 2, Step 06).
 *
 * For an AEM-Sites satellite, commerce wiring travels as CONTENT: the writer
 * authors `configs` + `configs-stage` + `configs-dev` nodes into the AEM
 * content tree (CitiSignal paths.json mapping) instead of pushing config.json
 * to a repo the joiner doesn't own.
 *
 * Contract under test:
 *  - Value parity: payloads carry the same commerce values today's config.json
 *    carries (derived via the existing configGenerator functions, no duplication)
 *  - Three nodes: /content/<site>/configs, /configs-stage, /configs-dev
 *  - Writes go through a ContentWritePort (AEM authoring is the real target)
 *  - Write auth = the EXISTING IMS identity (Bearer on the AEM authoring port);
 *    no new credential
 *  - R2 manual fallback: missing IMS token OR 401/403 → stops cleanly, returns
 *    `manualFallbackRequired` with exact paths + payloads, never throws
 *  - Redaction: the IMS token value never appears in any log line
 */

import {
    CONFIG_CONTENT_ENVIRONMENTS,
    configContentNodePath,
    createAemAuthoringWritePort,
    writeConfigAsContent,
    type ContentWritePort,
    type ContentWriteResult,
} from '@/features/eds/services/configAsContentWriter';
import { extractConfigParams, generateConfigJson } from '@/features/eds/services/configGenerator';
import type { Logger, Project } from '@/types';

jest.setTimeout(5000);

const AEM_AUTHOR_URL = 'https://author-p57319-e1619941.adobeaemcloud.com';
const AEM_CONTENT_PATH = '/content/citisignal';

function createMockLogger(): Logger {
    return {
        debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), trace: jest.fn(),
    } as unknown as Logger;
}

/** A PaaS satellite project whose commerce wiring is fully known (post-Phase-4 shape). */
function createPaasProject(): Project {
    return {
        name: 'citisignal-satellite',
        componentSelections: { backend: 'adobe-commerce-paas' },
        componentConfigs: {
            'eds-commerce-mesh': {
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://direct.example.com/graphql',
                PAAS_CATALOG_SERVICE_ENDPOINT: 'https://catalog.example.com/graphql',
                ADOBE_CATALOG_API_KEY: 'catalog-api-key-123',
                ADOBE_COMMERCE_ENVIRONMENT_ID: 'env-789',
                ADOBE_COMMERCE_STORE_VIEW_CODE: 'en_us',
                ADOBE_COMMERCE_STORE_CODE: 'us_store',
                ADOBE_COMMERCE_WEBSITE_CODE: 'us_website',
                ADOBE_COMMERCE_CUSTOMER_GROUP: 'b2c-group-hash',
            },
        },
        meshState: { endpoint: 'https://mesh.example.com/graphql' },
    } as unknown as Project;
}

const COORDS = {
    githubOwner: 'commerce-sc',
    repoName: 'citisignal-upstream',
    daLiveOrg: 'content-sc',
    daLiveSite: 'citisignal',
};

/** Recording port: captures writes, succeeds by default. */
function createRecordingPort(
    result: ContentWriteResult = { ok: true },
): ContentWritePort & { writes: Array<{ path: string; payload: string }> } {
    const writes: Array<{ path: string; payload: string }> = [];
    return {
        writes,
        writeConfig: jest.fn(async (path: string, payload: string) => {
            writes.push({ path, payload });
            return result;
        }),
    };
}

function writerParams(port: ContentWritePort, logger: Logger = createMockLogger()) {
    return {
        project: createPaasProject(),
        coords: COORDS,
        contentPath: AEM_CONTENT_PATH,
        writePort: port,
        logger,
    };
}

describe('configContentNodePath', () => {
    it('maps prod → /configs and stage/dev → /configs-<env> under the content path', () => {
        expect(configContentNodePath(AEM_CONTENT_PATH, 'prod')).toBe('/content/citisignal/configs');
        expect(configContentNodePath(AEM_CONTENT_PATH, 'stage')).toBe('/content/citisignal/configs-stage');
        expect(configContentNodePath(AEM_CONTENT_PATH, 'dev')).toBe('/content/citisignal/configs-dev');
    });

    it('normalizes a trailing slash on the content path', () => {
        expect(configContentNodePath('/content/citisignal/', 'prod')).toBe('/content/citisignal/configs');
    });
});

describe('writeConfigAsContent', () => {
    it('authors all three env nodes at the paths.json-mapped paths (three writes)', async () => {
        const port = createRecordingPort();

        const result = await writeConfigAsContent(writerParams(port));

        expect(result.success).toBe(true);
        expect(port.writes.map(w => w.path)).toEqual([
            '/content/citisignal/configs',
            '/content/citisignal/configs-stage',
            '/content/citisignal/configs-dev',
        ]);
        if (result.success) {
            expect(result.writtenPaths).toEqual([
                '/content/citisignal/configs',
                '/content/citisignal/configs-stage',
                '/content/citisignal/configs-dev',
            ]);
        }
    });

    it('derives the SAME commerce values today\'s config.json carries (parity via configGenerator)', async () => {
        const port = createRecordingPort();
        const logger = createMockLogger();

        await writeConfigAsContent(writerParams(port, logger));

        // Reference: what the repo-side path generates for the same project
        const reference = generateConfigJson(
            { ...COORDS, ...extractConfigParams(createPaasProject()) },
            logger,
        );
        expect(reference.success).toBe(true);
        const expected = JSON.parse(reference.content!).public.default;

        const payload = JSON.parse(port.writes[0].payload).public.default;
        expect(payload['commerce-core-endpoint']).toBe(expected['commerce-core-endpoint']);
        expect(payload['commerce-core-endpoint']).toBe('https://catalog.example.com/graphql');
        expect(payload['commerce-endpoint']).toBe('https://mesh.example.com/graphql');
        expect(payload.headers.cs['x-api-key']).toBe('catalog-api-key-123');
        expect(payload.headers.cs['Magento-Environment-Id']).toBe('env-789');
        expect(payload.headers.cs['Magento-Store-Code']).toBe('us_store');
        expect(payload.headers.cs['Magento-Website-Code']).toBe('us_website');
        expect(payload.headers.all.Store).toBe('en_us');
    });

    it('writes the same payload to every env node (n=3 of one primitive)', async () => {
        const port = createRecordingPort();

        await writeConfigAsContent(writerParams(port));

        expect(port.writes).toHaveLength(CONFIG_CONTENT_ENVIRONMENTS.length);
        expect(port.writes[1].payload).toBe(port.writes[0].payload);
        expect(port.writes[2].payload).toBe(port.writes[0].payload);
    });

    it('returns manualFallbackRequired with exact paths + payloads on a 401 (R2), without throwing', async () => {
        const port = createRecordingPort({ ok: false, status: 401, error: 'Unauthorized' });

        const result = await writeConfigAsContent(writerParams(port));

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.manualFallbackRequired).toBe(true);
            expect(result.reason).toContain('401');
            // Exact paths + payloads for ALL three nodes so the user can author manually
            expect(result.writes.map(w => w.path)).toEqual([
                '/content/citisignal/configs',
                '/content/citisignal/configs-stage',
                '/content/citisignal/configs-dev',
            ]);
            for (const write of result.writes) {
                expect(JSON.parse(write.payload).public.default.headers.cs['x-api-key'])
                    .toBe('catalog-api-key-123');
            }
        }
    });

    it('returns manualFallbackRequired on a 403 and stops cleanly after the first failed write', async () => {
        const port = createRecordingPort({ ok: false, status: 403, error: 'Forbidden' });

        const result = await writeConfigAsContent(writerParams(port));

        expect(result.success).toBe(false);
        // Stops cleanly: no further writes attempted after the failure
        expect(port.writes).toHaveLength(1);
    });
});

describe('createAemAuthoringWritePort (write auth = existing IMS identity)', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
        global.fetch = originalFetch;
        jest.restoreAllMocks();
    });

    function mockFetch(response: Partial<Response>): jest.Mock {
        const fn = jest.fn().mockResolvedValue({ ok: true, status: 200, ...response });
        global.fetch = fn as unknown as typeof fetch;
        return fn;
    }

    it('authenticates the authoring write with the EXISTING IMS token (Bearer), against the author URL', async () => {
        const fetchMock = mockFetch({});
        const port = createAemAuthoringWritePort(
            AEM_AUTHOR_URL,
            { getAccessToken: jest.fn().mockResolvedValue('existing-ims-token') },
            createMockLogger(),
        );

        const result = await port.writeConfig('/content/citisignal/configs', '{"public":{}}');

        expect(result.ok).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toBe('https://author-p57319-e1619941.adobeaemcloud.com/content/citisignal/configs');
        expect(init.headers.Authorization).toBe('Bearer existing-ims-token');
        expect(init.body).toBe('{"public":{}}');
    });

    it('maps a MISSING IMS token to a non-ok auth result (no fetch attempted) — R2 trigger', async () => {
        const fetchMock = mockFetch({});
        const port = createAemAuthoringWritePort(
            AEM_AUTHOR_URL,
            { getAccessToken: jest.fn().mockResolvedValue(null) },
            createMockLogger(),
        );

        const result = await port.writeConfig('/content/citisignal/configs', '{}');

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.status).toBe(401);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('maps an HTTP error response to a non-ok result with the status', async () => {
        mockFetch({ ok: false, status: 403 });
        const port = createAemAuthoringWritePort(
            AEM_AUTHOR_URL,
            { getAccessToken: jest.fn().mockResolvedValue('existing-ims-token') },
            createMockLogger(),
        );

        const result = await port.writeConfig('/content/citisignal/configs', '{}');

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.status).toBe(403);
    });

    it('maps a network failure to a non-ok result instead of throwing', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET')) as unknown as typeof fetch;
        const port = createAemAuthoringWritePort(
            AEM_AUTHOR_URL,
            { getAccessToken: jest.fn().mockResolvedValue('existing-ims-token') },
            createMockLogger(),
        );

        const result = await port.writeConfig('/content/citisignal/configs', '{}');

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain('ECONNRESET');
    });

    it('NEVER logs the IMS token value (redaction), success or failure', async () => {
        const logger = createMockLogger();
        const secret = 'super-secret-ims-token-value';

        // Failure path logs more — exercise it
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403 }) as unknown as typeof fetch;
        const port = createAemAuthoringWritePort(
            AEM_AUTHOR_URL,
            { getAccessToken: jest.fn().mockResolvedValue(secret) },
            logger,
        );
        await port.writeConfig('/content/citisignal/configs', '{}');

        // And the writer's own logging on the fallback path
        const failingPort = createRecordingPort({ ok: false, status: 403, error: 'Forbidden' });
        await writeConfigAsContent({
            project: createPaasProject(), coords: COORDS, contentPath: AEM_CONTENT_PATH,
            writePort: failingPort, logger,
        });

        const allLogged = (Object.values(logger) as jest.Mock[])
            .flatMap(fn => (fn.mock ? fn.mock.calls.flat() : []))
            .map(arg => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
            .join('\n');
        expect(allLogged).not.toContain(secret);
    });
});
