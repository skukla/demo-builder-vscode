/**
 * A failing CLI reports the CLI's error, not "Invalid response format".
 *
 * Filed as issue #63: `list_adobe_projects` intermittently fails with
 * "Invalid projects response format" right after an org switch, and a retry
 * sometimes succeeds. Two people investigated it by decompiling `dist/extension.js`
 * and concluded the fallback was missing a `--json` flag. It is not — that flag has
 * been there since 2026-08-04, and the CLI's `--json` output is valid.
 *
 * The real mechanism, reproduced against the live CLI on 2026-08-17:
 *
 *     $ AIO_CONSOLE_ORG_ID=<stale> aio console project list --json
 *     exit 2 · stdout 0 bytes · stderr 446 bytes ("403 Forbidden … NOT_ALLOWED")
 *
 * `validateCLIResult` returns TRUE for exit code 2 — deliberately, because some CLI
 * versions put valid JSON on stderr with that code. So a CLI FAILURE is handed to
 * the parser, which finds nothing parseable and reports a PARSE problem. The CLI's
 * own explanation, sitting right there on stderr, is discarded unless it happens to
 * contain "401" or "403".
 *
 * That is why the message is useless, why it looks intermittent (it mirrors whatever
 * transient error the CLI hit), and why nobody could diagnose it from the outside.
 *
 * The fix is not to reject exit 2 — that would break the stderr-JSON case the
 * whitelist exists for. It is to stop *lying about which layer failed* when parsing
 * comes up empty and the CLI told us why.
 */

// Logging only. `parseJSON` is deliberately REAL here — the whole question is what
// the parser does with the CLI's actual bytes, and a mocked parser would answer it
// for us.

import type { CommandResult } from '@/core/shell/types';
import { setupMocks, type TestMocks } from './adobeEntityService.testUtils';

let mocks: TestMocks;

beforeEach(() => {
    mocks = setupMocks();
    // Force the CLI fallback: the SDK path must yield nothing.
    mocks.mockSDKClient.isInitialized.mockReturnValue(false);
    mocks.mockSDKClient.getClient.mockReturnValue(undefined);
});

/** Exactly what the live CLI returns for a stale org: code 2, no stdout, real error on stderr. */
const STALE_ORG_RESULT: CommandResult = {
    code: 2,
    stdout: '',
    stderr:
        '- Getting Projects...\n' +
        ' ›   Error: [CoreConsoleAPISDK:ERROR_GET_PROJECTS_BY_ORG_ID] 500 - Internal Server Error\n' +
        ' ›   ({"messages":[{"template":"ERR_MSG_TRANSIENT"}]})\n',
    duration: 0,
};

describe('a CLI that failed', () => {
    it('reports the CLI error, not a parse error', async () => {
        mocks.mockCommandExecutor.execute.mockResolvedValue(STALE_ORG_RESULT);

        await expect(mocks.service.getProjects()).rejects.toThrow(
            /Internal Server Error|ERR_MSG_TRANSIENT/,
        );
    });

    it('does NOT claim the response format was invalid', async () => {
        // The specific lie. It sent two engineers into a decompiled bundle looking
        // for a parser bug that does not exist.
        mocks.mockCommandExecutor.execute.mockResolvedValue(STALE_ORG_RESULT);

        await expect(mocks.service.getProjects()).rejects.not.toThrow(
            /Invalid projects response format/,
        );
    });

    it('keeps the typed ORG_MISMATCH path for a 403', async () => {
        // Already handled and in-app recoverable — the fix must not swallow it into
        // the generic CLI error.
        mocks.mockCommandExecutor.execute.mockResolvedValue({
            code: 2,
            stdout: '',
            stderr: ' ›   Error: 403 - Forbidden',
            duration: 0,
        });

        await expect(mocks.service.getProjects()).rejects.toThrow(/organization/i);
    });

    it('keeps the AUTH_EXPIRED path for a 401', async () => {
        mocks.mockCommandExecutor.execute.mockResolvedValue({
            code: 2,
            stdout: '',
            stderr: ' ›   Error: 401 - Unauthorized',
            duration: 0,
        });

        await expect(mocks.service.getProjects()).rejects.toThrow(/AUTH_EXPIRED/);
    });
});

describe('stderr that is only NOISE is not an error', () => {
    it('does not report an update warning as the failure', async () => {
        // Issue #63's real logs: exit 2, TRUNCATED stdout, and stderr carrying
        // nothing but aio's update warnings. Treating the first stderr line as the
        // cause would report "Failed to get projects: Warning: @adobe/aio-cli update
        // available…" — which is worse than the generic message, because it names an
        // innocent bystander as the culprit.
        mocks.mockCommandExecutor.execute.mockResolvedValue({
            code: 2,
            stdout: '[{"id":"p1","name":"demo","tit',
            stderr:
                ' ›   Warning: @adobe/aio-cli update available from 10.3.4 to 11.1.2.\n' +
                ' ›   Run npm install -g @adobe/aio-cli to update.\n',
            duration: 0,
        });

        await expect(mocks.service.getProjects()).rejects.not.toThrow(/update available/);
    });
});

describe('what must keep working', () => {
    it('still parses JSON on stdout with exit 0', async () => {
        mocks.mockCommandExecutor.execute.mockResolvedValue({
            code: 0,
            stdout: JSON.stringify([{ id: 'p1', name: 'demo', title: 'Demo' }]),
            stderr: '',
            duration: 0,
        });

        const projects = await mocks.service.getProjects();

        expect(projects).toHaveLength(1);
    });

    it('still parses JSON on STDERR with exit 2 — the reason code 2 is allowed', async () => {
        // The case the whitelist exists for. A fix that rejects code 2 outright
        // would break this, which is why the fix targets the MESSAGE instead.
        mocks.mockCommandExecutor.execute.mockResolvedValue({
            code: 2,
            stdout: '',
            stderr: JSON.stringify([{ id: 'p1', name: 'demo', title: 'Demo' }]),
            duration: 0,
        });

        const projects = await mocks.service.getProjects();

        expect(projects).toHaveLength(1);
    });

    it('still returns [] when the org genuinely has no projects', async () => {
        mocks.mockCommandExecutor.execute.mockResolvedValue({
            code: 1,
            stdout: '',
            stderr: 'This organization does not have any projects',
            duration: 0,
        });

        await expect(mocks.service.getProjects()).resolves.toEqual([]);
    });
});
