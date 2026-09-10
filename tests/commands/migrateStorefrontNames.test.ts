/**
 * MigrateStorefrontNamesCommand tests — scanning, confirming, authenticating
 *
 * Covers the "Demo Builder: Migrate Storefront Names" palette command —
 * the one-shot, no-reset path that heals pre-`164fd251` storefronts.
 *
 * Progress reporting and the result summary are in
 * `migrateStorefrontNames-reporting.test.ts`. The mock wall both specs need —
 * and the subject import that makes its hoisting work — is in
 * `migrateStorefrontNames.testUtils.ts`.
 */

import * as vscode from 'vscode';
import {
    ensureAuthMock,
    migrateCommand,
    migrateCommandWith,
    mismatchedProject,
    projectsOnDisk,
    migrateMock,
    registerPublishKeyMock,
    resetMigrateMocks,
} from './migrateStorefrontNames.testUtils';
import { createMockProject } from '../helpers/projectFake';

describe('MigrateStorefrontNamesCommand', () => {
    beforeEach(() => {
        resetMigrateMocks();
    });

    describe('scan phase', () => {
        it('shows an info message and does NOT prompt when no projects need migration', async () => {
            const sm = projectsOnDisk({});
            await migrateCommand(sm).execute();

            expect(migrateMock).not.toHaveBeenCalled();
            // The "nothing to do" message is shown via showInformationMessage.
            // BaseCommand.showInfo appends an 'OK' button arg.
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('No storefronts need migration'),
                'OK'
            );
        });

        it('ignores projects without an eds-storefront component instance', async () => {
            const noEds = createMockProject({ name: 'no-eds', componentInstances: {} });
            const sm = projectsOnDisk({ '/a': noEds });

            await migrateCommand(sm).execute();

            expect(migrateMock).not.toHaveBeenCalled();
        });

        it('ignores projects whose daLiveSite already matches the repo name', async () => {
            // daLiveSite === repoName → not a candidate
            const alreadyMatching = mismatchedProject('b2b', { daLiveSite: 'b2b' });
            const sm = projectsOnDisk({ '/a': alreadyMatching });

            await migrateCommand(sm).execute();

            expect(migrateMock).not.toHaveBeenCalled();
        });

        // Scanning is an inspection. `persistAfterLoad: true` would rewrite the
        // manifest of every project on disk just for opening the palette command,
        // and the component callback returning anything but an empty list would
        // reconcile instances against a catalog the scan never asked for.
        it('loads each project read-only, with no component catalog', async () => {
            const sm = projectsOnDisk({ '/a': mismatchedProject('b2b') });

            await migrateCommand(sm).execute();

            expect(sm.loadProjectFromPath).toHaveBeenCalledWith('/a', expect.any(Function), {
                persistAfterLoad: false,
            });
            const componentsCallback = (sm.loadProjectFromPath as jest.Mock).mock.calls[0][1];
            expect(componentsCallback()).toStrictEqual([]);
        });

        it('keeps scanning after a project fails to load', async () => {
            const sm = projectsOnDisk({ '/a': mismatchedProject('a-store'), '/b': mismatchedProject('b-store') });
            (sm.loadProjectFromPath as jest.Mock).mockImplementation(async (path: string) => {
                if (path === '/a') throw new Error('manifest is not JSON');
                return mismatchedProject('b-store');
            });

            await migrateCommand(sm).execute();

            expect(migrateMock).toHaveBeenCalledTimes(1);
        });

        it('skips a project path that resolves to nothing', async () => {
            const sm = projectsOnDisk({ '/a': mismatchedProject('a-store'), '/b': mismatchedProject('b-store') });
            (sm.loadProjectFromPath as jest.Mock).mockImplementation(async (path: string) =>
                path === '/a' ? null : mismatchedProject('b-store')
            );

            await migrateCommand(sm).execute();

            expect(migrateMock).toHaveBeenCalledTimes(1);
        });

        it('finds mismatched projects (daLiveSite differs from the repo half of githubRepo)', async () => {
            // daLiveSite=b2b-content vs githubRepo=skukla/b2b → repo half is "b2b" → mismatch
            const mismatched = mismatchedProject('b2b', {
                daLiveSite: 'b2b-content',
                githubRepo: 'skukla/b2b',
            });
            const sm = projectsOnDisk({ '/a': mismatched });

            await migrateCommand(sm).execute();

            expect(migrateMock).toHaveBeenCalledTimes(1);
            const [ctx] = migrateMock.mock.calls[0];
            expect(ctx.daLiveSite).toBe('b2b-content');
            expect(ctx.repoName).toBe('b2b');
            expect(ctx.repoOwner).toBe('skukla');
        });
    });

    describe('confirmation', () => {
        it('does NOT run migrations when the user cancels', async () => {
            const mismatched = mismatchedProject('b2b');
            const sm = projectsOnDisk({ '/a': mismatched });

            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValueOnce('Cancel');

            await migrateCommand(sm).execute();

            expect(migrateMock).not.toHaveBeenCalled();
        });

        it('does NOT run migrations when the user dismisses the dialog (returns undefined)', async () => {
            const mismatched = mismatchedProject('b2b');
            const sm = projectsOnDisk({ '/a': mismatched });

            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValueOnce(undefined);

            await migrateCommand(sm).execute();

            expect(migrateMock).not.toHaveBeenCalled();
        });

        it('shows every candidate in the confirmation detail', async () => {
            const a = mismatchedProject('a-store');
            const b = mismatchedProject('b-store');
            const sm = projectsOnDisk({ '/a': a, '/b': b });

            await migrateCommand(sm).execute();

            // The confirmation goes out as a modal info message; the
            // `detail` field holds the per-project list.
            const callArgs = (vscode.window.showInformationMessage as jest.Mock).mock.calls[0];
            const opts = callArgs[1];
            expect(opts.modal).toBe(true);
            expect(opts.detail).toContain('a-store');
            expect(opts.detail).toContain('b-store');
        });
    });

    describe('authentication', () => {
        it('aborts when DA.live auth is not granted (user cancelled)', async () => {
            const mismatched = mismatchedProject('b2b');
            const sm = projectsOnDisk({ '/a': mismatched });

            ensureAuthMock.mockResolvedValueOnce({ authenticated: false, cancelled: true });

            await migrateCommand(sm).execute();

            expect(migrateMock).not.toHaveBeenCalled();
        });

        it('aborts when DA.live auth fails outright (error response)', async () => {
            const mismatched = mismatchedProject('b2b');
            const sm = projectsOnDisk({ '/a': mismatched });

            ensureAuthMock.mockResolvedValueOnce({
                authenticated: false,
                error: 'token revoked',
            });

            await migrateCommand(sm).execute();

            expect(migrateMock).not.toHaveBeenCalled();
            // The reason the SDK gave, not a generic stand-in — it is the only
            // thing telling the SC whether to sign in again or fix something.
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('token revoked'),
                'OK'
            );
        });

        it('falls back to a generic reason when the failure carries none', async () => {
            const sm = projectsOnDisk({ '/a': mismatchedProject('b2b') });

            ensureAuthMock.mockResolvedValueOnce({ authenticated: false });

            await migrateCommand(sm).execute();

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('authentication failed'),
                'OK'
            );
        });

        // ensureDaLiveAuth reads exactly two fields off what it is handed. An
        // empty object typechecks at the call site and fails at run time.
        it('hands the extension context and logger to the DA.live sign-in', async () => {
            const sm = projectsOnDisk({ '/a': mismatchedProject('b2b') });
            const { command, context } = migrateCommandWith(sm);

            await command.execute();

            expect(ensureAuthMock).toHaveBeenCalledWith(
                { context, logger: expect.objectContaining({ info: expect.any(Function) }) },
                '[MigrateStorefrontNames]'
            );
        });
    });

    describe('happy path', () => {
        it('migrates every confirmed project and persists each manifest', async () => {
            const a = mismatchedProject('a-store');
            const b = mismatchedProject('b-store');
            const c = mismatchedProject('c-store');
            const sm = projectsOnDisk({ '/a': a, '/b': b, '/c': c });

            await migrateCommand(sm).execute();

            expect(migrateMock).toHaveBeenCalledTimes(3);
            expect(sm.saveProject).toHaveBeenCalledTimes(3);
        });

        it('reports success when every migration succeeds', async () => {
            const a = mismatchedProject('a-store');
            const sm = projectsOnDisk({ '/a': a });

            await migrateCommand(sm).execute();

            // First call = confirmation; second = success summary.
            const calls = (vscode.window.showInformationMessage as jest.Mock).mock.calls;
            const summary = calls.at(-1)?.[0] ?? '';
            expect(summary).toMatch(/Migrated 1 storefront/);
        });

        // The migration re-registers the site config, and `apiKeys` lives inside
        // that document — so the write destroys the site's publish key. The reset
        // pipeline gets away with not repairing it here because its own config
        // step follows and re-mints; this command has no such follow-up, so it
        // must repair what it broke or leave runtime PDP self-heal dead.
        it('re-mints the publish key that the migration write destroyed', async () => {
            const sm = projectsOnDisk({ '/a': mismatchedProject('a-store') });

            await migrateCommand(sm).execute();

            expect(registerPublishKeyMock).toHaveBeenCalledTimes(1);
            expect(registerPublishKeyMock).toHaveBeenCalledWith(
                expect.anything(),
                { owner: 'skukla', repo: 'a-store' },
                expect.anything()
            );
        });

        it('does NOT mint a key for a project whose migration failed', async () => {
            migrateMock.mockResolvedValue({
                skipped: false,
                migrated: false,
                error: 'Helix re-registration failed',
            });
            const sm = projectsOnDisk({ '/a': mismatchedProject('a-store') });

            await migrateCommand(sm).execute();

            expect(registerPublishKeyMock).not.toHaveBeenCalled();
        });
    });

    describe('partial failure', () => {
        it('continues to the next project when one migration fails', async () => {
            const a = mismatchedProject('a-store');
            const b = mismatchedProject('b-store');
            const sm = projectsOnDisk({ '/a': a, '/b': b });

            // First call fails, second succeeds.
            migrateMock
                .mockResolvedValueOnce({
                    skipped: false,
                    migrated: false,
                    error: 'DA copy timeout',
                })
                .mockResolvedValueOnce({ skipped: false, migrated: true });

            await migrateCommand(sm).execute();

            expect(migrateMock).toHaveBeenCalledTimes(2);
            // Only the successful one persists its manifest.
            expect(sm.saveProject).toHaveBeenCalledTimes(1);
        });

        it('surfaces a warning summary when any project fails', async () => {
            const a = mismatchedProject('a-store');
            const sm = projectsOnDisk({ '/a': a });

            migrateMock.mockResolvedValueOnce({
                skipped: false,
                migrated: false,
                error: 'DA copy timeout',
            });

            await migrateCommand(sm).execute();

            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                expect.stringContaining('failed'),
                'OK'
            );
        });

        it('catches thrown errors and reports them per-project (not as a crash)', async () => {
            const a = mismatchedProject('a-store');
            const b = mismatchedProject('b-store');
            const sm = projectsOnDisk({ '/a': a, '/b': b });

            migrateMock
                .mockRejectedValueOnce(new Error('network blip'))
                .mockResolvedValueOnce({ skipped: false, migrated: true });

            await migrateCommand(sm).execute();

            // Both attempts happened; only the success persisted.
            expect(migrateMock).toHaveBeenCalledTimes(2);
            expect(sm.saveProject).toHaveBeenCalledTimes(1);
            expect(vscode.window.showWarningMessage).toHaveBeenCalled();
        });
    });
});
