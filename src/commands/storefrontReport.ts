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
 * When the project's own repository is a FORK of one of Demo Builder's templates
 * and is behind it, it then offers "Bring the code up to date with the template"
 * (step 05, owner 2026-10-04: fork sync only for forks): GitHub's merge-upstream,
 * the call Check for Updates makes, default No. A generated repository is never
 * offered it (`templateCatchUp.ts` says why).
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
    catchUpWithTemplate,
    createStorefrontReportDeps,
    readTemplateCatchUp,
} from '@/features/eds/services/storefront/storefrontReportDeps';
import type { TemplateCatchUp } from '@/features/eds/services/storefront/templateCatchUp';
import type { Project } from '@/types/base';

/** The modal's button; anything else (Escape, the close box) is a no. */
export const APPLY_FIXES = 'Apply fixes';

/** The catch-up modal's button; anything else is a no. */
export const CATCH_UP = 'Bring up to date';

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
        await this.offerTemplateCatchUp(report);
    }

    private async offerTemplateCatchUp(report: StorefrontReport): Promise<void> {
        const catchUp = await readTemplateCatchUp(report.repository, this.context.secrets, this.logger);
        if (!catchUp) return;
        const fork = repoName(catchUp.repository);
        const template = repoName(catchUp.template);
        const commits = catchUp.behindBy === 1 ? '1 commit' : `${catchUp.behindBy} commits`;
        const choice = await vscode.window.showInformationMessage(
            'Bring the code up to date with the template?',
            {
                modal: true,
                detail:
                    `${fork} is a fork of ${template} and is ${commits} behind it. ` +
                    `GitHub merges the template's changes into ${catchUp.branch}; your own commits stay. ` +
                    'If they conflict, nothing is changed.',
            },
            CATCH_UP,
        );
        if (choice !== CATCH_UP) return;
        await this.runTemplateCatchUp(catchUp, fork, template);
    }

    private async runTemplateCatchUp(catchUp: TemplateCatchUp, fork: string, template: string): Promise<void> {
        try {
            const result = await this.withProgress('Bringing the code up to date', () =>
                catchUpWithTemplate(catchUp, this.context.secrets, this.logger),
            );
            if (result.success) {
                await this.showInfo(`${fork} is up to date with ${template}.`);
            } else if (result.conflict) {
                await this.showWarning(
                    "Nothing was changed: the template's changes conflict with this storefront's own. " +
                        'Merge them on GitHub, or leave the code as it is.',
                );
            } else {
                await this.showWarning(`Could not bring the code up to date: ${result.message}`);
            }
        } catch (error) {
            await this.showWarning(`Could not bring the code up to date: ${(error as Error).message}`);
        }
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

function repoName(ref: { owner: string; repo: string }): string {
    return `${ref.owner}/${ref.repo}`;
}
