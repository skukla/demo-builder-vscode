/**
 * Which Commerce backend a project runs, as the Data Installer's requests need it.
 *
 * This replaced the per-backend credential resolution that used to open every datapack
 * write. The service stopped accepting a caller's Commerce credentials on purpose (its
 * security fix, DEMOSYS-1698) and signs in with its own, so a write needs only to know
 * WHICH backend it addresses: an ACCS export still names the ACCS scope, and a project
 * with no Commerce backend still has nothing to write to (DI-6, 2026-10-28).
 *
 * @module features/data-installer/services/commerceBackend
 */

/** The two backends a datapack can be written to. */
export type CommerceBackend = 'paas' | 'accs';

/** Backend component ids, as they appear on a stack in `stacks.json`. */
const BACKENDS: Record<string, CommerceBackend> = {
    'adobe-commerce-paas': 'paas',
    'adobe-commerce-accs': 'accs',
};

/**
 * The project's Commerce backend, or undefined when it has none.
 *
 * Reads the persisted `componentSelections.backend`, the field every real project carries.
 *
 * @param project - A persisted project, or any shape carrying its component selections
 * @returns The backend, or undefined for a project with no Commerce backend
 */
export function commerceBackendOf(project: {
    componentSelections?: { backend?: string };
}): CommerceBackend | undefined {
    return BACKENDS[project.componentSelections?.backend ?? ''];
}
