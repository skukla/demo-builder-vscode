/**
 * `add_integration`'s preflight — the handoff a bucket-3 entry hands back.
 *
 * WHY A SEPARATE FILE. The catalog loader is MOCKED here, and measured against
 * the real one (actionDescriptors.test.ts) no shipped entry declares a
 * user-supplied env var — so the branch this file covers cannot be reached with
 * today's config. Mocking the loader is the only way to exercise it, and doing
 * that in the catalog-truth suite would destroy the assertion that makes that
 * suite worth having.
 *
 * WHAT THE BRANCH IS FOR. `handleAddAppBuilderComponent` routes a bucket-3 entry
 * (an `envSchema` with `userText`/`userSecret` vars) to Configure rather than
 * deploying with blanks. Reached through an MCP tool, that would pop a panel in
 * the user's editor for a call they did not make and answer the agent with
 * nothing. `preflight` runs BEFORE dispatch, so the handler never runs and the
 * agent gets an instruction instead of a silent panel.
 */

import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';

/** The bucket-3 entry the shipped catalog does not (yet) contain. */
const ERP_ENTRY: AppBuilderComponentCatalogEntry = {
    id: 'erp-sync',
    name: 'ERP Sync',
    description: 'Sync an ERP',
    kind: 'integration',
    source: { owner: 'acme', repo: 'erp-sync', branch: 'main' },
    envSchema: [
        { name: 'ERP_BASE_URL', type: 'text', label: 'ERP base URL' },
        { name: 'ERP_API_KEY', type: 'secret', label: 'ERP API key' },
        // Auto-wired — must NOT appear in the handoff; the user supplies nothing.
        { name: 'MESH_ENDPOINT', type: 'text', label: 'Mesh endpoint', providedBy: 'eds-accs-mesh' },
    ],
};

/** Text-only bucket 3: no secret, so the reason must not claim there is one. */
const TEXT_ONLY_ENTRY: AppBuilderComponentCatalogEntry = {
    ...ERP_ENTRY,
    id: 'text-only',
    name: 'Text Only',
    envSchema: [{ name: 'ERP_BASE_URL', type: 'text', label: 'ERP base URL' }],
};

const mockGetEntry = jest.fn();
jest.mock('@/features/project-creation/services/appBuilderComponentCatalogLoader', () => ({
    ...jest.requireActual('@/features/project-creation/services/appBuilderComponentCatalogLoader'),
    getAppBuilderComponentEntry: (...a: unknown[]) => mockGetEntry(...a),
}));

// `require`, not a static import: the descriptor module reads the catalog loader
// through the handler at module load, so it must be pulled in AFTER the mock above.
const { ACTION_DESCRIPTORS } = require('@/features/ai/server/actionDescriptors');

type Handoff = { needsUser: Record<string, unknown> };

const preflight = (args: Record<string, unknown>): Handoff | undefined =>
    ACTION_DESCRIPTORS.find(
        (d: { tool: string }) => d.tool === 'add_integration',
    )!.preflight!(args) as Handoff | undefined;

beforeEach(() => {
    jest.clearAllMocks();
});

describe('add_integration preflight — bucket-3 entries hand back to the user', () => {
    it('returns a needsUser handoff pointing at Configure Project', () => {
        mockGetEntry.mockReturnValue(ERP_ENTRY);

        const out = preflight({ id: 'erp-sync' })!;

        expect(out.needsUser).toMatchObject({
            reason: 'secret-entry',
            where: { command: 'demoBuilder.configureProject' },
            // A confirming READ, like the two shipped handoffs — it reports which
            // of the component's vars are still unset, so the agent knows whether
            // retrying the add will work instead of guessing.
            resumeWith: 'get_component_requirements',
        });
    });

    it('names every var the user must supply, and only those', () => {
        mockGetEntry.mockReturnValue(ERP_ENTRY);

        const { needsUser } = preflight({ id: 'erp-sync' })!;
        const said = `${needsUser.what} ${needsUser.tellUser}`;

        expect(said).toContain('ERP_BASE_URL');
        expect(said).toContain('ERP_API_KEY');
        expect(said).toContain('ERP Sync');
        // Auto-wired vars are supplied by another component. Listing one would
        // send the user looking for a value they are not meant to type.
        expect(said).not.toContain('MESH_ENDPOINT');
    });

    it('says outright that nothing was added', () => {
        mockGetEntry.mockReturnValue(ERP_ENTRY);

        const { needsUser } = preflight({ id: 'erp-sync' })!;

        // The whole defect was a success report for work that did not happen.
        expect(String(needsUser.tellUser)).toMatch(/nothing (has been|was) added/i);
    });

    it('does not claim a secret when every var is plain text', () => {
        mockGetEntry.mockReturnValue(TEXT_ONLY_ENTRY);

        const { needsUser } = preflight({ id: 'text-only' })!;

        expect(needsUser.reason).toBe('config-entry');
        expect(String(needsUser.what)).toContain('ERP_BASE_URL');
    });

    it('control: an entry with no user vars dispatches instead of handing back', () => {
        mockGetEntry.mockReturnValue({ ...ERP_ENTRY, envSchema: [] });

        expect(preflight({ id: 'erp-sync' })).toBeUndefined();
    });
});
