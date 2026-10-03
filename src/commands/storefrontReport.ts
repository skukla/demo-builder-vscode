/**
 * `Demo Builder: Storefront Report` (EDS-13f decision 7).
 *
 * The door to everything the cards leave out: where the current project's
 * storefront comes from, what Demo Builder wrote into it, and each of Demo
 * Builder's fixes on its code. Opens as a markdown document, because it is
 * read and copied, not clicked.
 *
 * When the project is built on an added demo tied to our templates and some
 * fixes fit, it then OFFERS them: a modal, default No, naming what they fix and
 * where the one commit lands. That offer is the human half of "apply our fixes
 * to a colleague's storefront, opt-in"; the agent half is `reset_project`'s
 * `applyFixes`. The reset result's notification points here.
 *
 * The computation is `readStorefrontReport` and the wording
 * `storefrontReportLines`; this file only shows them.
 *
 * @module commands/storefrontReport
 */

import * as vscode from 'vscode';
import { BaseCommand } from '@/core/base/baseCommand';
import { fixGroupsLabel } from '@/features/eds/services/patches/loadBearingPatches';
import {
    readStorefrontReport,
    storefrontReportLines,
    type StorefrontReport,
} from '@/features/eds/services/storefront/storefrontReport';
import {
    applyStorefrontFixes,
    createStorefrontReportDeps,
} from '@/features/eds/services/storefront/storefrontReportDeps';
import type { Project } from '@/types/base';

/** The modal's button; anything else (Escape, the close box) is a no. */
export const APPLY_FIXES = 'Apply fixes';

export class StorefrontReportCommand extends BaseCommand {
    public async execute(): Promise<void> {
        const project = await this.stateManager.getCurrentProject();
        if (!project) {
            await this.showWarning('No project loaded.');
            return;
        }
        const report = await this.withProgress('Reading the storefront', () =>
            readStorefrontReport(project, createStorefrontReportDeps(this.context.secrets, this.logger)),
        );
        if (!report) {
            await this.showWarning(`${project.name} has no Edge Delivery storefront to report on.`);
            return;
        }

        const document = await vscode.workspace.openTextDocument({
            content: [`# Storefront report: ${project.name}`, ...storefrontReportLines(report)].join('\n\n'),
            language: 'markdown',
        });
        await vscode.window.showTextDocument(document, { preview: true });

        if (report.offer?.length && project.demo) await this.offerFixes(project, report);
    }

    private async offerFixes(project: Project, report: StorefrontReport): Promise<void> {
        const offer = report.offer ?? [];
        const one = offer.length === 1;
        const choice = await vscode.window.showInformationMessage(
            `Apply ${offer.length} of Demo Builder's ${one ? 'fix' : 'fixes'} to this storefront?`,
            {
                modal: true,
                detail:
                    `${one ? 'It fixes' : 'They fix'}: ${fixGroupsLabel(offer)}. ` +
                    `Each changes only the code it was written for, in one commit to ` +
                    `${report.repository.owner}/${report.repository.repo}. ` +
                    "A reset puts the demo's own code back and offers them again.",
            },
            APPLY_FIXES,
        );
        if (choice !== APPLY_FIXES) return;

        const applied = await this.withProgress('Applying the fixes', () =>
            applyStorefrontFixes(project, this.context.secrets, this.logger),
        );
        if (!applied?.report.applied?.length) {
            await this.showWarning('Nothing was applied: none of the fixes fit this code any more.');
            return;
        }
        await this.showInfo(applied.lines.join(' '));
    }
}
