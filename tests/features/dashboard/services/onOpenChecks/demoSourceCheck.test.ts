/**
 * demo-source on-open check: ok for a project with no added demo, the check's
 * own sentence as a warning when the repository or the content site does not
 * answer, and the reader/saver handed in lazily as the org check's are.
 */

jest.mock('@/features/eds/services/reset/demoSourceCheck', () => ({
    checkDemoSource: jest.fn(),
}));

import { createDemoSourceCheck } from '@/features/dashboard/services/onOpenChecks/demoSourceCheck';
import type { OnOpenCheckContext } from '@/features/dashboard/services/onOpenChecks/types';
import { checkDemoSource } from '@/features/eds/services/reset/demoSourceCheck';
import { CHECK_IDS } from '@/types/messages';
import { makeAddedDemo } from '../../../../helpers/demoPackageFixtures';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockProject } from '../../../../helpers/projectFake';

const mockCheck = checkDemoSource as jest.MockedFunction<typeof checkDemoSource>;
const UNREACHABLE = "The Isle5 by Jen demo's repository can't be reached. Reset and updates are unavailable until it is.";

function ctx(withDemo: boolean): OnOpenCheckContext {
    return {
        project: createMockProject({ path: '/p', ...(withDemo ? { demo: makeAddedDemo() } : {}) }),
        logger: createMockLogger(),
        post: jest.fn(),
    };
}

const repoOperations = { getRepository: jest.fn() };
const stateManager = { saveProject: jest.fn() };
const fetchImpl = jest.fn() as unknown as typeof fetch;

function build() {
    return createDemoSourceCheck({
        repoOperations: () => repoOperations,
        stateManager: () => stateManager,
        fetchImpl,
    });
}

beforeEach(() => jest.clearAllMocks());

it('is the demo-source check: background, re-runnable, for every project kind', () => {
    const check = build();
    expect(check.id).toBe(CHECK_IDS.DEMO_SOURCE);
    expect(check.mode).toBe('background');
    expect(check.reRunnable).toBe(true);
    expect(check.edsOnly).toBeFalsy();
});

it('is ok, without reading anything, for a project not built on an added demo', async () => {
    const outcome = await build().run(ctx(false));
    expect(outcome).toEqual({ status: 'ok' });
    expect(mockCheck).not.toHaveBeenCalled();
});

it('hands the reader, the saver and the fetch to the shared check', async () => {
    mockCheck.mockResolvedValue({ reachable: true, message: '', contentReachable: true });
    const context = ctx(true);

    const outcome = await build().run(context);

    expect(mockCheck).toHaveBeenCalledWith(
        context.project,
        repoOperations,
        { logger: context.logger, stateManager },
        fetchImpl,
    );
    expect(outcome).toEqual({
        status: 'ok',
        data: { demoName: 'Isle5 by Jen', unreachable: false, contentUnreachable: false },
    });
});

it("warns with the check's sentence when the repository does not answer", async () => {
    mockCheck.mockResolvedValue({ reachable: false, message: UNREACHABLE, contentReachable: false });

    const outcome = await build().run(ctx(true));

    expect(outcome).toEqual({
        status: 'warning',
        message: UNREACHABLE,
        data: { demoName: 'Isle5 by Jen', unreachable: true, contentUnreachable: true },
    });
});

it("warns with the content site's own line when only the pages are gone", async () => {
    mockCheck.mockResolvedValue({
        reachable: true,
        message: '',
        contentReachable: false,
        contentMessage: "The Isle5 by Jen demo's pages can't be reached right now.",
    });

    const outcome = await build().run(ctx(true));

    expect(outcome).toMatchObject({
        status: 'warning',
        message: "The Isle5 by Jen demo's pages can't be reached right now.",
        data: { unreachable: false, contentUnreachable: true },
    });
});

it('skips the save, rather than failing, when no state manager is available yet', async () => {
    mockCheck.mockResolvedValue({ reachable: true, message: '', contentReachable: true });
    const check = createDemoSourceCheck({ repoOperations: () => repoOperations, stateManager: () => null });

    await check.run(ctx(true));

    const handed = mockCheck.mock.calls[0][2];
    await expect(handed.stateManager.saveProject(createMockProject())).resolves.toBeUndefined();
});
