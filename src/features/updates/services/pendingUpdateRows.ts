/**
 * The Updates modal's rows (PL-80): one check as the SC reads it, and the ticked rows back
 * as the selection to apply.
 *
 * A row's id is its kind and its place in that kind's list in the check
 * (`blockLibrary:2`), so it leads back to exactly the entry it was made from, and only
 * within that check: the extension keeps the check the screen was shown and applies the
 * ids against it.
 *
 * Everything that can be applied from here starts ticked. An integration pair in another
 * Adobe org cannot (the guard chain refuses it), so it is shown unticked and locked, and
 * `selectionsForIds` leaves it out even if its id comes back.
 *
 * @module features/updates/services/pendingUpdateRows
 */

import { OTHER_ORG_NOTE } from './integrationUpdates';
import type { UpdateSelections } from './updateSelections';
import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import { formatBehindLabel } from '@/features/updates/commands/updateTypes';
import type { Project } from '@/types/base';
import type {
    PendingUpdateGroup,
    PendingUpdateKind,
    PendingUpdateRow,
} from '@/types/pendingUpdates';

/** The extension's own update, when there is one. */
export interface ExtensionUpdateSummary {
    current: string;
    latest: string;
}

const EXTENSION_GROUP: PendingUpdateGroup = { key: 'extension', title: 'Demo Builder' };
const FORKS_GROUP: PendingUpdateGroup = { key: 'forks', title: 'Template repositories' };
const EXTENSION_ID = 'extension';
const LOCKED_OTHER_ORG = `This project ${OTHER_ORG_NOTE}`;

type RowText = Pick<PendingUpdateRow, 'label' | 'detail'> & { lockedReason?: string };

/** Each project kind's words for one of its entries. */
const PROJECT_KINDS: { [K in ProjectKind]: (entry: UpdateSelections[K][number]) => RowText } = {
    template: (t) => ({ label: 'EDS template', detail: formatBehindLabel(t.commitsBehind ?? 0) }),
    component: (c) => ({
        label: c.project.componentInstances?.[c.componentId]?.name ?? c.componentId,
        detail: c.currentVersion
            ? `${c.currentVersion} → ${c.latestVersion}`
            : `version ${c.latestVersion}`,
    }),
    adobeMcp: (a) => ({
        label: 'Adobe MCP',
        detail: a.currentVersion
            ? `${a.currentVersion} → ${a.latestVersion}`
            : `version ${a.latestVersion}`,
    }),
    blockLibrary: (b) => ({
        label: b.library.name,
        detail: formatBehindLabel(b.commitsBehind ?? 0),
    }),
    blockLibraryInstall: (b) => ({ label: b.library.name, detail: 'install' }),
    inspector: (i) => ({
        label: 'Demo Inspector SDK',
        detail: formatBehindLabel(i.commitsBehind ?? 0),
    }),
    integration: (p) => ({
        label: p.label,
        detail: 'update available',
        ...(p.otherOrg ? { lockedReason: LOCKED_OTHER_ORG } : {}),
    }),
};

/** The kinds that belong to one project, in the order a project's rows are listed. */
type ProjectKind = Exclude<PendingUpdateKind, 'extension' | 'forkSync'>;
const PROJECT_KIND_ORDER: ProjectKind[] = [
    'template',
    'component',
    'adobeMcp',
    'blockLibrary',
    'blockLibraryInstall',
    'inspector',
    'integration',
];

/**
 * The rows for one check: Demo Builder first, then the open project, the other projects
 * by display name, and the template repositories last.
 *
 * @param selections - the check, from `computeUpdateSelections`
 * @param extension - the extension's own update, when there is one
 * @param currentProjectPath - the open project's path, listed first among the projects
 * @returns the rows, in the order they are drawn
 */
export function toPendingUpdateRows(
    selections: UpdateSelections,
    extension: ExtensionUpdateSummary | undefined,
    currentProjectPath: string | undefined,
): PendingUpdateRow[] {
    const rows: PendingUpdateRow[] = [];
    if (extension) {
        rows.push(
            row(EXTENSION_ID, 'extension', EXTENSION_GROUP, {
                label: 'Demo Builder extension',
                detail: `${extension.current} → ${extension.latest}`,
            }),
        );
    }
    rows.push(...sortedByProject(projectRows(selections), currentProjectPath));
    selections.forkSync.forEach((f, i) => {
        const behind = formatBehindLabel(f.behindBy ?? 0);
        rows.push(
            row(`forkSync:${i}`, 'forkSync', FORKS_GROUP, {
                label: `${f.owner}/${f.repo}`,
                detail: f.parentFullName ? `${behind} ${f.parentFullName}` : behind,
            }),
        );
    });
    return rows;
}

function projectRows(selections: UpdateSelections): Array<PendingUpdateRow & { project: Project }> {
    return PROJECT_KIND_ORDER.flatMap((kind) =>
        (selections[kind] as Array<{ project: Project }>).map((entry, i) => {
            const words = (PROJECT_KINDS[kind] as (e: unknown) => RowText)(entry);
            const group = { key: entry.project.path, title: getProjectDisplayName(entry.project) };
            return { ...row(`${kind}:${i}`, kind, group, words), project: entry.project };
        }),
    );
}

/** Open project first, then by display name; within a project, the kind order holds. */
function sortedByProject(
    rows: Array<PendingUpdateRow & { project: Project }>,
    currentProjectPath: string | undefined,
): PendingUpdateRow[] {
    const rank = (r: PendingUpdateRow) => (r.group.key === currentProjectPath ? 0 : 1);
    return rows
        .map((r, order) => ({ r, order }))
        .sort(
            (a, b) =>
                rank(a.r) - rank(b.r) ||
                a.r.group.title.localeCompare(b.r.group.title) ||
                a.order - b.order,
        )
        .map(({ r: { project: _project, ...rest } }) => rest);
}

function row(
    id: string,
    kind: PendingUpdateKind,
    group: PendingUpdateGroup,
    text: RowText,
): PendingUpdateRow {
    return { id, kind, group, ...text, ticked: !text.lockedReason };
}

/**
 * The selection a set of ticked ids applies, against the check the rows came from.
 *
 * @param selections - the same check `toPendingUpdateRows` was given
 * @param ids - the ids the SC left ticked
 * @returns the entries to apply, and whether the extension update was ticked; a locked
 *   row and an unknown id select nothing
 */
export function selectionsForIds(
    selections: UpdateSelections,
    ids: string[],
): { selections: UpdateSelections; extension: boolean } {
    const wanted = new Set(ids);
    const pick = <T>(
        kind: PendingUpdateKind,
        list: T[],
        allowed: (entry: T) => boolean = () => true,
    ): T[] => list.filter((entry, i) => wanted.has(`${kind}:${i}`) && allowed(entry));
    return {
        extension: wanted.has(EXTENSION_ID),
        selections: {
            forkSync: pick('forkSync', selections.forkSync),
            template: pick('template', selections.template),
            component: pick('component', selections.component),
            adobeMcp: pick('adobeMcp', selections.adobeMcp),
            blockLibrary: pick('blockLibrary', selections.blockLibrary),
            blockLibraryInstall: pick('blockLibraryInstall', selections.blockLibraryInstall),
            inspector: pick('inspector', selections.inspector),
            integration: pick('integration', selections.integration, (p) => !p.otherOrg),
        },
    };
}
