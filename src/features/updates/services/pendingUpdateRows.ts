/**
 * The Updates modal's rows (PL-80): one check as the SC reads it, and the ticked rows back
 * as the selection to apply.
 *
 * A row's id is its kind and its place in that kind's list in the check
 * (`blockLibrary:2`), so it leads back to exactly the entry it was made from, and only
 * within that check: the extension keeps the check the screen was shown and applies the
 * ids against it.
 *
 * Everything that can be applied from here starts ticked, except an integration pair:
 * applying one redeploys it to the live Adobe workspace and nothing asks first, so the
 * tick is the SC's confirmation and starts off (owner, 2026-10-20). A pair in another
 * Adobe org cannot be applied from here at all (the guard chain refuses it), so it is
 * shown unticked and locked, and `selectionsForIds` leaves it out even if its id comes
 * back.
 *
 * @module features/updates/services/pendingUpdateRows
 */

import { OTHER_ORG_NOTE } from './integrationUpdates';
import type { UpdateSelections } from './updateSelections';
import { getTemplateSource } from './updateSources';
import { COMPONENT_IDS } from '@/core/constants';
import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import type { Project } from '@/types/base';
import type {
    PendingUpdateGroup,
    PendingUpdateKind,
    PendingUpdateRow,
} from '@/types/pendingUpdates';

/** The extension's own update, when there is one. */
interface ExtensionUpdateSummary {
    current: string;
    latest: string;
}

const EXTENSION_GROUP: PendingUpdateGroup = { key: 'extension', title: 'Demo Builder' };
const FORKS_GROUP: PendingUpdateGroup = { key: 'forks', title: 'Template repositories' };
const EXTENSION_ID = 'extension';
const LOCKED_OTHER_ORG = `This project ${OTHER_ORG_NOTE}`;
/**
 * What a version without a number of its own says. Not "N commits behind": a commit count
 * is the developer's measure, and tells an SC nothing they would act on (owner, 2026-10-20).
 */
const NEWER = 'Newer version';
/**
 * Said on every row whose apply commits to the storefront repository, which the live site
 * serves, as the integration row says it redeploys (owner, 2026-10-20). The Inspector SDK
 * row does not say it: its apply only records the new version.
 */
const LIVE_SITE = 'updates the live site';
/** "Newer version" dropped where it is said: it tells the SC nothing (owner, 2026-10-20). */
const LIVE_SITE_DETAIL = 'Updates the live site';

/** `ticked: false` is a row that waits for the SC's tick; a locked row is never ticked. */
type RowText = Pick<PendingUpdateRow, 'label' | 'detail'> & { lockedReason?: string; ticked?: false };

/** Each project kind's words for one of its entries. */
const PROJECT_KINDS: { [K in ProjectKind]: (entry: UpdateSelections[K][number]) => RowText } = {
    template: (t) => ({ label: templateLabel(t.project), detail: LIVE_SITE_DETAIL }),
    // Adobe's half of a colleague's storefront, to the version our daily gate tested (EDS-56).
    boilerplate: () => ({ label: 'Adobe boilerplate', detail: `Tested version, ${LIVE_SITE}` }),
    // A clash kept to fix with AI (EDS-57): applying it checks the fix and pushes it.
    finish: (f) => ({
        label: f.clash.track === 'boilerplate' ? 'Finish the Adobe boilerplate update' : `Finish: ${templateLabel(f.project)}`,
        detail: `Kept to fix with AI, ${LIVE_SITE}`,
    }),
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
    blockLibrary: (b) => ({ label: b.library.name, detail: LIVE_SITE_DETAIL }),
    blockLibraryInstall: (b) => ({ label: b.library.name, detail: `install, ${LIVE_SITE}` }),
    inspector: () => ({ label: 'Demo Inspector SDK', detail: NEWER }),
    integration: (p) => ({
        label: p.label,
        detail: `${NEWER}, redeploys to Adobe`,
        ticked: false,
        ...(p.otherOrg ? { lockedReason: LOCKED_OTHER_ORG } : {}),
    }),
};

/**
 * What the template row is. A storefront following our patches repo's tested pointer gets
 * Adobe's template; any other follows its source repository's branch, which for an added
 * demo is a colleague's, so the row says whose (owner, 2026-10-20: two different updates
 * both read "EDS template"). Mirrors the checker's split (`templateUpdateChecker.ts`).
 */
function templateLabel(project: Project): string {
    const metadata = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata;
    const source = getTemplateSource(project);
    if (metadata?.lkgSource || !source) return 'EDS template';
    return `Changes from ${source.owner}/${source.repo}`;
}

/** The kinds that belong to one project, in the order a project's rows are listed. */
type ProjectKind = Exclude<PendingUpdateKind, 'extension' | 'forkSync'>;
const PROJECT_KIND_ORDER: ProjectKind[] = [
    'template',
    'boilerplate',
    'finish',
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
        rows.push(
            row(`forkSync:${i}`, 'forkSync', FORKS_GROUP, {
                label: `${f.owner}/${f.repo}`,
                detail: f.parentFullName ? `${NEWER} from ${f.parentFullName}` : NEWER,
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
    return { id, kind, group, ...text, ticked: text.ticked ?? !text.lockedReason };
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
            boilerplate: pick('boilerplate', selections.boilerplate),
            finish: pick('finish', selections.finish),
            component: pick('component', selections.component),
            adobeMcp: pick('adobeMcp', selections.adobeMcp),
            blockLibrary: pick('blockLibrary', selections.blockLibrary),
            blockLibraryInstall: pick('blockLibraryInstall', selections.blockLibraryInstall),
            inspector: pick('inspector', selections.inspector),
            integration: pick('integration', selections.integration, (p) => !p.otherOrg),
        },
    };
}

/**
 * Each selection entry's row id, by the entry itself: how a run, which reports entries,
 * names the rows it is working on.
 *
 * @param selections - the check the rows were made from
 * @returns the row id of every entry in it
 */
export function rowIdsOf(selections: UpdateSelections): Map<object, string> {
    const ids = new Map<object, string>();
    for (const kind of Object.keys(selections) as Array<keyof UpdateSelections>) {
        (selections[kind] as object[]).forEach((entry, i) => ids.set(entry, `${kind}:${i}`));
    }
    return ids;
}
