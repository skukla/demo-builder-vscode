/**
 * Clearing a demo's data from the store (datapack-engine step 10; datapack-simplification step 06):
 * the SC clears WEBSITES, always whole (owner, 2026-11-11: Clear no longer picks stores). Clear Demo
 * Data clears every website the project uses; Clear Commerce Instance (step 06, C4) the websites the
 * SC ticks. These are the shapes that cross between the extension, the agent tools
 * (`check_demo_data`, `clear_demo_data`) and the Data Installer webview.
 *
 * Types only. `TypeRow` is the type table's row (`installRows.ts`) and `TreeListNode` the core
 * tree's node (`TreeList.tsx`): both are imported as types, so nothing of either module is bundled
 * with this one.
 *
 * @module types/demoDataWipe
 */

import type { TreeListNode } from '@/core/ui/components/ui/TreeList';
import type { TypeRow } from '@/features/data-installer/ui/components/job/installRows';
import type { ProjectDatapack } from '@/types/datapack';
import type { BatchDatapack, BatchSaveNames } from '@/types/projectsBatch';

/**
 * The ERP step ("One action, ERP included", owner 2026-10-30): an ERP integration serves the
 * instance (from any local project) and sends the orders of some chosen websites to an ERP. The
 * wipe closes those orders itself, as any other (Commerce is the source system, owner 2026-11-11);
 * its ERP is brought in line after the clearing, then filled again from Commerce. Not brought in
 * line (`held`) when the integration must be updated first, or could not be asked.
 */
export interface WipeErpPart {
    /** The project the integration is in, as the SC knows it: "JustRite". */
    integration: string;
    /** The chosen websites whose orders it sends to an ERP. */
    websites: string[];
    /** Why its ERP will not be brought in line this time; absent when it will. The orders are closed either way. */
    held?: string;
    /** The one line the list shows for it. */
    line: string;
}

/** One data type's records, by name: what the clearing takes, and what it leaves. No reasons. */
export interface ClearRecords {
    removed: string[];
    /** Another project's records on these websites, instance-wide things another project's records list, and anything a website not chosen uses. */
    kept: string[];
    /** The removed records as a tree, for a type that nests (categories). */
    tree?: TreeListNode[];
}

/**
 * Why a data type could not be read, by `classifyTransience`'s kind: `slow` (a timeout or the network:
 * Retry, and the clearing waits), `refused` (Commerce turned the read away), `strange` (any other
 * answer). A refused or strange type is left alone, and the clearing runs for the rest.
 */
export type ClearUnread = 'slow' | 'refused' | 'strange';

/**
 * The datapack the project names, which the clearing uninstalls first through the engine's own
 * removal (C3). Present only when Demo Builder installed it (its install record is here): the list is
 * made as if it were already gone.
 */
export interface ClearDatapack {
    /** As the SC knows it: the run's "Uninstall <name>" row. */
    name: string;
    /** Whether the SC changed what it put in Commerce: not checked by the check itself. */
    changes: 'none' | 'asks' | 'saves' | 'unchecked';
    /** The pack itself, for the window's read of those changes (`get-datapack-removal-changes`). */
    pack: ProjectDatapack;
}

/** One website of the instance, with the local projects on this Commerce instance using it (C4). */
export interface InstanceWebsite {
    code: string;
    name: string;
    /** As each project's card names it; none when no local project uses it (P6-Q7). */
    projects: string[];
}

/** `check-demo-data` with `websites: []`: the instance's websites, for Clear Commerce Instance. */
export interface InstanceChoices {
    websites: InstanceWebsite[];
}

/**
 * A local project on the chosen websites (C4): it loses its demo data unless `kept` says why not.
 * `datapack` is present when the clearing uninstalls it first: its `changes`, read as a batch reads
 * them, decide whether the batch save question asks about it (P6-Q4).
 */
export interface ClearProject {
    path: string;
    /** As its card names it. */
    name: string;
    datapack?: BatchDatapack;
    /**
     * Why this project keeps its data on these websites, as one sentence naming it: its datapack is
     * also installed on a website not chosen, a record of it names no website, or the project may be
     * on another Commerce instance with a website of the same code. Absent: it loses its demo data.
     */
    kept?: string;
    /** It loses its datapack's data, but keeps what an older pack's install record lists on these websites: one sentence naming them. */
    note?: string;
}

/** What Clear Commerce Instance's check adds: the projects, and what the save question needs. */
export interface ClearInstancePart extends BatchSaveNames {
    projects: ClearProject[];
}

/** `check-demo-data`'s answer: what clearing the project's websites would do, type by type. */
export interface ClearCheck {
    /** The project, as the SC knows it: the window's title names it. */
    project: string;
    websites: Array<{ code: string; name: string }>;
    /** One row per data type with anything removed, kept or not read, in a fixed order. */
    rows: TypeRow[];
    /** Each type's records, keyed as `rows` names the type. */
    records: Record<string, ClearRecords>;
    /** The types that could not be read, and how. Absent when every read answered. */
    unread?: Record<string, ClearUnread>;
    /** How many things the clearing changes: the button's count. */
    total: number;
    /** Names this exact plan; the clearing must be handed it back. */
    token: string;
    datapack?: ClearDatapack;
    /** One sentence naming the types Commerce was too slow to answer: Retry, and the clearing waits. */
    problem?: string;
    /** Another local project uses one of these websites: one sentence naming it. Informational; the SC may go on. */
    warning?: string;
    /** The ERP step, when an ERP integration serves some of these websites: their orders are counted under orders. */
    erp?: WipeErpPart;
    /** Clear Commerce Instance's list (C4): the projects on these websites, which all lose their demo data. */
    instance?: ClearInstancePart;
}

/** What either handler is sent. Checked in the handler: an agent sends these too. */
export interface DemoDataRequest {
    /**
     * The check only: omitted, the project's own websites (Clear Demo Data); `[]`, the instance's
     * websites with the projects using each (`InstanceChoices`); codes, the list for clearing those
     * websites whoever put the data there (Clear Commerce Instance, C4).
     */
    websites?: string[];
    /** Clear only: the token of the list shown (`check-demo-data`'s answer). */
    token?: string;
    /** Clear only: must be true. */
    confirm?: boolean;
    /** Started from the Data Installer's button, so its progress goes to the screen's progress window. */
    progress?: 'modal';
    /**
     * Clear only, when the datapack has changes: the save question's answer, as Uninstall's (`keep`
     * saves them, into the SC's own pack or as the new one `saveAs` names; `drop` loses them). Left
     * out, changes in the SC's own pack are saved into it, and changes in another's stop the clearing.
     */
    changes?: 'keep' | 'drop';
    saveAs?: { displayName: string };
}

/**
 * `clear-commerce-instance` (C4): clear what the instance check with this token showed. Gated twice
 * in the handler, as an agent sends it too: `confirm`, and `understood`, the window's "I understand"
 * box. Each project's datapack is uninstalled first, its changes settled by its answer here.
 */
export interface ClearInstanceRequest {
    token?: string;
    confirm?: boolean;
    understood?: boolean;
    progress?: 'modal';
    /**
     * The batch save question's answers, by project path: a new datapack's name, or `drop`. Absent
     * for a project: changes in the SC's own pack are saved into it, and changes in another's stop
     * the clearing before anything runs.
     */
    changes?: Record<string, { saveAs: string } | 'drop'>;
}

/**
 * Which of the header's two Clear windows to open (C5, P6-Q5): Clear Demo Data (`project`) or Clear
 * Commerce Instance (`instance`). The Command Palette's `demoBuilder.clearDemoData` and
 * `demoBuilder.clearCommerceInstance` open the project's Datapacks on one. A screen not open yet
 * takes the request once mounted (`takeClearRequest`); one already open is pushed `openClearWindow`.
 */
export type ClearWindowKind = 'project' | 'instance';

/** `openClearWindow`: open this Clear window on the Datapacks screen already open. */
export interface OpenClearWindowPayload {
    window: ClearWindowKind;
}

/** `takeClearRequest`: the Clear window to open now, or null; used up either way. */
export interface TakeClearRequestResponse {
    success: true;
    data: { window: ClearWindowKind | null };
}
