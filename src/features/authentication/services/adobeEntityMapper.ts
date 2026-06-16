/**
 * Adobe Entity Mappers
 *
 * Pure mapping functions for transforming raw Adobe API responses to typed entities.
 * Extracted from adobeEntityService.ts for SOP §10 compliance (god file reduction).
 */

import type {
    AdobeOrg,
    AdobeProject,
    AdobeWorkspace,
    RawAdobeOrg,
    RawAdobeProject,
    RawAdobeWorkspace,
} from './types';

/**
 * Map raw organization data to AdobeOrg type
 */
export function mapOrganizations(data: RawAdobeOrg[]): AdobeOrg[] {
    return data.map((org: RawAdobeOrg) => ({
        id: org.id,
        code: org.code,
        name: org.name,
        // Preserve selectability inputs so the org-picker can reapply the
        // CLI's filterToSelectableOrgs rule (enterprise ∪ developer-with-RUNTIME)
        // without an extra fetch. Backward compatible: both are optional.
        type: org.type,
        runtime: org.runtime,
    }));
}

/**
 * Map raw project data to AdobeProject type
 */
export function mapProjects(data: RawAdobeProject[]): AdobeProject[] {
    return data.map((proj: RawAdobeProject) => ({
        id: proj.id,
        name: proj.name,
        title: proj.title || proj.name,
        description: proj.description,
        org_id: proj.org_id,
    }));
}

/**
 * Map raw workspace data to AdobeWorkspace type
 */
export function mapWorkspaces(data: RawAdobeWorkspace[]): AdobeWorkspace[] {
    return data.map((ws: RawAdobeWorkspace) => ({
        id: ws.id,
        name: ws.name,
        title: ws.title || ws.name,
    }));
}
