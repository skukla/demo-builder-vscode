/**
 * adobeMcpUpdateCore.applyAdobeMcpUpdate — the ONE shared Adobe-MCP update core.
 *
 * Both the QuickPick executor (`performAdobeMcpUpdates`) and the headless
 * apply service (`applyAdobeMcp`) delegate here. The sequence under test:
 * npm update in the ISOLATED tools dir → regenerate the AI bundle →
 * best-effort hash persist when the regenerate throws → WHY log →
 * freshness-stamp save. This logic previously lived duplicated (~40 lines)
 * in both callers and drifted twice.
 */

import { applyAdobeMcpUpdate } from '@/features/updates/services/adobeMcpUpdateCore';
import { generateAIContextFiles } from '@/features/project-creation/services/aiBundle/aiBundleService';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';

const executeMock = jest.fn();

jest.mock('vscode', () => ({ workspace: { getConfiguration: jest.fn() } }), { virtual: true });
/**
 * CONVERTED 2026-08-28 (ADR-015): the executor arrives in the context, so this
 * suite no longer mocks the service registry.
 */
const executor = createMockCommandExecutor({ execute: executeMock });
jest.mock('@/features/project-creation/services/aiBundle/aiBundleService', () => ({
    generateAIContextFiles: jest.fn(),
}));

jest.mock('@/features/project-creation/services/aiBundle/aiDefaultsInstaller', () => ({
    // The MCP packages live in a per-project ISOLATED tools dir, never the
    // storefront's node_modules — this resolver is the single source of truth.
    resolveMcpToolsDir: (projectPath: string) => `${projectPath}/.demo-builder-mcp`,
}));

const generateMock = generateAIContextFiles as jest.Mock;

const PKG = '@adobe-commerce/commerce-extensibility-tools';
const project = { name: 'demo', path: '/p/demo' } as never;

function makeCtx() {
    return {
        extensionPath: '/ext',
        stateManager: { saveProjectConfigOnly: jest.fn(async () => undefined) },
        commandManager: executor,
        logger: createMockLogger(),
    };
}
type Ctx = ReturnType<typeof makeCtx>;

describe('applyAdobeMcpUpdate', () => {
    let ctx: Ctx;

    beforeEach(() => {
        jest.clearAllMocks();
        executeMock.mockReset();
        generateMock.mockReset();
        executeMock.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
        generateMock.mockResolvedValue({ report: { skipped: [] } });
        ctx = makeCtx();
    });

    it('runs npm update in the isolated MCP tools dir', async () => {
        await applyAdobeMcpUpdate(project, PKG, '2.0.0', ctx);

        expect(executeMock).toHaveBeenCalledWith(
            `npm update ${PKG} --no-fund`,
            expect.objectContaining({
                cwd: '/p/demo/.demo-builder-mcp',
                enhancePath: true,
            })
        );
    });

    it('throws with the npm output when the update exits non-zero (no regenerate)', async () => {
        executeMock.mockResolvedValue({ code: 1, stdout: '', stderr: 'E404 not found' });

        await expect(applyAdobeMcpUpdate(project, PKG, '2.0.0', ctx)).rejects.toThrow(
            /npm update failed: E404 not found/
        );
        expect(generateMock).not.toHaveBeenCalled();
        expect(ctx.stateManager.saveProjectConfigOnly).not.toHaveBeenCalled();
    });

    it('regenerates the AI bundle and persists the freshness stamp on success', async () => {
        await applyAdobeMcpUpdate(project, PKG, '2.0.0', ctx);

        expect(generateMock).toHaveBeenCalledWith('/p/demo', project, '/ext');
        expect(ctx.stateManager.saveProjectConfigOnly).toHaveBeenCalledWith(project);
    });

    it('logs the skipped (user-edited) files in the WHY line', async () => {
        generateMock.mockResolvedValue({ report: { skipped: ['AGENTS.md'] } });

        await applyAdobeMcpUpdate(project, PKG, '2.0.0', ctx);

        const infoLines = ctx.logger.info.mock.calls.map((c) => String(c[0]));
        expect(infoLines.some((l) => l.includes('AGENTS.md'))).toBe(true);
    });

    it('persists landed hashes best-effort and rethrows when the regenerate fails', async () => {
        generateMock.mockRejectedValue(new Error('gen broke'));

        await expect(applyAdobeMcpUpdate(project, PKG, '2.0.0', ctx)).rejects.toThrow('gen broke');
        // Landed hashes must survive a partial failure (Phase-4 review).
        expect(ctx.stateManager.saveProjectConfigOnly).toHaveBeenCalledWith(project);
    });

    it('still rethrows the regenerate error when the best-effort persist also fails', async () => {
        generateMock.mockRejectedValue(new Error('gen broke'));
        ctx.stateManager.saveProjectConfigOnly.mockRejectedValue(new Error('save broke'));

        await expect(applyAdobeMcpUpdate(project, PKG, '2.0.0', ctx)).rejects.toThrow('gen broke');
    });
});
