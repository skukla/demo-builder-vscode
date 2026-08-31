/**
 * Which AEM authoring experience a project uses, and the canvas branch it loads.
 *
 * Both answers come from the same two-level precedence (per-project metadata,
 * then a `demoBuilder.daLive` setting) and both fail safe on a corrupted
 * settings value, so they change for the same reason and belong together.
 *
 * @module features/eds/handlers/authoringExperience
 */

import * as vscode from 'vscode';
import { COMPONENT_IDS } from '@/core/constants';
import type { AuthoringExperience, Project } from '@/types/base';

const AUTHORING_EXPERIENCES: ReadonlySet<string> = new Set<AuthoringExperience>([
    'da-live-classic',
    'experience-workspace',
]);

/**
 * Resolve the AEM authoring experience for a project.
 *
 * Precedence (mirrors resolveByomOverlayConfig):
 * 1. Per-project metadata value — if it is a recognized union member, it wins.
 * 2. Global setting demoBuilder.daLive.authoringExperience (default
 *    'da-live-classic').
 * Any unrecognized result coerces to 'da-live-classic' (fail-safe), so a
 * corrupted setting or stray metadata can never break the Author button.
 *
 * @param metadataValue - The per-project `authoringExperience` metadata value
 * @returns The resolved authoring experience
 */
export function resolveAuthoringExperience(metadataValue: string | undefined): AuthoringExperience {
    if (metadataValue && AUTHORING_EXPERIENCES.has(metadataValue)) {
        return metadataValue as AuthoringExperience;
    }

    const globalValue = vscode.workspace
        .getConfiguration('demoBuilder.daLive')
        .get<string>('authoringExperience', 'da-live-classic');

    return AUTHORING_EXPERIENCES.has(globalValue)
        ? (globalValue as AuthoringExperience)
        : 'da-live-classic';
}

/**
 * Resolve the authoring experience for a project by reading its EDS
 * component-instance `authoringExperience` metadata, then applying the
 * resolveAuthoringExperience precedence (per-project → global → UE).
 *
 * @param project - The project (any project; non-EDS yields the global default)
 * @returns The resolved authoring experience
 */
export function resolveProjectAuthoringExperience(
    project: Project | undefined | null,
): AuthoringExperience {
    const edsInstance = project?.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    const metadataValue = edsInstance?.metadata?.authoringExperience as string | undefined;
    return resolveAuthoringExperience(metadataValue);
}

/**
 * Read the da-nx branch the Experience Workspace canvas loads from (the `?nx=`
 * override) from the demoBuilder.daLive.ewCanvasBranch setting.
 *
 * Defaults to '' — the param-less production canvas now hosts the live EW alpha,
 * so the URL builder drops the ?nx override entirely (the production form). Set a
 * branch only to pin a specific pre-release da-nx build.
 *
 * Defends against a corrupted (non-string) settings.json value by falling back
 * to the '' default. Returns the value trimmed; a whitespace-only value
 * collapses to ''.
 *
 * @returns The trimmed EW canvas branch (may be empty string)
 */
export function getEwCanvasBranch(): string {
    const raw = vscode.workspace
        .getConfiguration('demoBuilder.daLive')
        .get<string>('ewCanvasBranch', '');
    // VS Code's typed get returns the default on type mismatch, but be defensive
    // about non-string values (corrupted user settings.json).
    if (typeof raw !== 'string') {
        return '';
    }
    return raw.trim();
}
