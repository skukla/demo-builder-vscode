/**
 * exactProgress: percentages the tool itself prints become the progress.
 */

import { executeExact } from '@/core/utils/progressUnifier/exactProgress';
import type { ExecutionContext } from '@/core/utils/progressUnifier/types';
import { createProgressTestHarness } from '../../../helpers/progressUnifierTestHelpers';
import { createMockLogger, createMockStep, createProgressCollector } from './testUtils';

const context: ExecutionContext = { command: 'fnm install 24', stepIndex: 1, totalSteps: 4, stepName: 'Node' };

describe('executeExact', () => {
    const collect = createProgressCollector();
    let logger: ReturnType<typeof createMockLogger>;

    beforeEach(() => {
        logger = createMockLogger();
    });

    function start(parser?: 'fnm', continueOnError?: boolean) {
        const harness = createProgressTestHarness(logger);
        const process = harness.createMockProcess();
        harness.mocks.spawn.mockImplementation(() => process);
        const step = { ...createMockStep('Node', 'Installing', 'exact', context.command), progressParser: parser, continueOnError };
        const { onProgress, progressUpdates } = collect();
        const run = executeExact(harness.reporterDeps, step, context, onProgress);
        return { harness, process, run, progressUpdates };
    }

    const settle = () => new Promise((resolve) => setImmediate(resolve));

    it('spawns the context command through the deps', () => {
        const { harness } = start();

        expect(harness.mocks.spawn).toHaveBeenCalledWith(context.command, [], {});
    });

    describe('the fnm parser', () => {
        it('reports a percentage line as determinate progress inside the step', async () => {
            const { process, run, progressUpdates } = start('fnm');

            process.triggerStdout('Downloading 50%');
            await settle();
            await process.triggerClose(0);
            await run;

            expect(progressUpdates).toStrictEqual([
                {
                    overall: { percent: 38, currentStep: 2, totalSteps: 4, stepName: 'Node' },
                    command: { type: 'determinate', percent: 50, detail: 'Downloading 50%', confidence: 'exact' },
                },
            ]);
        });

        it('reports a non-percentage line as indeterminate at the step midpoint', async () => {
            const { process, run, progressUpdates } = start('fnm');

            process.triggerStdout('Extracting archive');
            await settle();
            await process.triggerClose(0);
            await run;

            expect(progressUpdates).toStrictEqual([
                {
                    overall: { percent: 38, currentStep: 2, totalSteps: 4, stepName: 'Node' },
                    command: { type: 'indeterminate', detail: 'Extracting archive', confidence: 'exact' },
                },
            ]);
        });

        it('reports a repeated line once and ignores blank output', async () => {
            const { process, run, progressUpdates } = start('fnm');

            process.triggerStdout('Downloading 50%');
            await settle();
            process.triggerStdout('Downloading 50%');
            await settle();
            process.triggerStdout('   \n');
            await settle();
            process.triggerStdout('Extracting');
            await settle();
            process.triggerStdout('Extracting');
            await settle();
            await process.triggerClose(0);
            await run;

            expect(progressUpdates.map((u) => u.command?.detail)).toStrictEqual(['Downloading 50%', 'Extracting']);
        });

        it('cuts a long line to 100 characters of detail', async () => {
            const { process, run, progressUpdates } = start('fnm');

            process.triggerStdout(`10% ${'x'.repeat(200)}`);
            await settle();
            await process.triggerClose(0);
            await run;

            expect(progressUpdates[0].command?.detail).toHaveLength(100);
        });
    });

    describe('the generic parser', () => {
        it('cuts a long line to 100 characters of detail', async () => {
            const { process, run, progressUpdates } = start();

            process.triggerStdout(`10% ${'x'.repeat(200)}`);
            await settle();
            await process.triggerClose(0);
            await run;

            expect(progressUpdates[0].command?.detail).toHaveLength(100);
        });

        it('reports a percentage line and says nothing about lines without one', async () => {
            const { process, run, progressUpdates } = start();

            process.triggerStdout('Fetching');
            await settle();
            process.triggerStdout('  75% done\n');
            await settle();
            process.triggerStdout('75% done');
            await settle();
            await process.triggerClose(0);
            await run;

            expect(progressUpdates).toStrictEqual([
                {
                    overall: { percent: 44, currentStep: 2, totalSteps: 4, stepName: 'Node' },
                    command: { type: 'determinate', percent: 75, detail: '75% done', confidence: 'exact' },
                },
            ]);
        });
    });

    it('traces stdout and stderr through the logger', async () => {
        const { process, run } = start();

        process.triggerStdout('out');
        process.triggerStderr('err');
        await settle();
        await process.triggerClose(0);
        await run;

        expect(logger.trace).toHaveBeenCalledTimes(2);
    });

    it('rejects with the exit code and command when the command fails', async () => {
        const { process, run } = start();
        const outcome = run.then(() => 'resolved', (e: Error) => e.message);

        await process.triggerClose(2);

        expect(await outcome).toBe('Command failed with code 2: fnm install 24');
    });

    it('resolves on a failure when the step continues on error', async () => {
        const { process, run } = start(undefined, true);

        await process.triggerClose(2);

        await expect(run).resolves.toBeUndefined();
    });
});
