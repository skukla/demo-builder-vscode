/**
 * runtimeNamespace — Runtime commands that carry the namespace key, and a list
 * that never answers "empty" for "could not look".
 *
 * On 2026-09-21 `aio app undeploy` and `aio runtime package list` both ran
 * without the key; both failed with "An AUTH key must be specified", and the
 * list's empty output was read as a clean namespace while fifteen packages
 * kept running. These pin the two halves of that: the key rides every command,
 * and a failed or unreadable list throws.
 *
 * The credential download is mocked; the command runner is a fake whose calls
 * are asserted, since HOW `aio` is invoked is the thing under test.
 */

const mockFetchRuntimeCredentials = jest.fn();
jest.mock('@/features/app-builder/services/runtimeCredentials', () => ({
    ...jest.requireActual('@/features/app-builder/services/runtimeCredentials'),
    fetchRuntimeCredentials: (...args: unknown[]) => mockFetchRuntimeCredentials(...args),
}));

const mockWriteFile = jest.fn();
const mockRm = jest.fn();
jest.mock('fs/promises', () => ({
    writeFile: (...args: unknown[]) => mockWriteFile(...args),
    rm: (...args: unknown[]) => mockRm(...args),
}));

import {
    invokeRuntimeAction,
    invokeWebAction,
    listRuntimeActivations,
    readRuntimeActivation,
} from '@/features/app-builder/services/runtimeActivations';
import { compactLogLine, compactLogs } from '@/features/app-builder/services/runtimeLogText';
import {
    deleteRuntimeEntity,
    listRuntimeNames,
    listRuntimePackages,
    runInNamespace,
    runtimeNamespaceEnv,
} from '@/features/app-builder/services/runtimeNamespace';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createFailureResult, createSuccessResult } from '../../../helpers/commandResultFake';
import { createMockLogger } from '../../../helpers/loggerFake';

const ENV = { AIO_RUNTIME_NAMESPACE: 'ns-stage', AIO_RUNTIME_AUTH: 'fake-test-auth-not-a-secret' };

function makeDeps() {
    return { commandManager: createMockCommandExecutor(), logger: createMockLogger() };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockFetchRuntimeCredentials.mockResolvedValue({
        namespace: ENV.AIO_RUNTIME_NAMESPACE,
        auth: ENV.AIO_RUNTIME_AUTH,
    });
});

describe('runtimeNamespaceEnv', () => {
    it("answers the targeted workspace's namespace and key as aio's two variables", async () => {
        const deps = makeDeps();

        await expect(runtimeNamespaceEnv(deps)).resolves.toEqual(ENV);
        expect(mockFetchRuntimeCredentials).toHaveBeenCalledWith(
            deps.commandManager,
            deps.logger,
            'auto'
        );
    });

    it('throws when the credentials cannot be fetched', async () => {
        mockFetchRuntimeCredentials.mockRejectedValue(new Error('Runtime credential fetch failed'));

        await expect(runtimeNamespaceEnv(makeDeps())).rejects.toThrow(
            'Runtime credential fetch failed'
        );
    });
});

describe('runInNamespace', () => {
    it('hands the command the namespace env, and a cwd and streaming only when asked', async () => {
        const deps = makeDeps();
        deps.commandManager.execute.mockResolvedValue(createSuccessResult());

        await runInNamespace(deps, 'aio app undeploy', ENV, { cwd: '/app', streaming: true });
        await runInNamespace(deps, 'aio runtime package list --json', ENV);

        expect(deps.commandManager.execute.mock.calls).toEqual([
            [
                'aio app undeploy',
                {
                    cwd: '/app',
                    streaming: true,
                    useNodeVersion: 'auto',
                    enhancePath: true,
                    shell: true,
                    timeout: TIMEOUTS.LONG,
                    env: ENV,
                },
            ],
            [
                'aio runtime package list --json',
                {
                    useNodeVersion: 'auto',
                    enhancePath: true,
                    shell: true,
                    timeout: TIMEOUTS.LONG,
                    env: ENV,
                },
            ],
        ]);
    });
});

describe('listRuntimePackages', () => {
    it('answers the package names, dropping entries with no name', async () => {
        const deps = makeDeps();
        deps.commandManager.execute.mockResolvedValue(
            createSuccessResult(
                JSON.stringify([{ name: 'erp' }, {}, { name: '' }, { name: 'demo-erp' }])
            )
        );

        await expect(listRuntimePackages(deps, ENV)).resolves.toEqual(['erp', 'demo-erp']);
    });

    it('answers an empty namespace as an empty list', async () => {
        const deps = makeDeps();
        deps.commandManager.execute.mockResolvedValue(createSuccessResult('[]\n'));

        await expect(listRuntimePackages(deps, ENV)).resolves.toStrictEqual([]);
    });

    it('fetches the key itself when none is handed in', async () => {
        const deps = makeDeps();
        deps.commandManager.execute.mockResolvedValue(createSuccessResult('[]'));

        await listRuntimePackages(deps);

        expect(mockFetchRuntimeCredentials).toHaveBeenCalledTimes(1);
        expect(deps.commandManager.execute).toHaveBeenCalledWith(
            'aio runtime package list --json',
            expect.objectContaining({ env: ENV })
        );
    });

    // The 2026-09-21 case, exactly: the CLI refused and printed nothing to stdout.
    it("throws on a refusal, in the CLI's own words — never an empty list", async () => {
        const deps = makeDeps();
        deps.commandManager.execute.mockResolvedValue(
            createFailureResult(
                ' ›   Error: failed to list the packages: An AUTH key must be specified'
            )
        );

        await expect(listRuntimePackages(deps, ENV)).rejects.toThrow(
            'aio runtime package list --json: Error: failed to list the packages: An AUTH key must be specified'
        );
    });

    it('throws when the answer is not a list', async () => {
        const deps = makeDeps();
        deps.commandManager.execute.mockResolvedValue(createSuccessResult(''));

        await expect(listRuntimePackages(deps, ENV)).rejects.toThrow(
            'the answer was not a list'
        );
    });
});

describe('listRuntimeNames', () => {
    it('lists rules and triggers with their own command, and the same key', async () => {
        const deps = makeDeps();
        deps.commandManager.execute.mockResolvedValue(
            createSuccessResult(JSON.stringify([{ name: 'erp-refresh-on-timer' }]))
        );

        await expect(listRuntimeNames(deps, 'rule', ENV)).resolves.toEqual(['erp-refresh-on-timer']);
        expect(deps.commandManager.execute).toHaveBeenCalledWith(
            'aio runtime rule list --json',
            expect.objectContaining({ env: ENV })
        );
    });
});

describe('deleteRuntimeEntity', () => {
    it('deletes the package recursively, with the key', async () => {
        const deps = makeDeps();
        deps.commandManager.execute.mockResolvedValue(createSuccessResult());

        await deleteRuntimeEntity(deps, 'package', 'demo-erp', ENV);

        expect(deps.commandManager.execute).toHaveBeenCalledWith(
            'aio runtime package delete demo-erp --recursive',
            expect.objectContaining({ env: ENV })
        );
    });

    // A rule or trigger is not a container: `--recursive` belongs to packages only.
    it('deletes a rule or a trigger by name, without --recursive', async () => {
        const deps = makeDeps();
        deps.commandManager.execute.mockResolvedValue(createSuccessResult());

        await deleteRuntimeEntity(deps, 'rule', 'erp-refresh-on-timer', ENV);
        await deleteRuntimeEntity(deps, 'trigger', 'erp-refresh-timer', ENV);

        expect(deps.commandManager.execute.mock.calls.map((call) => call[0])).toEqual([
            'aio runtime rule delete erp-refresh-on-timer',
            'aio runtime trigger delete erp-refresh-timer',
        ]);
    });

    it('throws when the CLI refuses, naming the exit code when it gave no reason', async () => {
        const deps = makeDeps();
        deps.commandManager.execute.mockResolvedValue({
            stdout: '',
            stderr: '',
            code: 2,
            duration: 0,
        });

        await expect(deleteRuntimeEntity(deps, 'package', 'demo-erp', ENV)).rejects.toThrow(
            'aio runtime package delete demo-erp --recursive: exited with code 2'
        );
    });
});

describe('listRuntimeActivations', () => {
    // One row exactly as `aio runtime activation list --json` printed it live on 2026-09-24.
    const RAW = [
        {
            activationId: '583ceebe8d6249edbceebe8d62f9edd7',
            annotations: [
                { key: 'path', value: '285361-ns-acmeerp/demo-erp/events-retry' },
                { key: 'waitTime', value: 9 },
                { key: 'kind', value: 'nodejs:22' },
                { key: 'timeout', value: false },
            ],
            duration: 102,
            end: 1790287255084,
            name: 'events-retry',
            namespace: '285361-ns-acmeerp',
            publish: false,
            start: 1790287254982,
            statusCode: 0,
            version: '0.0.2',
        },
    ];

    it('runs the list with the key, caps the limit at 50, filters by action, and shapes each row', async () => {
        const deps = makeDeps();
        deps.commandManager.execute.mockResolvedValue(createSuccessResult(JSON.stringify(RAW)));

        const rows = await listRuntimeActivations(deps, ENV, { limit: 500, action: 'demo-erp/events-retry' });

        expect(deps.commandManager.execute).toHaveBeenCalledWith(
            'aio runtime activation list "demo-erp/events-retry" --json --limit 50',
            expect.objectContaining({ env: ENV, shell: true }),
        );
        expect(rows).toEqual([
            {
                activationId: '583ceebe8d6249edbceebe8d62f9edd7',
                action: 'demo-erp/events-retry',
                startedAt: new Date(1790287254982).toISOString(),
                durationMs: 102,
                statusCode: 0,
                kind: 'nodejs:22',
            },
        ]);
    });

    it('pages with skip and since, keeps only failures on request, and hides the timer firings unless asked', async () => {
        const deps = makeDeps();
        // A trigger firing (no kind, no duration), a failed run and the successful RAW run, as the CLI lists them.
        const trigger = { activationId: 'a'.repeat(32), annotations: [{ key: 'path', value: 'ns/erp-refresh-timer' }], name: 'erp-refresh-timer', namespace: 'ns', start: 1790287254000 };
        const failed = { ...RAW[0], activationId: 'b'.repeat(32), statusCode: 1 };
        deps.commandManager.execute.mockResolvedValue(createSuccessResult(JSON.stringify([trigger, failed, RAW[0]])));

        const failures = await listRuntimeActivations(deps, ENV, {
            skip: 50,
            since: '2026-09-25T13:00:00Z',
            failedOnly: true,
        });
        expect(deps.commandManager.execute).toHaveBeenCalledWith(
            `aio runtime activation list --json --limit 30 --skip 50 --since ${Date.parse('2026-09-25T13:00:00Z')}`,
            expect.anything(),
        );
        expect(failures.map((r) => r.activationId)).toEqual(['b'.repeat(32)]);

        const everything = await listRuntimeActivations(deps, ENV, { includeTriggers: true });
        expect(everything.map((r) => r.action)).toEqual(['erp-refresh-timer', 'demo-erp/events-retry', 'demo-erp/events-retry']);

        const runsOnly = await listRuntimeActivations(deps, ENV);
        expect(runsOnly).toHaveLength(2);

        await expect(listRuntimeActivations(deps, ENV, { since: 'yesterday' })).rejects.toThrow(/not a time/);
    });

    it('throws when the list fails or is not a list — never an empty answer', async () => {
        const deps = makeDeps();
        deps.commandManager.execute.mockResolvedValue(createFailureResult(' ›   Error: An AUTH key must be specified'));
        await expect(listRuntimeActivations(deps, ENV)).rejects.toThrow(/AUTH key/);
        deps.commandManager.execute.mockResolvedValue(createSuccessResult('{"not":"a list"}'));
        await expect(listRuntimeActivations(deps, ENV)).rejects.toThrow(/not a list/);
    });
});

describe('readRuntimeActivation', () => {
    // Records as `aio runtime activation get` printed them live on 2026-09-25 (fields trimmed); the
    // CLI's update warning precedes the JSON.
    const WARNING = ' ›   Warning: @adobe/aio-cli update available from 11.1.2 to 11.1.4.\n';
    // On Adobe Runtime the record's `logs` is EMPTY for an action; `activation logs` has the lines.
    const ACTION_RECORD = {
        activationId: '583ceebe8d6249edbceebe8d62f9edd7',
        annotations: [{ key: 'path', value: 'ns/erp/refresh-job' }, { key: 'kind', value: 'nodejs:24' }],
        duration: 20206,
        logs: [],
        response: { result: { body: { delivered: 0 } }, status: 'application error', success: false },
    };
    const ACTION_LOGS = '=== activation logs 583ceebe8d6249edbceebe8d62f9edd7\n2026-09-24T21:43:03.598Z stdout: 2026-09-24T21:43:03.598Z [erp-refresh-job /ns/erp/refresh-job] error: partner refresh failed\n';

    it('reads the record with get (past the CLI warning) and the lines with logs, answering the action, how it ended, the result and the compacted log', async () => {
        const deps = makeDeps();
        deps.commandManager.execute
            .mockResolvedValueOnce(createSuccessResult(WARNING + JSON.stringify(ACTION_RECORD)))
            .mockResolvedValueOnce(createSuccessResult(ACTION_LOGS));

        const read = await readRuntimeActivation(deps, ENV, '583ceebe8d6249edbceebe8d62f9edd7');

        expect(deps.commandManager.execute.mock.calls.map((c) => c[0])).toEqual([
            'aio runtime activation get 583ceebe8d6249edbceebe8d62f9edd7',
            'aio runtime activation logs 583ceebe8d6249edbceebe8d62f9edd7',
        ]);
        expect(read).toEqual({
            activationId: '583ceebe8d6249edbceebe8d62f9edd7',
            action: 'erp/refresh-job',
            status: 'application error',
            success: false,
            durationMs: 20206,
            result: { body: { delivered: 0 } },
            logs: ['21:43:03.598 error: partner refresh failed'],
        });
    });

    it("follows a sequence (an Adobe-auth web action) into its components, labelling each one's lines with its action", async () => {
        const deps = makeDeps();
        const sequence = {
            activationId: '49ad74acff0a41b2ad74acff0a61b212',
            annotations: [{ key: 'path', value: 'ns/webhook/item-prices' }, { key: 'kind', value: 'sequence' }],
            duration: 3481,
            logs: ['4c4c97d219d44d908c97d219d49d9019', '992c23d318454541ac23d31845d54143'],
            response: { result: { body: [{ op: 'replace' }], statusCode: 200 }, status: 'success', success: true },
        };
        const validator = {
            activationId: '4c4c97d219d44d908c97d219d49d9019',
            annotations: [{ key: 'path', value: 'ns/shared-validators-v1/headless-v2' }, { key: 'kind', value: 'nodejs:22' }],
            logs: [],
            response: { result: { ok: true }, status: 'success', success: true },
        };
        const action = {
            activationId: '992c23d318454541ac23d31845d54143',
            annotations: [{ key: 'path', value: 'ns/webhook/__secured_item-prices' }, { key: 'kind', value: 'nodejs:24' }],
            logs: [],
            response: { result: { body: [{ op: 'replace' }] }, status: 'success', success: true },
        };
        deps.commandManager.execute
            .mockResolvedValueOnce(createSuccessResult(JSON.stringify(sequence)))
            .mockResolvedValueOnce(createSuccessResult(JSON.stringify(validator)))
            .mockResolvedValueOnce(createSuccessResult('=== activation logs 4c4c97d219d44d908c97d219d49d9019\n'))
            .mockResolvedValueOnce(createSuccessResult(JSON.stringify(action)))
            .mockResolvedValueOnce(createSuccessResult('=== activation logs 992c23d318454541ac23d31845d54143\n2026-09-25T14:59:50.100Z stdout: 2026-09-25T14:59:50.100Z [webhook-item-prices /ns/webhook/__secured_item-prices] info: item-prices: partner C21, 1 line(s) priced\n'));

        const read = await readRuntimeActivation(deps, ENV, sequence.activationId);

        expect(read.action).toBe('webhook/item-prices');
        expect(read.result).toEqual({ body: [{ op: 'replace' }], statusCode: 200 });
        expect(read.logs).toEqual([
            '[shared-validators-v1/headless-v2]',
            '(no log lines)',
            '[webhook/__secured_item-prices]',
            '14:59:50.100 info: item-prices: partner C21, 1 line(s) priced',
        ]);
        expect(deps.commandManager.execute.mock.calls.map((c) => String(c[0]))).toEqual([
            `aio runtime activation get ${sequence.activationId}`,
            'aio runtime activation get 4c4c97d219d44d908c97d219d49d9019',
            'aio runtime activation logs 4c4c97d219d44d908c97d219d49d9019',
            'aio runtime activation get 992c23d318454541ac23d31845d54143',
            'aio runtime activation logs 992c23d318454541ac23d31845d54143',
        ]);
    });

    it("never answers a component's result, and redacts a bearer or a secret-named field wherever it appears", async () => {
        // Measured 2026-09-25: the Adobe-auth validator's result is the request itself, `__ow_headers.authorization` included.
        const deps = makeDeps();
        const sequence = {
            activationId: '49ad74acff0a41b2ad74acff0a61b212',
            annotations: [{ key: 'kind', value: 'sequence' }],
            logs: ['4c4c97d219d44d908c97d219d49d9019'],
            response: { result: { echoed: { authorization: 'Bearer abc.def', note: 'token Bearer abc.def inside text' } }, status: 'success', success: true },
        };
        const validator = {
            activationId: '4c4c97d219d44d908c97d219d49d9019',
            annotations: [{ key: 'path', value: 'ns/shared-validators-v1/headless-v2' }],
            logs: [],
            response: { result: { __ow_headers: { authorization: 'Bearer abc.def' } }, status: 'success', success: true },
        };
        deps.commandManager.execute
            .mockResolvedValueOnce(createSuccessResult(JSON.stringify(sequence)))
            .mockResolvedValueOnce(createSuccessResult(JSON.stringify(validator)))
            .mockResolvedValueOnce(createSuccessResult('2026-09-25T15:00:00.000Z stdout: header Authorization: Bearer abc.def seen\n'));

        const read = await readRuntimeActivation(deps, ENV, sequence.activationId);

        expect(JSON.stringify(read)).not.toContain('abc.def');
        expect(read.result).toEqual({ echoed: { authorization: '[redacted]', note: 'token Bearer [redacted] inside text' } });
        expect(read.logs).toEqual(['[shared-validators-v1/headless-v2]', '15:00:00.000 header Authorization: Bearer [redacted] seen']);
    });

    it('refuses an id that is not 32 hex characters before running anything', async () => {
        const deps = makeDeps();
        await expect(readRuntimeActivation(deps, ENV, 'abc; rm -rf /')).rejects.toThrow(/32 hex/);
        expect(deps.commandManager.execute).not.toHaveBeenCalled();
    });
});


describe('compactLogLine and compactLogs', () => {
    it("keeps the time of day, the stream when it is stderr, the level and the message — not the date twice and the action's path", () => {
        expect(
            compactLogLine(
                '2026-09-25T14:28:32.552Z       stdout: 2026-09-25T14:28:32.552Z [product-external-updated /285361-ns-acmeerp/product-backoffice/updated] info: Start processing request',
            ),
        ).toBe('14:28:32.552 info: Start processing request');
        expect(compactLogLine('2026-09-25T12:05:40.044Z       stderr: something odd')).toBe('12:05:40.044 stderr: something odd');
        expect(compactLogLine('plain line')).toBe('plain line');
    });

    it("drops the CLI banner, blank lines and node's deprecation chatter", () => {
        expect(compactLogLine('=== activation logs abc')).toBeUndefined();
        expect(compactLogLine('   ')).toBeUndefined();
        expect(
            compactLogLine('2026-09-25T12:05:40.044Z stderr: (node:3) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized'),
        ).toBeUndefined();
        expect(compactLogLine('(Use `node --trace-deprecation ...` to show where the warning was created)')).toBeUndefined();
    });

    it('cuts at the ceiling and says how many lines were left out', () => {
        const long = 'x'.repeat(12_000);
        const kept = compactLogs([long, long, long, 'tail']);
        expect(kept).toHaveLength(3);
        expect(kept[2]).toMatch(/^\[cut: 2 more line\(s\)/u);
    });
});

describe('invokeRuntimeAction', () => {
    // The record as `aio runtime action invoke --blocking` printed it live on 2026-09-25 (fields trimmed).
    const RECORD = {
        activationId: 'a3cca9edf21d4fcf8ca9edf21d1fcf4a',
        duration: 3608,
        logs: ['2026-09-25T13:35:15.400Z stdout: 2026-09-25T13:35:15.400Z [webhook-item-prices /ns/webhook/item-prices] info: item-prices: partner C21, 1 line(s) priced'],
        name: 'item-prices',
        response: { result: { body: [{ op: 'replace', path: 'result/price_updates' }], statusCode: 200 }, status: 'success', success: true },
    };

    it('writes the payload to a temp file, invokes blocking with the key, removes the file, and answers the compacted record', async () => {
        const deps = makeDeps();
        deps.commandManager.execute.mockResolvedValue(createSuccessResult(JSON.stringify(RECORD)));

        const answer = await invokeRuntimeAction(deps, ENV, 'webhook/item-prices', { quote: { customer_group_id: 18 } });

        const [file, contents] = mockWriteFile.mock.calls[0];
        expect(String(file)).toMatch(/demo-builder-invoke-.*\.json$/u);
        expect(JSON.parse(String(contents))).toEqual({ quote: { customer_group_id: 18 } });
        expect(deps.commandManager.execute).toHaveBeenCalledWith(
            `aio runtime action invoke "webhook/item-prices" --blocking --param-file "${String(file)}"`,
            expect.objectContaining({ env: ENV, shell: true }),
        );
        expect(mockRm).toHaveBeenCalledWith(file, { force: true });
        expect(answer).toEqual({
            activationId: 'a3cca9edf21d4fcf8ca9edf21d1fcf4a',
            status: 'success',
            success: true,
            durationMs: 3608,
            result: { body: [{ op: 'replace', path: 'result/price_updates' }], statusCode: 200 },
            logs: ['13:35:15.400 info: item-prices: partner C21, 1 line(s) priced'],
        });
    });

    it('answers the record of an application error too (the CLI exits non-zero but prints it)', async () => {
        const deps = makeDeps();
        const failed = { ...RECORD, response: { result: { error: 'boom' }, status: 'application error', success: false } };
        deps.commandManager.execute.mockResolvedValue(createFailureResult(JSON.stringify(failed)));
        // A failure result carries its text in stderr; the record is on stdout in the real CLI, so hand it there.
        deps.commandManager.execute.mockResolvedValue({ ...createFailureResult(''), stdout: JSON.stringify(failed) });

        const answer = await invokeRuntimeAction(deps, ENV, 'webhook/item-prices');
        expect(answer.success).toBe(false);
        expect(answer.result).toEqual({ error: 'boom' });
    });

    it("reads a sequence's components when the record's logs are activation ids (an Adobe-auth web action invoked directly)", async () => {
        const deps = makeDeps();
        const componentId = '2925a4896d72403aa5a4896d72503a8a';
        const sequence = { ...RECORD, logs: [componentId], response: { result: { error: { statusCode: 500 } }, status: 'application error', success: false } };
        const validator = {
            activationId: componentId,
            annotations: [{ key: 'path', value: 'ns/shared-validators-v1/headless-v2' }],
            logs: [],
            response: { result: { error: 'server error' }, status: 'application error', success: false },
        };
        deps.commandManager.execute
            .mockResolvedValueOnce(createSuccessResult(JSON.stringify(sequence)))
            .mockResolvedValueOnce(createSuccessResult(JSON.stringify(validator)))
            .mockResolvedValueOnce(createSuccessResult('2026-09-25T14:55:15.230Z stdout: 2026-09-25T14:55:15.230Z [headless-v2 /ns/shared-validators-v1/headless-v2] error: missing authorization header\n'));

        const answer = await invokeRuntimeAction(deps, ENV, 'webhook/item-prices');

        expect(answer.logs).toEqual(['[shared-validators-v1/headless-v2]', '14:55:15.230 error: missing authorization header']);
        expect(JSON.stringify(answer)).not.toContain('Bearer ey');
        expect(deps.commandManager.execute.mock.calls.map((c) => String(c[0]))).toContain(`aio runtime activation get ${componentId}`);
    });

    it('refuses a malformed action name before writing or running anything, and throws when the CLI answers nothing readable', async () => {
        const deps = makeDeps();
        await expect(invokeRuntimeAction(deps, ENV, 'webhook/item-prices; rm -rf /')).rejects.toThrow(/action name/);
        expect(mockWriteFile).not.toHaveBeenCalled();
        deps.commandManager.execute.mockResolvedValue(createFailureResult(' ›   Error: An AUTH key must be specified'));
        await expect(invokeRuntimeAction(deps, ENV, 'webhook/item-prices')).rejects.toThrow(/AUTH key/);
        expect(mockRm).toHaveBeenCalled();
    });
});


describe('invokeWebAction', () => {
    it("POSTs the payload to the action's URL with the user's bearer, the org and the extra-logging header, and answers the parsed body", async () => {
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            text: async () => JSON.stringify([{ op: 'replace', path: 'result/price_updates' }]),
        });

        const answer = await invokeWebAction(
            'https://ns.adobeioruntime.net/api/v1/web/webhook/item-prices',
            { accessToken: 'fake-test-token-not-a-secret', imsOrgId: 'ORG@AdobeOrg' },
            { quote: { customer_group_id: 18 } },
            fetchImpl as unknown as typeof fetch,
        );

        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toBe('https://ns.adobeioruntime.net/api/v1/web/webhook/item-prices');
        expect(init.method).toBe('POST');
        expect(init.headers).toEqual({
            Authorization: 'Bearer fake-test-token-not-a-secret',
            'x-gw-ims-org-id': 'ORG@AdobeOrg',
            'X-OW-EXTRA-LOGGING': 'on',
            'Content-Type': 'application/json',
            Accept: 'application/json',
        });
        expect(JSON.parse(init.body)).toEqual({ quote: { customer_group_id: 18 } });
        expect(answer).toEqual({ httpStatus: 200, ok: true, result: [{ op: 'replace', path: 'result/price_updates' }] });
    });

    it('redacts a bearer the web action echoed back', async () => {
        const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '{"headers":{"authorization":"Bearer abc.def"}}' });
        const answer = await invokeWebAction('https://x/web/a/b', { accessToken: 'abc.def', imsOrgId: 'o' }, {}, fetchImpl as unknown as typeof fetch);
        expect(JSON.stringify(answer)).not.toContain('abc.def');
    });

    it('answers a non-JSON body as text and a refusal with its status', async () => {
        const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'unauthorized' });
        const answer = await invokeWebAction('https://x/web/a/b', { accessToken: 't', imsOrgId: 'o' }, {}, fetchImpl as unknown as typeof fetch);
        expect(answer).toEqual({ httpStatus: 401, ok: false, result: 'unauthorized' });
    });
});
