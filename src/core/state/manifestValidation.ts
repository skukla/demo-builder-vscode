/**
 * Manifest shape validation — WARN mode, never a gate.
 *
 * The `.demo-builder.json` manifest is USER-machine data written by any
 * historical extension version; before this existed the loader parse-CAST it
 * to `ProjectManifest` and the whole extension trusted the result (the same
 * silenced-check class as the bundled-config casts, with a bigger blast
 * radius — see `.rptc/research/unenforced-seams/research.md` seam #1).
 *
 * The schema is GENERATED from the `ProjectManifest` interface
 * (`scripts/generate-manifest-schema.js`; freshness pinned by
 * `tests/templates/manifest-schema-freshness.test.ts`), so interface and
 * check cannot drift. Deliberately tolerant: unknown fields pass (manifests
 * cross versions in both directions), and validation NEVER refuses a load —
 * a wrong-shaped manifest loads best-effort exactly as before, with the
 * drift named in the Debug Logs instead of surfacing weeks later as a
 * mystery symptom.
 *
 * @module core/state/manifestValidation
 */

import Ajv, { type ValidateFunction } from 'ajv';
import manifestSchema from './config/manifest.schema.json';

/** Log-flood guard: a mangled manifest reports the first N issues + a count. */
const MAX_REPORTED_ISSUES = 10;

let compiled: ValidateFunction | null = null;

function getValidator(): ValidateFunction {
    if (!compiled) {
        // strict:false — the generated schema carries formats (date-time) we
        // do not ship format plugins for; they are documentation, not checks.
        const ajv = new Ajv({ allErrors: true, strict: false });

        // Say that out loud to Ajv, rather than only in the comment above.
        // `strict: false` stops the format being an ERROR but Ajv still logs
        // `unknown format "date-time" ignored` every time this schema compiles —
        // which is a real logged warning, and it was the single largest source
        // of console noise in the suite: ten test files carried it.
        //
        // Registering it as always-valid encodes the decision already made here
        // (the field is ours, written by us, and documented rather than checked)
        // without reaching for `logger: false`, which would also swallow
        // warnings about genuine schema mistakes.
        //
        // If date-time should actually be VALIDATED, the change is to add
        // `ajv-formats` and drop this line — a deliberate tightening, not a
        // silencing, and not something to do while chasing log noise.
        ajv.addFormat('date-time', true);

        compiled = ajv.compile(manifestSchema);
    }
    return compiled;
}

/**
 * Validate a parsed manifest against the generated ProjectManifest schema.
 *
 * @param manifest - the raw parsed JSON (unknown on purpose — this runs
 *   BEFORE the cast the loader used to make blindly)
 * @returns human-readable issue strings (empty = shape-conformant). Never
 *   throws; callers log these as warnings and continue loading.
 */
export function validateManifestShape(manifest: unknown): string[] {
    try {
        const validate = getValidator();
        if (validate(manifest)) {
            return [];
        }
        const errors = validate.errors ?? [];
        const issues = errors
            .slice(0, MAX_REPORTED_ISSUES)
            .map((e) => `${e.instancePath || '/'} ${e.message ?? 'invalid'}`);
        if (errors.length > MAX_REPORTED_ISSUES) {
            issues.push(`(+${errors.length - MAX_REPORTED_ISSUES} more issues)`);
        }
        return issues;
    } catch (error) {
        // The check must never be the thing that breaks a load.
        return [`manifest validation itself failed: ${String(error)}`];
    }
}
