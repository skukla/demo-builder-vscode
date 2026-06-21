/**
 * Env-Var Classifier (D2 Track B — Step 01)
 *
 * Implements the 3-bucket "what the user provides" rule from D1 findings
 * §"D2 UX rule". Given a deployable's envSchema, partitions each var so the
 * collection UX (Step 04) only ASKS for the residual the user must enter:
 *
 *   1. autoProvisioned — `derivedFrom` (e.g. connect-commerce backend config).
 *      Never asked; derived from already-known config.
 *   2. autoWired       — `providedBy` (another deployable provides it, e.g.
 *      mesh MESH_ENDPOINT → storefront). Never asked; shown as "connected"
 *      (the provider id is carried through for the UI).
 *   3. user-provided   — everything else, split by type into:
 *        - userText   (`type:'text'`)   → Configure UI → componentConfigs → .env
 *        - userSecret (`type:'secret'`) → masked input → VS Code SecretStorage
 *
 * DECISION (Step 01, documented in d2-track-b/step-01.md): `derivedFrom` is
 * treated as autoProvisioned (bucket 1) — seed meshes are all
 * `derivedFrom:'connect-commerce'`, so the classifier yields ZERO
 * userText/userSecret for them ("mesh = zero new input"). A future
 * "derive-or-ask" branch is YAGNI until a deployable needs it.
 *
 * Precedence: providedBy > derivedFrom > type. (A providedBy var is autoWired
 * even when also a secret — it is never collected from the user.)
 *
 * @module features/project-creation/services/envVarClassifier
 */

import type { DeployableEnvVar } from '@/types/deployables';

/** The four buckets a deployable's env schema partitions into. */
export interface ClassifiedEnvSchema {
    /** Derived from known config (bucket 1) — never asked. */
    autoProvisioned: DeployableEnvVar[];
    /** Provided by another deployable (bucket 2) — shown "connected", never asked. */
    autoWired: DeployableEnvVar[];
    /** User-provided non-secret text (bucket 3) — collected into .env. */
    userText: DeployableEnvVar[];
    /** User-provided secret (bucket 3) — collected into SecretStorage. */
    userSecret: DeployableEnvVar[];
}

/**
 * Partition a deployable's env schema into the 3 buckets (secret-split on 3).
 *
 * @param schema - The deployable's envSchema (empty when none declared)
 * @returns The four classified buckets (each empty when nothing matches)
 */
export function classifyEnvSchema(schema: DeployableEnvVar[]): ClassifiedEnvSchema {
    const result: ClassifiedEnvSchema = {
        autoProvisioned: [],
        autoWired: [],
        userText: [],
        userSecret: [],
    };

    for (const envVar of schema) {
        if (envVar.providedBy) {
            result.autoWired.push(envVar);
        } else if (envVar.derivedFrom) {
            result.autoProvisioned.push(envVar);
        } else if (envVar.type === 'secret') {
            result.userSecret.push(envVar);
        } else {
            result.userText.push(envVar);
        }
    }

    return result;
}
