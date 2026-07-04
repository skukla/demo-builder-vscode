/**
 * Project Ownership Tests
 *
 * Tests for the ownership plumbing that decides which Console projects the
 * current user may delete:
 *  - resolveCurrentImsUserId: token inspection → user_id (fail closed)
 *  - isProjectOwnedBy: case-insensitive who_created vs token user_id
 *  - stampProjectsDeletable: stamps `deletable` on projects sent to the webview
 */

import {
    isProjectOwnedBy,
    resolveCurrentImsUserId,
    stampProjectsDeletable,
    verifyProjectOwnership,
    type OwnershipAuthService,
    type OwnershipProjectSource,
} from '@/features/authentication/services/projectOwnership';
import type { AdobeProject } from '@/types/webview';
import {
    makeJwt,
    TEST_OTHER_USER_ID as OTHER_USER_ID,
    TEST_USER_ID as USER_ID,
} from '../imsTestTokens';

/** Auth-service stub exposing exactly the token surface the module uses. */
function createAuthService(
    inspection: { valid: boolean; expiresIn: number; token?: string },
): OwnershipAuthService {
    return {
        getTokenManager: () => ({
            inspectToken: jest.fn().mockResolvedValue(inspection),
        }),
    };
}

const ownedAuthService = () =>
    createAuthService({ valid: true, expiresIn: 60, token: makeJwt({ user_id: USER_ID }) });

function makeProject(overrides: Partial<AdobeProject> = {}): AdobeProject {
    return {
        id: 'proj-1',
        name: 'project-1',
        title: 'Project One',
        org_id: 'org-123',
        ...overrides,
    };
}

describe('resolveCurrentImsUserId', () => {
    it('should return the token user_id when the inspection is valid', async () => {
        await expect(resolveCurrentImsUserId(ownedAuthService())).resolves.toBe(USER_ID);
    });

    it('should return undefined when the token is invalid', async () => {
        const authService = createAuthService({
            valid: false,
            expiresIn: 0,
            token: makeJwt({ user_id: USER_ID }),
        });

        await expect(resolveCurrentImsUserId(authService)).resolves.toBeUndefined();
    });

    it('should return undefined when the inspection carries no token', async () => {
        const authService = createAuthService({ valid: true, expiresIn: 60 });

        await expect(resolveCurrentImsUserId(authService)).resolves.toBeUndefined();
    });

    it('should return undefined when the token is not a JWT', async () => {
        const authService = createAuthService({ valid: true, expiresIn: 60, token: 'opaque-token' });

        await expect(resolveCurrentImsUserId(authService)).resolves.toBeUndefined();
    });

    it('should return undefined when the auth service is missing', async () => {
        await expect(resolveCurrentImsUserId(undefined)).resolves.toBeUndefined();
    });

    it('should return undefined when getTokenManager is unavailable (fail closed, no throw)', async () => {
        await expect(resolveCurrentImsUserId({} as OwnershipAuthService)).resolves.toBeUndefined();
    });

    it('should return undefined when inspectToken rejects (fail closed, no throw)', async () => {
        const authService: OwnershipAuthService = {
            getTokenManager: () => ({
                inspectToken: jest.fn().mockRejectedValue(new Error('CLI unavailable')),
            }),
        };

        await expect(resolveCurrentImsUserId(authService)).resolves.toBeUndefined();
    });
});

describe('isProjectOwnedBy', () => {
    it('should return true for an exact match', () => {
        expect(isProjectOwnedBy(USER_ID, USER_ID)).toBe(true);
    });

    it('should match case-insensitively', () => {
        expect(isProjectOwnedBy(USER_ID.toLowerCase(), USER_ID.toUpperCase())).toBe(true);
    });

    it('should return false for a different user', () => {
        expect(isProjectOwnedBy(OTHER_USER_ID, USER_ID)).toBe(false);
    });

    it('should return false when who_created is missing (fail closed)', () => {
        expect(isProjectOwnedBy(undefined, USER_ID)).toBe(false);
        expect(isProjectOwnedBy('', USER_ID)).toBe(false);
    });

    it('should return false when the user id is unknown (fail closed)', () => {
        expect(isProjectOwnedBy(USER_ID, undefined)).toBe(false);
    });

    it('should return false when both sides are missing (never vacuously true)', () => {
        expect(isProjectOwnedBy(undefined, undefined)).toBe(false);
    });
});

describe('stampProjectsDeletable', () => {
    it('should stamp deletable=true on projects created by the current user', async () => {
        const projects = [makeProject({ who_created: USER_ID })];

        const stamped = await stampProjectsDeletable(ownedAuthService(), projects);

        expect(stamped).toEqual([expect.objectContaining({ id: 'proj-1', deletable: true })]);
    });

    it('should match who_created case-insensitively', async () => {
        const projects = [makeProject({ who_created: USER_ID.toLowerCase() })];

        const stamped = await stampProjectsDeletable(ownedAuthService(), projects);

        expect(stamped[0].deletable).toBe(true);
    });

    it('should stamp deletable=false on projects created by another user', async () => {
        const projects = [makeProject({ who_created: OTHER_USER_ID })];

        const stamped = await stampProjectsDeletable(ownedAuthService(), projects);

        expect(stamped[0].deletable).toBe(false);
    });

    it('should stamp deletable=false when who_created is missing (fail closed)', async () => {
        const projects = [makeProject()];

        const stamped = await stampProjectsDeletable(ownedAuthService(), projects);

        expect(stamped[0].deletable).toBe(false);
    });

    it('should stamp deletable=false on ALL projects when the token is invalid', async () => {
        const authService = createAuthService({ valid: false, expiresIn: 0 });
        const projects = [
            makeProject({ id: 'p1', who_created: USER_ID }),
            makeProject({ id: 'p2', who_created: OTHER_USER_ID }),
        ];

        const stamped = await stampProjectsDeletable(authService, projects);

        expect(stamped.map((p) => p.deletable)).toEqual([false, false]);
    });

    it('should stamp deletable=false on ALL projects when the auth service is missing', async () => {
        const projects = [makeProject({ who_created: USER_ID })];

        const stamped = await stampProjectsDeletable(undefined, projects);

        expect(stamped[0].deletable).toBe(false);
    });

    it('should stamp a mixed list row-by-row', async () => {
        const projects = [
            makeProject({ id: 'mine', who_created: USER_ID }),
            makeProject({ id: 'theirs', who_created: OTHER_USER_ID }),
            makeProject({ id: 'unknown' }),
        ];

        const stamped = await stampProjectsDeletable(ownedAuthService(), projects);

        expect(stamped.map((p) => [p.id, p.deletable])).toEqual([
            ['mine', true],
            ['theirs', false],
            ['unknown', false],
        ]);
    });

    it('should preserve all project fields and list order', async () => {
        const projects = [
            makeProject({ id: 'a', description: 'Alpha', who_created: USER_ID }),
            makeProject({ id: 'b', description: 'Beta' }),
        ];

        const stamped = await stampProjectsDeletable(ownedAuthService(), projects);

        expect(stamped).toEqual([
            { ...projects[0], deletable: true },
            { ...projects[1], deletable: false },
        ]);
    });

    it('should not mutate the input array or its items', async () => {
        const project = makeProject({ who_created: USER_ID });
        const projects = [project];

        await stampProjectsDeletable(ownedAuthService(), projects);

        expect(project).not.toHaveProperty('deletable');
    });

    it('should return an empty list for an empty input', async () => {
        await expect(stampProjectsDeletable(ownedAuthService(), [])).resolves.toEqual([]);
    });
});

describe('verifyProjectOwnership', () => {
    const TARGET = { orgId: 'org-123', projectId: 'proj-1' };

    /** Project source stub: token inspection + org-scoped project list. */
    function createProjectSource(
        projects: AdobeProject[] | (() => Promise<AdobeProject[]>),
        inspection = { valid: true, expiresIn: 60, token: makeJwt({ user_id: USER_ID }) },
    ): OwnershipProjectSource & { getProjects: jest.Mock } {
        return {
            ...createAuthService(inspection),
            getProjects: typeof projects === 'function'
                ? jest.fn().mockImplementation(projects)
                : jest.fn().mockResolvedValue(projects),
        };
    }

    it('should return true when the target project was created by the token user', async () => {
        const source = createProjectSource([makeProject({ who_created: USER_ID })]);

        await expect(verifyProjectOwnership(source, TARGET)).resolves.toBe(true);
        expect(source.getProjects).toHaveBeenCalledWith({ orgId: 'org-123' });
    });

    it('should match who_created case-insensitively', async () => {
        const source = createProjectSource([makeProject({ who_created: USER_ID.toLowerCase() })]);

        await expect(verifyProjectOwnership(source, TARGET)).resolves.toBe(true);
    });

    it('should return false when the project was created by another user', async () => {
        const source = createProjectSource([makeProject({ who_created: OTHER_USER_ID })]);

        await expect(verifyProjectOwnership(source, TARGET)).resolves.toBe(false);
    });

    it('should return false when who_created is missing (fail closed)', async () => {
        const source = createProjectSource([makeProject()]);

        await expect(verifyProjectOwnership(source, TARGET)).resolves.toBe(false);
    });

    it('should return false when the project is not in the org list (fail closed)', async () => {
        const source = createProjectSource([makeProject({ id: 'someone-elses', who_created: USER_ID })]);

        await expect(verifyProjectOwnership(source, TARGET)).resolves.toBe(false);
    });

    it('should return false when the token is invalid — without fetching projects', async () => {
        const source = createProjectSource(
            [makeProject({ who_created: USER_ID })],
            { valid: false, expiresIn: 0, token: makeJwt({ user_id: USER_ID }) },
        );

        await expect(verifyProjectOwnership(source, TARGET)).resolves.toBe(false);
        expect(source.getProjects).not.toHaveBeenCalled();
    });

    it('should return false when the project fetch rejects (fail closed, no throw)', async () => {
        const source = createProjectSource(() => Promise.reject(new Error('network down')));

        await expect(verifyProjectOwnership(source, TARGET)).resolves.toBe(false);
    });

    it('should return false when the auth service is missing', async () => {
        await expect(verifyProjectOwnership(undefined, TARGET)).resolves.toBe(false);
    });
});
