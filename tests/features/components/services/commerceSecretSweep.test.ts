/**
 * Existing projects converge without anyone opening Configure.
 *
 * Phase 3 of `.rptc/complete/component-secret-routing/`. Phase 2 only moves a
 * credential when a project is created or saved, and the plan rejects relying on
 * that: *"may never converge, and 'eventually stops leaking' is not a property
 * worth designing for when the file is plaintext on disk."*
 *
 * This runs on the activation path over every project on disk, so the two
 * properties that matter are blast radius, not happy path:
 *
 * - **It saves only what it changed.** Otherwise activation rewrites every
 *   manifest and bumps every mtime, every launch, forever.
 * - **One bad project does not stop the rest.** A sweep that aborts on the first
 *   failure converges nothing on the machine where it matters most.
 */

// The REAL migration still runs — this only records that it was called, so the
// "does nothing at all" guard can be asserted as work not done rather than as an
// outcome that happens to look the same.
jest.mock('@/features/components/services/commerceSecretMigration', () => {
    const actual = jest.requireActual('@/features/components/services/commerceSecretMigration');
    return { ...actual, migrateDeclaredSecrets: jest.fn(actual.migrateDeclaredSecrets) };
});

import { sweepCommerceSecrets } from '@/features/components/services/commerceSecretSweep';
import { migrateDeclaredSecrets } from '@/features/components/services/commerceSecretMigration';

const migrateMock = migrateDeclaredSecrets as jest.Mock;

const FAKE_SECRET = 'fake-test-pw-not-a-secret';

function workingStore() {
    const map = new Map<string, string>();
    return {
        store: jest.fn(async (k: string, v: string) => void map.set(k, v)),
        get: jest.fn(async (k: string) => map.get(k)),
        delete: jest.fn(async (k: string) => void map.delete(k)),
    };
}

const withSecret = (path: string) => ({
    path,
    componentConfigs: {
        'adobe-commerce-accs': {
            ACCS_OAUTH_CLIENT_ID: 'id',
            ACCS_OAUTH_CLIENT_SECRET: FAKE_SECRET,
        },
    },
});

const withoutSecret = (path: string) => ({
    path,
    componentConfigs: { 'adobe-commerce-accs': { ACCS_OAUTH_CLIENT_ID: 'id' } },
});

describe('converging', () => {
    it('moves the secret and saves the project', async () => {
        const saveProject = jest.fn(async () => {});
        const projects = [withSecret('/p/one')];

        const result = await sweepCommerceSecrets({
            projects,
            secrets: workingStore(),
            saveProject,
        });

        expect(result.converged).toBe(1);
        expect(saveProject).toHaveBeenCalledTimes(1);
        expect(
            projects[0].componentConfigs['adobe-commerce-accs'],
        ).not.toHaveProperty('ACCS_OAUTH_CLIENT_SECRET');
    });

    it('converges several projects in one pass', async () => {
        const saveProject = jest.fn(async () => {});

        const result = await sweepCommerceSecrets({
            projects: [withSecret('/p/one'), withSecret('/p/two'), withSecret('/p/three')],
            secrets: workingStore(),
            saveProject,
        });

        expect(result.converged).toBe(3);
    });
});

describe('blast radius', () => {
    it('does NOT save a project it did not change', async () => {
        // Activation runs this every launch. Saving unchanged projects would
        // rewrite every manifest on disk, forever, for nothing.
        const saveProject = jest.fn(async () => {});

        const result = await sweepCommerceSecrets({
            projects: [withoutSecret('/p/clean')],
            secrets: workingStore(),
            saveProject,
        });

        expect(saveProject).not.toHaveBeenCalled();
        expect(result.converged).toBe(0);
    });

    it('saves only the projects that changed, out of a mixed set', async () => {
        const saved: string[] = [];
        const saveProject = jest.fn(async (p: { path: string }) => void saved.push(p.path));

        await sweepCommerceSecrets({
            projects: [withoutSecret('/p/clean'), withSecret('/p/dirty')],
            secrets: workingStore(),
            saveProject,
        });

        expect(saved).toEqual(['/p/dirty']);
    });

    it('does nothing at all without SecretStorage', async () => {
        const saveProject = jest.fn(async () => {});
        const log = jest.fn();
        const projects = [withSecret('/p/one')];

        const result = await sweepCommerceSecrets({
            projects,
            secrets: undefined,
            saveProject,
            log,
        });

        expect(saveProject).not.toHaveBeenCalled();
        // Returns the zero counts rather than falling through to the loop with
        // no store — a project must be left exactly as it was.
        expect(result).toStrictEqual({ converged: 0, retained: 0 });
        expect(projects[0].componentConfigs['adobe-commerce-accs'].ACCS_OAUTH_CLIENT_SECRET).toBe(
            FAKE_SECRET,
        );
        expect(log).not.toHaveBeenCalled();
    });

    it('does not even attempt a migration without SecretStorage', async () => {
        // The guard is what makes "nothing at all" true. Without it the sweep
        // walks every project and calls the migration with no store — which
        // returns the configs untouched, so the only visible difference is the
        // work itself.
        migrateMock.mockClear();

        await sweepCommerceSecrets({
            projects: [withSecret('/p/one'), withSecret('/p/two')],
            secrets: undefined,
            saveProject: jest.fn(async () => {}),
        });

        expect(migrateMock).not.toHaveBeenCalled();
    });
});

describe('one bad project does not stop the rest', () => {
    it('continues after a save failure', async () => {
        const saveProject = jest.fn(async (p: { path: string }) => {
            if (p.path === '/p/one') throw new Error('disk full');
        });

        const result = await sweepCommerceSecrets({
            projects: [withSecret('/p/one'), withSecret('/p/two')],
            secrets: workingStore(),
            saveProject,
        });

        expect(saveProject).toHaveBeenCalledTimes(2);
        // The failed project is COUNTED as retained, not silently dropped.
        expect(result).toStrictEqual({ converged: 1, retained: 1 });
    });

    it('continues after a store failure, leaving that credential in place', async () => {
        const secrets = {
            store: jest.fn(async () => {
                throw new Error('keychain locked');
            }),
            get: jest.fn(async () => undefined),
            delete: jest.fn(async () => undefined),
        };
        const projects = [withSecret('/p/one'), withSecret('/p/two')];
        const saveProject = jest.fn(async () => {});

        const result = await sweepCommerceSecrets({ projects, secrets, saveProject });

        expect(result.converged).toBe(0);
        expect(result.retained).toBe(2);
        // The credential still works — it is exactly where it was.
        expect(projects[0].componentConfigs['adobe-commerce-accs'].ACCS_OAUTH_CLIENT_SECRET).toBe(
            FAKE_SECRET,
        );
    });
});

describe('idempotence', () => {
    it('a second activation converges nothing and saves nothing', async () => {
        const secrets = workingStore();
        const saveProject = jest.fn(async () => {});
        const projects = [withSecret('/p/one')];

        await sweepCommerceSecrets({ projects, secrets, saveProject });
        saveProject.mockClear();

        const second = await sweepCommerceSecrets({ projects, secrets, saveProject });

        expect(second.converged).toBe(0);
        expect(saveProject).not.toHaveBeenCalled();
    });
});

/**
 * The summary line is emitted only when the sweep DID something.
 *
 * This runs on every activation over every project on disk, so a sweep that
 * changed nothing must say nothing — otherwise the debug channel carries a line
 * per launch, forever, that never means anything. Both halves of the condition
 * matter: either count alone is enough to be worth reporting.
 */
describe('reporting', () => {
    it('reports a sweep that converged a project', async () => {
        const log = jest.fn();

        const result = await sweepCommerceSecrets({
            projects: [withSecret('/p/one')],
            secrets: workingStore(),
            saveProject: jest.fn(async () => {}),
            log,
        });

        expect(result).toStrictEqual({ converged: 1, retained: 0 });
        expect(log).toHaveBeenCalledTimes(1);
    });

    it('reports a sweep that converged nothing but retained a value', async () => {
        const log = jest.fn();
        const secrets = {
            store: jest.fn(async () => {
                throw new Error('keychain locked');
            }),
            get: jest.fn(async () => undefined),
            delete: jest.fn(async () => undefined),
        };

        const result = await sweepCommerceSecrets({
            projects: [withSecret('/p/one')],
            secrets,
            saveProject: jest.fn(async () => {}),
            log,
        });

        expect(result).toStrictEqual({ converged: 0, retained: 1 });
        expect(log).toHaveBeenCalledTimes(1);
    });

    it('says nothing when the sweep changed and retained nothing', async () => {
        const log = jest.fn();

        const result = await sweepCommerceSecrets({
            projects: [withoutSecret('/p/clean')],
            secrets: workingStore(),
            saveProject: jest.fn(async () => {}),
            log,
        });

        expect(result).toStrictEqual({ converged: 0, retained: 0 });
        expect(log).not.toHaveBeenCalled();
    });
});
