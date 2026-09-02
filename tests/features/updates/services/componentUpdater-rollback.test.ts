/**
 * What happens when a component update FAILS.
 *
 * An update replaces a component inside someone's existing project. If it goes wrong
 * half-way, the snapshot taken beforehand is the only thing standing between the user
 * and a broken project — this repo's first stated property is that whatever can be done
 * can be undone, and this is where that is either true or not.
 *
 * The rollback path was the least-tested code measured all night: of 300 deliberate
 * breakages in this file, 44 were never reached by any test and most of them live here.
 *
 * The snapshot FILTER is the sharpest example. Two suites assert that `fs.cp` was called
 * with `filter: expect.any(Function)` — which passes for any function at all, including
 * one that copies nothing or one that copies everything. Nothing had ever called it.
 */

import {
    ComponentUpdater,
    fs,
    setupUpdater,
    type UpdaterHarness,
} from './componentUpdater.testUtils';

describe('ComponentUpdater — the snapshot and the rollback', () => {
    let h: UpdaterHarness;

    beforeEach(() => {
        h = setupUpdater();
    });

    const DOWNLOAD = 'https://github.com/test/repo/archive/v1.0.0.zip';

    /** The filter handed to `fs.cp` when the pre-update snapshot was taken. */
    function snapshotFilter(): (src: string) => boolean {
        const call = (fs.cp as unknown as jest.Mock).mock.calls[0];
        if (!call) throw new Error('No snapshot was taken — fs.cp was never called.');
        return (call[2] as { filter: (src: string) => boolean }).filter;
    }

    describe('what the snapshot copies', () => {
        beforeEach(async () => {
            await h.updater.updateComponent(h.project, 'test-component', DOWNLOAD, '1.0.0');
        });

        it('copies the component source', () => {
            const keep = snapshotFilter();

            expect(keep('/path/to/project/components/test-component/package.json')).toBe(true);
            expect(keep('/path/to/project/components/test-component/src/index.js')).toBe(true);
        });

        it('skips node_modules, which npm install can rebuild', () => {
            // Not thrift for its own sake: a dependency tree can be tens of thousands of
            // files, and copying it makes the snapshot slow enough that people skip it.
            const keep = snapshotFilter();

            expect(keep('/path/to/project/components/test-component/node_modules')).toBe(false);
            expect(
                keep('/path/to/project/components/test-component/node_modules/react/index.js')
            ).toBe(false);
        });
    });

    describe('when the update fails part-way', () => {
        /** Make the update blow up after the snapshot exists. */
        function failDuringUpdate() {
            h.executor.execute.mockRejectedValueOnce(new Error('Extraction failed'));
        }

        it('puts the snapshot back', async () => {
            failDuringUpdate();

            await expect(
                h.updater.updateComponent(h.project, 'test-component', DOWNLOAD, '1.0.0')
            ).rejects.toThrow();

            expect(fs.rename).toHaveBeenCalledWith(
                expect.stringContaining('snapshot'),
                '/path/to/project/components/test-component'
            );
        });

        it('reinstalls the dependencies it did not restore', async () => {
            // node_modules was deliberately left out of the snapshot, so restoring the
            // snapshot alone leaves the component without its dependencies.
            failDuringUpdate();

            await expect(
                h.updater.updateComponent(h.project, 'test-component', DOWNLOAD, '1.0.0')
            ).rejects.toThrow();

            const installs = h.executor.execute.mock.calls.filter(([cmd]) =>
                String(cmd).includes('npm install')
            );
            expect(installs.length).toBeGreaterThan(0);
            expect(installs.at(-1)?.[1]).toEqual(
                expect.objectContaining({ cwd: '/path/to/project/components/test-component' })
            );
        });

        it('still reports the original failure, not the rollback', async () => {
            // The user needs to know why the update failed. A rollback that swallowed
            // that would leave them with a working component and no idea what happened.
            failDuringUpdate();

            await expect(
                h.updater.updateComponent(h.project, 'test-component', DOWNLOAD, '1.0.0')
            ).rejects.toThrow();
        });

        it('does not abandon the rollback when the reinstall fails', async () => {
            // A failed reinstall is recoverable by hand; a half-rolled-back component is
            // not. The reinstall failure is a warning, not a second exception.
            failDuringUpdate();
            h.executor.execute.mockResolvedValue({
                stdout: '',
                stderr: 'npm ERR! network',
                code: 1,
                duration: 10,
            });

            await expect(
                h.updater.updateComponent(h.project, 'test-component', DOWNLOAD, '1.0.0')
            ).rejects.toThrow();

            expect(fs.rename).toHaveBeenCalled();
            expect(h.logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('reinstall dependencies')
            );
        });
    });

    it('is constructed the same way the other suites build it', () => {
        expect(h.updater).toBeInstanceOf(ComponentUpdater);
    });
});
