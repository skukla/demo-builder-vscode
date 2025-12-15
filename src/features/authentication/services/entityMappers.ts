import type {
    AdobeOrg,
    AdobeProject,
    AdobeWorkspace,
    RawAdobeOrg,
    RawAdobeProject,
    RawAdobeWorkspace,
} from '@/features/authentication/services/types';

/**
 * Map raw organization data from SDK/CLI to AdobeOrg type
 */
export function mapOrganizations(data: RawAdobeOrg[]): AdobeOrg[] {
    return data.map((org: RawAdobeOrg) => ({
        id: org.id,
        code: org.code,
        name: org.name,
    }));
}

/**
 * Map raw project data from SDK/CLI to AdobeProject type
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
 * Map raw workspace data from SDK/CLI to AdobeWorkspace type
 */
export function mapWorkspaces(data: RawAdobeWorkspace[]): AdobeWorkspace[] {
    return data.map((ws: RawAdobeWorkspace) => ({
        id: ws.id,
        name: ws.name,
        title: ws.title || ws.name,
    }));
}
