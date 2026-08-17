/**
 * Converge every existing project onto SecretStorage, without waiting for a save.
 *
 * Phase 3 of `.rptc/complete/component-secret-routing/`. Phase 2 moves a credential
 * when a project is created or its config is saved; on its own that "may never
 * converge, and *eventually stops leaking* is not a property worth designing for
 * when the file is plaintext on disk" — the plan's words, and the reason this
 * exists rather than relying on users happening to open Configure.
 *
 * Safety is inherited, not re-invented: this runs the SAME verified write-through
 * as every other path (`migrateDeclaredSecrets`), so a project's credential is
 * never in neither place, and a store that cannot be written leaves the project
 * exactly as it was.
 *
 * Two things it deliberately does NOT do:
 *
 * - **Save a project it did not change.** A no-op project is skipped entirely, so
 *   activation does not rewrite every manifest on disk and bump every mtime.
 * - **Fail loudly.** A project that cannot converge is logged at debug and left
 *   alone. It still works — its credential is where it always was — and an
 *   activation-path error dialog for a hardening pass is worse than the leak.
 *
 * @module features/components/services/commerceSecretSweep
 */

import { migrateDeclaredSecrets, type SecretWriter } from './commerceSecretMigration';

/** The project shape this sweep touches. */
export interface SweepableProject {
    path: string;
    componentConfigs?: Record<string, Record<string, string | number | boolean | undefined>>;
}

export interface SecretSweepDeps<T extends SweepableProject> {
    projects: T[];
    secrets: SecretWriter | undefined;
    /** Persists a project whose configs changed. Only called for changed ones. */
    saveProject: (project: T) => Promise<void>;
    log?: (line: string) => void;
}

export interface SweepResult {
    /** Projects whose configs changed and were saved. */
    converged: number;
    /** Secrets that could not be verified and were left in place. */
    retained: number;
}

/**
 * Move declared secrets out of every project's config map.
 *
 * @returns counts only — never project paths or var values, since this line can
 *          reach a log a user pastes into a ticket
 */
export async function sweepCommerceSecrets<T extends SweepableProject>(
    deps: SecretSweepDeps<T>,
): Promise<SweepResult> {
    const { projects, secrets, saveProject, log } = deps;
    let converged = 0;
    let retained = 0;

    if (!secrets) {
        return { converged, retained };
    }

    for (const project of projects) {
        try {
            const outcome = await migrateDeclaredSecrets(
                project.componentConfigs,
                project.path,
                secrets,
            );
            retained += outcome.retained.length;

            // Nothing moved means nothing to persist. Saving anyway would rewrite
            // every manifest on every activation for no change.
            if (outcome.moved.length === 0) continue;

            project.componentConfigs = outcome.sanitizedConfigs as T['componentConfigs'];
            await saveProject(project);
            converged += 1;
        } catch {
            // One project's failure must not stop the rest. Its credential is
            // untouched, so the only cost is that it converges later.
            retained += 1;
        }
    }

    if (converged > 0 || retained > 0) {
        log?.(`secret sweep: ${converged} project(s) converged, ${retained} value(s) retained`);
    }
    return { converged, retained };
}
