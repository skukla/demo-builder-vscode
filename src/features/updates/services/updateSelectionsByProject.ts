/**
 * An update check's selections, read project by project (2026-10-21).
 *
 * The apply runs one project at a time, in the order the Updates modal lists them, so a
 * run moves down the list the SC is watching (owner, 2026-10-21: it ran by kind, across
 * every project, so the second project's update ran before the first's). The question
 * a running demo asks leaves whole projects out. Both read the selections by project,
 * here.
 *
 * @module features/updates/services/updateSelectionsByProject
 */

import type { UpdateSelections } from '@/features/updates/services/updateSelections';
import type { Project } from '@/types/base';

/** The kinds that belong to one project: every kind but the template repositories. */
export type ProjectSelectionKind = Exclude<keyof UpdateSelections, 'forkSync'>;

/**
 * A project's kinds in the order they apply, which is the order its rows are listed.
 * A kept clash finishes first, before anything else moves the repository; a template
 * update comes before its block libraries, which skip what it already brought.
 */
export const PROJECT_SELECTION_KINDS: readonly ProjectSelectionKind[] = [
    'finish',
    'template',
    'boilerplate',
    'component',
    'adobeMcp',
    'blockLibrary',
    'inspector',
    'blockLibraryInstall',
    'integration',
];

/**
 * Each project the selections touch, once, in the order its first entry appears.
 *
 * @param selections - an update check's selections
 * @returns the projects
 */
export function projectsOf(selections: UpdateSelections): Project[] {
    const seen = new Map<string, Project>();
    for (const kind of PROJECT_SELECTION_KINDS) {
        for (const { project } of selections[kind] as Array<{ project: Project }>) {
            if (!seen.has(project.path)) seen.set(project.path, project);
        }
    }
    return [...seen.values()];
}

/**
 * The selections, with only the entries of the projects `keep` accepts. The template
 * repositories belong to no project and are kept as they are.
 *
 * @param selections - an update check's selections
 * @param keep - whether a project's entries stay
 * @returns the selections that remain
 */
export function selectionsWhere(selections: UpdateSelections, keep: (project: Project) => boolean): UpdateSelections {
    const only = <T extends { project: Project }>(list: T[]): T[] => list.filter((entry) => keep(entry.project));
    return {
        forkSync: selections.forkSync,
        template: only(selections.template),
        boilerplate: only(selections.boilerplate),
        finish: only(selections.finish),
        component: only(selections.component),
        adobeMcp: only(selections.adobeMcp),
        blockLibrary: only(selections.blockLibrary),
        blockLibraryInstall: only(selections.blockLibraryInstall),
        inspector: only(selections.inspector),
        integration: only(selections.integration),
    };
}

/**
 * The projects in a given order: those it names first, as it names them, then the rest
 * as they were.
 *
 * @param projects - the projects, in the order they first appear
 * @param order - project paths, first to last (the Updates modal's headings)
 * @returns the projects, reordered
 */
export function inOrder(projects: Project[], order: readonly string[] | undefined): Project[] {
    if (!order) return projects;
    const rank = (project: Project): number => {
        const at = order.indexOf(project.path);
        return at === -1 ? order.length : at;
    };
    return [...projects].sort((a, b) => rank(a) - rank(b));
}
