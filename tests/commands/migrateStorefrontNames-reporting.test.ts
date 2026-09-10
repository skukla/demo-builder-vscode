/**
 * MigrateStorefrontNamesCommand tests — what the SC is told while it runs and
 * when it is done
 *
 * Split from `migrateStorefrontNames.test.ts`. This half is about the progress
 * notification, the lost-grants warning, and the summary counts — the parts an
 * SC reads to decide whether anything needs doing by hand. The mock wall and
 * the subject import live in `migrateStorefrontNames.testUtils.ts`.
 */

import * as vscode from 'vscode';
import {
    migrateCommand,
    mismatchedProject,
    projectsOnDisk,
    migrateMock,
    progressReports,
    resetMigrateMocks,
} from './migrateStorefrontNames.testUtils';

/** The text of the last `showInformationMessage` — the summary, not the prompt. */
function lastInfoMessage(): string {
    const calls = (vscode.window.showInformationMessage as jest.Mock).mock.calls;
    return String(calls.at(-1)?.[0] ?? '');
}

/** The text of the confirmation prompt — always the FIRST info message. */
function confirmationMessage(): string {
    return String((vscode.window.showInformationMessage as jest.Mock).mock.calls[0]?.[0] ?? '');
}

function warningMessages(): string[] {
    return (vscode.window.showWarningMessage as jest.Mock).mock.calls.map((c) => String(c[0]));
}

beforeEach(() => {
    resetMigrateMocks();
});

describe('MigrateStorefrontNamesCommand — the confirmation prompt', () => {
    it('counts one storefront in the singular', async () => {
        await migrateCommand(projectsOnDisk({ '/a': mismatchedProject('a-store') })).execute();

        expect(confirmationMessage()).toContain('Found 1 storefront that need');
    });

    it('counts several in the plural', async () => {
        const sm = projectsOnDisk({
            '/a': mismatchedProject('a-store'),
            '/b': mismatchedProject('b-store'),
        });

        await migrateCommand(sm).execute();

        expect(confirmationMessage()).toContain('Found 2 storefronts that need');
    });
});

describe('MigrateStorefrontNamesCommand — the progress notification', () => {
    // Not cancellable, and deliberately: the migration copies DA content and
    // re-points Helix, so a half-done one is worse than a slow one.
    it('runs inside a non-cancellable notification', async () => {
        await migrateCommand(projectsOnDisk({ '/a': mismatchedProject('a-store') })).execute();

        expect(vscode.window.withProgress).toHaveBeenCalledWith(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Demo Builder: Migrating storefront names',
                cancellable: false,
            },
            expect.any(Function)
        );
    });

    // The increment is a SHARE of the bar, so it divides by the count; the
    // message is a 1-based position, so it adds to the index.
    it('reports an equal share of the bar and a 1-based position for each project', async () => {
        const sm = projectsOnDisk({
            '/a': mismatchedProject('a-store'),
            '/b': mismatchedProject('b-store'),
        });

        await migrateCommand(sm).execute();

        expect(progressReports).toStrictEqual([
            { increment: 50, message: 'a-store (1/2)…' },
            { increment: 50, message: 'b-store (2/2)…' },
        ]);
    });
});

describe('MigrateStorefrontNamesCommand — lost site grants', () => {
    // The migration re-registers the site config, which REPLACES its role list.
    // These are the pre-164fd251 storefronts, the ones most likely to have
    // several admins, and nothing in the app can restore them.
    it('warns about admins the re-registration dropped', async () => {
        migrateMock.mockResolvedValue({
            skipped: false,
            migrated: true,
            lostGrants: ['someone.else@example.com'],
        });

        await migrateCommand(projectsOnDisk({ '/a': mismatchedProject('a-store') })).execute();

        expect(warningMessages().join('\n')).toContain('someone.else@example.com');
    });

    it('says nothing when the re-registration dropped none', async () => {
        migrateMock.mockResolvedValue({ skipped: false, migrated: true, lostGrants: [] });

        await migrateCommand(projectsOnDisk({ '/a': mismatchedProject('a-store') })).execute();

        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    });
});

describe('MigrateStorefrontNamesCommand — the summary', () => {
    it('counts one migrated storefront in the singular', async () => {
        await migrateCommand(projectsOnDisk({ '/a': mismatchedProject('a-store') })).execute();

        expect(lastInfoMessage()).toContain('Migrated 1 storefront successfully.');
    });

    it('counts several migrated storefronts in the plural', async () => {
        const sm = projectsOnDisk({
            '/a': mismatchedProject('a-store'),
            '/b': mismatchedProject('b-store'),
        });

        await migrateCommand(sm).execute();

        expect(lastInfoMessage()).toContain('Migrated 2 storefronts successfully.');
    });

    // The count that matters is how many SUCCEEDED, not how many were tried —
    // "Migrated 1 of 1. 1 failed" is the sentence that makes an SC stop reading.
    it('counts only the successes against the total when some failed', async () => {
        migrateMock
            .mockResolvedValueOnce({ skipped: false, migrated: false, error: 'DA copy timeout' })
            .mockResolvedValueOnce({ skipped: false, migrated: true });
        const sm = projectsOnDisk({
            '/a': mismatchedProject('a-store'),
            '/b': mismatchedProject('b-store'),
        });

        await migrateCommand(sm).execute();

        expect(warningMessages().join('\n')).toContain('Migrated 1 of 2 storefronts.');
    });
});
