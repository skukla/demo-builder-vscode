/**
 * What the open project holds, for the Datapacks screen: the datapack recorded on it, when Demo
 * Builder's engine installed it, and every pack believed to be on its Commerce instance.
 *
 * A failed install of that datapack (step-04 S8, S7's `installFailed`) comes with where a Retry
 * writes: the project's instance and its recorded website and store view, as the job window sends.
 *
 * Two reads: `get-datapack-import-target` (the project) and `list-installed-datapacks` (scoped to
 * the project's instance, so it waits for the first). The Datapack Library reads neither.
 *
 * @module features/data-installer/ui/hooks/useProjectHolding
 */

import { useCallback, useEffect, useMemo } from 'react';
import type { InstalledDatapack, Page } from '../../types';
import { useDataInstallerRequest } from './useDataInstallerRequest';
import type { JobTarget } from './useJobReads';
import type { DatapackInstallFailed, ProjectDatapack } from '@/types/datapack';

/** What `get-datapack-import-target` reports about the open project. */
interface ProjectSampleData extends Pick<JobTarget, 'scope'> {
    projectName?: string;
    /** When Demo Builder's engine installed the pack, when it did. */
    installedAt?: string;
    /** The Commerce instance this project writes to — scopes the installed list. */
    instance?: string;
    datapack?: ProjectDatapack;
    /** A creation install of `datapack` that did not succeed (step-04 S7). */
    installFailed?: DatapackInstallFailed;
}

/** A failed install of the held datapack, and where a Retry writes: the project's own target. */
export interface HeldFailure extends DatapackInstallFailed, Pick<JobTarget, 'scope'> {
    /** Empty when the project names none: the start then says an instance is required. */
    commerceInstance: string;
}

/** What the screen knows about the open project's datapack. */
export interface ProjectHolding {
    /** The datapack recorded on the project, if any. */
    held: ProjectDatapack | undefined;
    /** When Demo Builder's engine installed `held`, if it did. */
    installedAt: string | undefined;
    /** A failed install of `held`, if it failed (step-04 S8). */
    failed: HeldFailure | undefined;
    /** Every pack name believed to be on the project's instance. */
    installedPacks: Set<string>;
    /**
     * The project read has answered, either way (walk F92): the flyout waits for it in a project's
     * Datapacks. Always true in the Datapack Library, which reads no project.
     */
    projectAnswered: boolean;
    /** Reads the project again. */
    reloadProject: () => void;
    /** Reads the project again, and the instance's installed list when the instance is known. */
    reloadHolding: () => void;
}

/**
 * @param library - the Datapack Library: no project is read.
 */
export function useProjectHolding(library: boolean): ProjectHolding {
    // What the open project was CREATED to hold, recorded by the wizard's Sample
    // Data area. Optional in every direction: no project, or a project that
    // chose nothing, simply shows no banner.
    const projectContext = useDataInstallerRequest<ProjectSampleData>('get-datapack-import-target');

    const loadProjectContext = projectContext.load;
    useEffect(() => {
        if (!library) loadProjectContext({});
    }, [loadProjectContext, library]);

    /**
     * What is recorded as installed on this project's instance: Demo Builder's
     * engine's install records, then the service's tracking (step 14,
     * `engineHistoryReads`). Before step 14 this was the service's alone, so a
     * pack our engine installed wore no check.
     *
     * Scoped to the instance, so it answers "what is on the box this project
     * writes to" rather than the global cross-instance list an earlier Installed
     * view showed (removed for exactly that reason — see `DataInstallerScreen`).
     *
     * Self-reported, like every source available here: a `DELETE
     * get-installed-datapacks` clears the record without uninstalling anything,
     * so it can say ABSENT while data sits on the instance. That is the safe
     * direction for a checkmark, and it is why this is unioned with the
     * project's own record rather than replacing it.
     */
    const installed = useDataInstallerRequest<Page<InstalledDatapack>>('list-installed-datapacks');
    const commerceInstance = projectContext.value?.instance;
    const loadInstalled = installed.load;
    useEffect(() => {
        if (!commerceInstance) {
            return;
        }
        loadInstalled({ commerceInstance });
    }, [loadInstalled, commerceInstance]);

    /**
     * Every pack believed to be on this instance, from both self-reports.
     *
     * UNION, not either alone. The service's list can be wrong in the absent
     * direction; the project's record covers only one pack and can outlive a
     * failed import. Neither is ground truth — nothing here has that, since only
     * Commerce itself knows what it holds — so the check means "believed
     * installed", and both sources clear when a removal runs through the
     * extension, which is the case that matters.
     */
    const installedPacks = useMemo(() => {
        const names = new Set<string>();
        for (const row of installed.value?.items ?? []) {
            names.add(row.id.name);
        }
        const recorded = projectContext.value?.datapack?.name;
        if (recorded) {
            names.add(recorded);
        }
        return names;
    }, [installed.value, projectContext.value]);

    const project = projectContext.value;
    const failed = useMemo((): HeldFailure | undefined => {
        const installFailed = project?.installFailed;
        if (!installFailed) return undefined;
        return { ...installFailed, commerceInstance: project.instance ?? '', ...(project.scope ? { scope: project.scope } : {}) };
    }, [project]);

    const reloadProject = useCallback((): void => loadProjectContext({}), [loadProjectContext]);
    const reloadHolding = useCallback((): void => {
        loadProjectContext({});
        if (commerceInstance) {
            loadInstalled({ commerceInstance });
        }
    }, [loadProjectContext, loadInstalled, commerceInstance]);

    return {
        held: projectContext.value?.datapack,
        installedAt: projectContext.value?.installedAt,
        failed,
        installedPacks,
        projectAnswered: library || projectContext.settled,
        reloadProject,
        reloadHolding,
    };
}

/*
 * A `RecordedChoiceNotice` banner was previously rendered on the Datapacks screen and has been
 * replaced by the card's own check: a full-width bar reading "<project> is set up
 * for <pack> (main)" with a "Review and install" link.
 *
 * It existed to close the wizard's loop — the Sample Data step records a pack and
 * deliberately does not import it, so the user needed the name carried forward
 * rather than re-found among 25 cards. That need is real and has not gone away;
 * it is now met by the card itself, which wears the shared `SelectionCheck` and
 * the accent border. The banner announced a card's state somewhere the card was
 * not, and then needed a link to point back at it.
 *
 * The wording had also stopped being true. `project.datapack` was written only by
 * the wizard, so "is set up for" meant "chosen, not yet installed" — until an
 * import from the modal began writing the same field, at which point the bar
 * invited the user to install what they had just installed.
 */
