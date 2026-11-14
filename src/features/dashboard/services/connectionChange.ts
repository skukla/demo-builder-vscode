/**
 * A settings change that moves the project to another Commerce instance while it holds a datapack
 * (step-07 D6, owner 2026-11-14). The datapack stays in the instance it went into, and once the
 * project points elsewhere nothing here can remove it (`installedElsewhere`). So both doors that
 * change settings ask first: the Configure screen's Save (a confirm offering Uninstall First) and
 * the agent's `configure_project` (an explicit `installedDatapack` answer).
 *
 * `vscode`-free: the webview imports its types.
 *
 * @module features/dashboard/services/connectionChange
 */

import { applyConfigChanges } from './configureConfigChanges';
import { deriveImportInstance } from '@/features/data-installer/services/importInstance';
import { onAnotherInstance } from '@/features/data-installer/services/instanceKey';
import type { Project } from '@/types/base';
import type { ProjectDatapack } from '@/types/datapack';
import type { ComponentConfigs } from '@/types/webview';

/** What a save that changes the connection was told to do about the datapack. */
export type InstalledDatapackAnswer = 'keep' | 'uninstall';

/** Configure's save answered with a question: the datapack, by the name the SC knows it. */
export interface InstalledDatapackQuestion {
    installedDatapack: string;
}

/**
 * The datapack the change would leave on the instance the project points at now, or undefined
 * when the change keeps the instance (or the project holds no datapack, or had no instance).
 *
 * When the install record notes an instance, that is where the datapack is: a project already
 * pointing elsewhere (Change Anyway) leaves nothing behind by moving again, and pointing back at
 * the record's instance is the way home (D6 review S2).
 *
 * @param project - the project as it is, before the change
 * @param changes - only the values being changed
 * @param recorded - the instance the datapack's install record notes, when it notes one
 */
export function datapackLeftByChange(project: Project, changes: ComponentConfigs, recorded?: string): ProjectDatapack | undefined {
    const held = project.datapack;
    const before = deriveImportInstance(project.componentConfigs);
    if (!held || !before || onAnotherInstance(recorded, before)) return undefined;
    const after = deriveImportInstance(applyConfigChanges(project.componentConfigs ?? {}, changes));
    return after === undefined || onAnotherInstance(before, after) ? held : undefined;
}

/** What the agent is told when a change would leave the datapack behind. Nothing was applied. */
export function datapackLeftLine(displayName: string): string {
    return (
        `${displayName} is installed in the current Commerce instance, and this change points the project at another one, ` +
        'where it could not be uninstalled. Nothing was applied. Tell the user, then uninstall it first with reset_datapack, ' +
        'or call again with installedDatapack:"keep" to leave it there.'
    );
}
