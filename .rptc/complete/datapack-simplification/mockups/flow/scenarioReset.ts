/**
 * J7's data: the projects on the list and the datapack each uses, as the product's batch window
 * reads them (`prepareProjectsBatch`'s answer, typed to `src/types/projectsBatch.ts`). The window
 * itself is the product's, unchanged (owner, 2026-11-12: "We already have a modal experience we've
 * approved for mass action, deletes, and resets.").
 *
 * What a pack's changes are follows the panel's "Commerce holds": with unsaved changes, My Luma
 * (the SC's own pack) saves them with no question, and Bodea (Demo Builder's) asks, so Datapack
 * Changes follows.
 */

import { DEMO_PACK, OTHER_PACK, type CommerceState, type PackName } from './scenarioInstall';
import { asDisplayName } from '@/core/utils/projectDisplayName';
import type { BatchDatapack, BatchDeleteRow, BatchResetRow, PrepareProjectsBatchResponse } from '@/types/projectsBatch';

/** One project on the list and the datapack it uses, if any. */
export interface ListedProject {
    name: string;
    /** Its storefront's GitHub repository and DA.live site, both `owner/name`. */
    repo: string;
    pack: PackName | null;
}

/** The projects on this computer (J1's website rows name the same ones). */
export const PROJECTS: ListedProject[] = [
    { name: 'Kukla Luma', repo: 'acme-demos/kukla-luma', pack: DEMO_PACK },
    { name: 'Luma Test', repo: 'acme-demos/luma-test', pack: null },
    { name: 'Bodea', repo: 'acme-demos/bodea', pack: OTHER_PACK },
];

/** The project a single reset or delete is on. */
export const ONE: ListedProject = PROJECTS[0];

const pathOf = (p: ListedProject): string => `/projects/${p.repo.split('/')[1]}`;

/** A project's pack as the batch reads it: the SC's own saves its changes, another's asks. */
function datapackOf(p: ListedProject, commerce: CommerceState): BatchDatapack | undefined {
    if (!p.pack) return undefined;
    if (commerce !== 'unsaved') return { name: p.pack };
    return { name: p.pack, changes: p.pack === DEMO_PACK ? 'saves' : 'asks' };
}

/** What `pack` adds to a row: the field only when there is one (exact optional properties). */
const withPack = (pack: BatchDatapack | undefined): { datapack?: BatchDatapack } => (pack ? { datapack: pack } : {});

function resetRow(p: ListedProject, commerce: CommerceState): BatchResetRow {
    return { path: pathOf(p), name: asDisplayName(p.name), repository: p.repo, ...withPack(datapackOf(p, commerce)) };
}

/** The boxes start unticked: `demoBuilder.cleanupBehavior` at its default. */
function deleteRow(p: ListedProject, commerce: CommerceState): BatchDeleteRow {
    return {
        path: pathOf(p),
        name: asDisplayName(p.name),
        repo: { name: p.repo, ticked: false },
        site: { name: p.repo, ticked: false },
        ...withPack(datapackOf(p, commerce)),
    };
}

/** The prepare's answer for `projects`, as the window reads it. */
export function questionsFor(action: 'reset' | 'delete', projects: readonly ListedProject[], commerce: CommerceState): PrepareProjectsBatchResponse {
    return action === 'delete'
        ? { action, rows: projects.map((p) => deleteRow(p, commerce)) }
        : { action, rows: projects.map((p) => resetRow(p, commerce)) };
}
