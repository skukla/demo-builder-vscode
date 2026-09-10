/**
 * Narrow views of `HelixService`, named where several callers need the same one.
 *
 * Four modules independently declared an identical one-method interface for the
 * code-preview call while converting away from module mocks — the Rule of Three,
 * reached and passed. They import this instead.
 *
 * A capability belongs here once a SECOND module needs the same one. A view used by
 * exactly one module stays in that module, beside the code whose need defines it.
 *
 * `HelixService` satisfies each of these structurally, so production callers pass the
 * real service and nothing here has to know about it.
 *
 * @module features/eds/services/helix/helixCapabilities
 */

/**
 * Publish code to the CDN — `previewCode`.
 *
 * Four callers: the reset's config step, the config sync, the authoring-experience
 * flip's Quick Edit vendoring, and the GitHub App check's code-sync trigger.
 */
export interface HelixCodePreview {
    previewCode(org: string, site: string, path?: string, branch?: string): Promise<void>;
}
