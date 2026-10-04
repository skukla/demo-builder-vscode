/**
 * `Demo Builder: Storefront Report` (EDS-13f). The report is computed and
 * worded elsewhere (`storefrontReport.ts`, tested there); this pins what the
 * command does with it: show it, and offer the fixes only where the report
 * found an offer on an added demo, default No, writing only on a yes.
 */

jest.mock('@/features/eds/services/storefront/storefrontReportDeps', () => ({
    createStorefrontReportDeps: jest.fn(() => ({ marker: 'deps' })),
    applyStorefrontFixes: jest.fn(),
    readTemplateCatchUp: jest.fn(),
    catchUpWithTemplate: jest.fn(),
}));
jest.mock('@/features/eds/services/storefront/storefrontReport', () => ({
    readStorefrontReport: jest.fn(),
    storefrontReportLines: jest.fn(() => ['## Where this storefront comes from', 'Built on X.']),
}));

import * as vscode from 'vscode';
import { APPLY_FIXES, CATCH_UP, StorefrontReportCommand } from '@/commands/storefrontReport';
import type { StateManager } from '@/core/state/stateManager';
import { readStorefrontReport, type StorefrontReport } from '@/features/eds/services/storefront/storefrontReport';
import {
    applyStorefrontFixes,
    catchUpWithTemplate,
    readTemplateCatchUp,
} from '@/features/eds/services/storefront/storefrontReportDeps';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';
import { makeAddedDemo } from '../helpers/demoPackageFixtures';
import { createMockExtensionContext } from '../helpers/extensionContextFake';
import { createMockLogger } from '../helpers/loggerFake';
import { createMockProject } from '../helpers/projectFake';
import { createMockStateManager } from '../helpers/stateManagerFake';

const workspace = vscode.workspace as unknown as { openTextDocument?: jest.Mock };
workspace.openTextDocument = workspace.openTextDocument ?? jest.fn();
const windowApi = vscode.window as unknown as { showTextDocument?: jest.Mock };
windowApi.showTextDocument = windowApi.showTextDocument ?? jest.fn();

const mockRead = readStorefrontReport as jest.Mock;
const mockApply = applyStorefrontFixes as jest.Mock;
const mockReadCatchUp = readTemplateCatchUp as jest.Mock;
const mockCatchUp = catchUpWithTemplate as jest.Mock;

const REPORT: StorefrontReport = {
    repository: { owner: 'steve', repo: 'aistore-copy' },
    boilerplate: { status: 'read', value: { name: '@adobe/aem-boilerplate-commerce', version: '4.0.1' } },
    origin: { kind: 'added', lineage: { status: 'absent' } },
    written: { smart404: 'present', fstab: 'present', config: 'present', description: 'absent' },
    fixes: [],
    offer: ['pdp-empty-data-redirect', 'header-nav-tools-defensive'],
};

function command(project: Project | undefined) {
    const context = createMockExtensionContext();
    const stateManager = createMockStateManager({ getCurrentProject: jest.fn().mockResolvedValue(project) }) as unknown as StateManager;
    return { cmd: new StorefrontReportCommand(context, stateManager, createMockLogger() as unknown as Logger), context };
}

const COLLEAGUE = createMockProject({ name: 'aistore-copy', demo: makeAddedDemo() });

beforeEach(() => {
    jest.clearAllMocks();
    workspace.openTextDocument!.mockResolvedValue({ uri: 'untitled:1' });
    mockRead.mockResolvedValue(REPORT);
});

describe('StorefrontReportCommand', () => {
    it("opens the report as a document titled with the project's name", async () => {
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);

        await command(COLLEAGUE).cmd.execute();

        expect(workspace.openTextDocument).toHaveBeenCalledWith({
            content: '# Storefront report: aistore-copy\n\n## Where this storefront comes from\n\nBuilt on X.',
            language: 'markdown',
        });
        expect(windowApi.showTextDocument).toHaveBeenCalledWith({ uri: 'untitled:1' }, { preview: true });
    });

    it('offers the fixes in a modal naming what they fix and where the commit lands, and writes nothing on no', async () => {
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);

        await command(COLLEAGUE).cmd.execute();

        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            "Apply 2 of Demo Builder's fixes to this storefront?",
            {
                modal: true,
                detail:
                    'They fix: empty product pages; header and account sidebar robustness. Each changes only the code it ' +
                    "was written for, in one commit to steve/aistore-copy. A reset puts the demo's own code back and offers them again.",
            },
            APPLY_FIXES,
        );
        expect(mockApply).not.toHaveBeenCalled();
    });

    it('applies them on yes, for this project with its credential', async () => {
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValueOnce(APPLY_FIXES);
        mockApply.mockResolvedValue({ report: { applied: ['pdp-empty-data-redirect'], caveats: [] }, lines: ['Applied.'] });
        const { cmd, context } = command(COLLEAGUE);

        await cmd.execute();

        expect(mockApply).toHaveBeenCalledWith(COLLEAGUE, context.secrets, expect.anything());
        expect(vscode.window.showInformationMessage).toHaveBeenLastCalledWith('Applied.', 'OK');
    });

    it('offers nothing for a shipped brand, or when nothing fits', async () => {
        await command(createMockProject({ name: 'bodea' })).cmd.execute();
        mockRead.mockResolvedValue({ ...REPORT, offer: undefined });
        await command(COLLEAGUE).cmd.execute();

        expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
    });

    it('says so when there is no project, or no storefront to report on', async () => {
        await command(undefined).cmd.execute();
        mockRead.mockResolvedValue(undefined);
        await command(COLLEAGUE).cmd.execute();

        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('No project loaded.', 'OK');
        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            'aistore-copy has no Edge Delivery storefront to report on.',
            'OK',
        );
        expect(workspace.openTextDocument).not.toHaveBeenCalled();
    });
});

describe('StorefrontReportCommand — bring the code up to date with the template (forks only)', () => {
    const CATCH = {
        repository: { owner: 'steve', repo: 'aistore-copy' },
        branch: 'main',
        template: { owner: 'adobe-commerce', repo: 'boilerplate-b2b-template' },
        behindBy: 3,
    };
    const SHIPPED = createMockProject({ name: 'bodea' });

    beforeEach(() => {
        mockRead.mockResolvedValue({ ...REPORT, offer: undefined });
    });

    it('asks only when the report found a fork of our template that is behind, reading with this project and credential', async () => {
        mockReadCatchUp.mockResolvedValue(undefined);
        const { cmd, context } = command(SHIPPED);

        await cmd.execute();

        expect(mockReadCatchUp).toHaveBeenCalledWith(REPORT.repository, context.secrets, expect.anything());
        expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        expect(mockCatchUp).not.toHaveBeenCalled();
    });

    it('names the fork, the template, how far behind, and what a conflict does; writes nothing on no', async () => {
        mockReadCatchUp.mockResolvedValue(CATCH);
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);

        await command(SHIPPED).cmd.execute();

        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            'Bring the code up to date with the template?',
            {
                modal: true,
                detail:
                    'steve/aistore-copy is a fork of adobe-commerce/boilerplate-b2b-template and is 3 commits behind it. ' +
                    "GitHub merges the template's changes into main; your own commits stay. " +
                    'If they conflict, nothing is changed.',
            },
            CATCH_UP,
        );
        expect(mockCatchUp).not.toHaveBeenCalled();
    });

    it('merges on yes, for that fork with this credential, and says it is done', async () => {
        mockReadCatchUp.mockResolvedValue(CATCH);
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValueOnce(CATCH_UP);
        mockCatchUp.mockResolvedValue({ success: true, message: 'merged' });
        const { cmd, context } = command(SHIPPED);

        await cmd.execute();

        expect(mockCatchUp).toHaveBeenCalledWith(CATCH, context.secrets, expect.anything());
        expect(vscode.window.showInformationMessage).toHaveBeenLastCalledWith(
            'steve/aistore-copy is up to date with adobe-commerce/boilerplate-b2b-template.',
            'OK',
        );
    });

    it('says nothing changed when the merge conflicts', async () => {
        mockReadCatchUp.mockResolvedValue(CATCH);
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValueOnce(CATCH_UP);
        mockCatchUp.mockResolvedValue({ success: false, conflict: true, message: 'diverged' });

        await command(SHIPPED).cmd.execute();

        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            "Nothing was changed: the template's changes conflict with this storefront's own. " +
                'Merge them on GitHub, or leave the code as it is.',
            'OK',
        );
    });

    it('reports a failed merge rather than throwing', async () => {
        mockReadCatchUp.mockResolvedValue(CATCH);
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValueOnce(CATCH_UP);
        mockCatchUp.mockRejectedValue(new Error('GitHub API permission denied.'));

        await command(SHIPPED).cmd.execute();

        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            'Could not bring the code up to date: GitHub API permission denied.',
            'OK',
        );
    });
});
