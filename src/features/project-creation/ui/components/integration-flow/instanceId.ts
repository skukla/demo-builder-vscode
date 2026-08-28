/**
 * instanceId — PURE derivation for named AI-built integrations (shell instancing).
 *
 * "Build custom" asks for an integration NAME; the collision-checked instance id
 * derives from it and becomes the folder path (`components/<id>/`), the keyed-state
 * key, and the `deriveOwPackage` input. No React, no wizard-state reads — the modal
 * wires real data into {@link buildReservedIds} and feeds keystrokes through
 * {@link evaluateInstanceName} (CustomStage's evaluate-and-emit shape).
 *
 * The highest-stakes collision class is a name slugging to an app-builder CATALOG
 * id: the executor's catalog-first lookup would clone the WRONG repo. All catalog
 * ids therefore join the reserved domain.
 *
 * @module features/project-creation/ui/components/integration-flow/instanceId
 */

import { RESERVED_EXISTING_KEY, type BlankInstance } from './flowStages';
import { COMPONENT_IDS, MESH_COMPONENT_IDS } from '@/core/constants';
import { normalizeProjectName } from '@/core/validation/normalizers';

const EMPTY_SLUG_MESSAGE = 'Enter a name that includes at least one letter.';
const DUPLICATE_MESSAGE = 'That name is already used by another part of this project.';

/** Caller-supplied pieces of the collision domain (the modal wires real data). */
export interface ReservedIdInputs {
    /** Selected App Builder integration ids (catalog + custom + instances). */
    selectedIntegrationIds: string[];
    /** Keys of the custom-source map (`Object.keys(appBuilderComponentSources)`). */
    sourceIds: string[];
    /** ALL app-builder catalog ids (incl. blank + mesh — wrong-repo clone guard). */
    catalogIds: string[];
    /** Selected addon ids. */
    selectedAddons: string[];
}

/**
 * Derive the instance id (slug) from a display name.
 *
 * Delegates to the project-name normalizer: lowercase, spaces/underscores →
 * hyphens, `[a-z0-9-]` only, must start with a letter. No length cap —
 * `deriveOwPackage` self-truncates long ids downstream.
 *
 * @param name - the raw user-entered integration name
 * @returns the slug ('' when the name has no usable letters)
 */
export function deriveInstanceId(name: string): string {
    return normalizeProjectName(name.trim());
}

/**
 * Assemble the full collision domain for instance-id validation.
 *
 * @param inputs - the caller-supplied id classes (see {@link ReservedIdInputs})
 * @returns the reserved-id set, always including component ids and `'__existing__'`
 */
export function buildReservedIds(inputs: ReservedIdInputs): Set<string> {
    return new Set([
        ...inputs.selectedIntegrationIds,
        ...inputs.sourceIds,
        ...inputs.catalogIds,
        ...Object.values(COMPONENT_IDS),
        ...MESH_COMPONENT_IDS,
        ...inputs.selectedAddons,
        RESERVED_EXISTING_KEY,
    ]);
}

/**
 * Evaluate a raw name against the slug rules and the reserved-id domain.
 *
 * Mirrors CustomStage's evaluate shape: empty/whitespace input is merely
 * incomplete (no instance, no message); an unusable or colliding name carries an
 * inline message; a valid name yields the trimmed display name + derived id.
 *
 * @param raw - the raw field value
 * @param reservedIds - the collision domain from {@link buildReservedIds}
 * @returns the instance on success, or an inline message on invalid input
 */
export function evaluateInstanceName(
    raw: string,
    reservedIds: Set<string>,
): { instance?: BlankInstance; message?: string } {
    const trimmed = raw.trim();
    if (trimmed === '') return {};
    const id = deriveInstanceId(trimmed);
    if (id === '') return { message: EMPTY_SLUG_MESSAGE };
    if (reservedIds.has(id)) return { message: DUPLICATE_MESSAGE };
    return { instance: { id, name: trimmed } };
}

/** The fallback stem when a label has no usable letters (emoji-only, digits-only). */
const FALLBACK_LABEL_STEM = 'custom-integration';

/**
 * Mint an instance from a convenience LABEL — the collision-free counterpart
 * to {@link evaluateInstanceName} for the optional-name model (owner decision
 * 2026-08-27: "The name is a convenience measure for the end user").
 *
 * The machine identity is never the user's problem here: a taken slug gets a
 * numeric suffix silently, and the DISPLAY name gets the same suffix so two
 * default-named additions read "Custom Integration" / "Custom Integration 2"
 * rather than as identical twins. Callers exclude the picked template's own
 * catalog id from the domain — resolving to yourself is not a collision.
 *
 * @param label - the display label (typed, or the caller's default)
 * @param reservedIds - the collision domain from {@link buildReservedIds}
 * @returns the minted `{id, name}` — always succeeds
 */
export function mintInstance(label: string, reservedIds: Set<string>): BlankInstance {
    const name = label.trim();
    const base = deriveInstanceId(name) || FALLBACK_LABEL_STEM;
    if (!reservedIds.has(base)) {
        return { id: base, name };
    }
    let suffix = 2;
    while (reservedIds.has(`${base}-${suffix}`)) {
        suffix++;
    }
    return { id: `${base}-${suffix}`, name: `${name} ${suffix}` };
}
