/**
 * Whether new categories get their pages without asking (EDS-27).
 *
 * Two levels, the same precedence the authoring experience uses
 * (`resolveAuthoringExperience`): the project's own choice, then the VS Code setting
 * `demoBuilder.categoryPages.autoAdd` (off by default).
 *
 * The project's choice lives beside the catalog menu's record, on the storefront
 * instance's free-form metadata — `componentInstances['eds-storefront'].metadata.
 * autoAddCategoryPages` — as a boolean. Absent means "follow the setting"; anything that
 * is not a boolean reads as absent, so a stray value can never switch unattended writes on.
 *
 * Pure: the setting's value is handed in.
 *
 * @module features/eds/services/catalogMenu/categoryPageAutoAdd
 */

import { COMPONENT_IDS } from '@/core/constants';
import type { Project } from '@/types/base';

/** The setting's section and leaf, as `workspace.getConfiguration(section).get(leaf)` takes them. */
export const AUTO_ADD_SETTING_SECTION = 'demoBuilder.categoryPages';
export const AUTO_ADD_SETTING_LEAF = 'autoAdd';

const KEY = 'autoAddCategoryPages';

/**
 * @param project - the project
 * @returns the project's own choice, or undefined when it follows the setting
 */
export function readAutoAddOverride(project: Project): boolean | undefined {
    const value = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata?.[KEY];
    return typeof value === 'boolean' ? value : undefined;
}

/**
 * Keep the project's own choice (the caller saves the project). `undefined` removes it,
 * so the project follows the setting again.
 *
 * @param project - the project, changed in place
 * @param value - on, off, or undefined for "follow the setting"
 */
export function writeAutoAddOverride(project: Project, value: boolean | undefined): void {
    const instance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    if (!instance) {
        throw new Error('This project has no storefront to keep the category page choice on');
    }
    const metadata = { ...(instance.metadata ?? {}) };
    if (value === undefined) delete metadata[KEY];
    else metadata[KEY] = value;
    instance.metadata = metadata;
}

/**
 * @param project - the project
 * @param settingValue - the `demoBuilder.categoryPages.autoAdd` setting, as read
 * @returns whether pages for new categories are added without asking on this project
 */
export function resolveAutoAddCategoryPages(project: Project, settingValue: unknown): boolean {
    return readAutoAddOverride(project) ?? settingValue === true;
}
