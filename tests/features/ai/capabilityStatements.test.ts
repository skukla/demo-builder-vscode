/**
 * Capability Statements Tests (Batch E2)
 *
 * Pure helper that derives user-facing capability statements from a list of
 * SkillInventoryEntry. The output should:
 *   - Trim "Use this skill to ", "Use when ", "Used for ", "Used to ", "This skill " prefixes
 *   - Strip known boilerplate suffix clauses
 *   - Take only the first sentence
 *   - Capitalize the first letter
 *   - Strip a trailing period
 *   - Deduplicate by first occurrence
 *   - Order demo-builder-source first, adobe-source second
 */

import { deriveCapabilityStatements } from '@/features/ai/capabilityStatements';
import type { SkillInventoryEntry } from '@/types/ai';

function makeSkill(overrides: Partial<SkillInventoryEntry> = {}): SkillInventoryEntry {
    return {
        name: 'test-skill',
        description: 'A test description.',
        path: '/p/.claude/skills/test-skill.md',
        source: 'demo-builder',
        ...overrides,
    };
}

describe('deriveCapabilityStatements (Batch E2)', () => {
    it('returns an empty array for empty input', () => {
        expect(deriveCapabilityStatements([])).toEqual([]);
    });

    it('returns one statement for a single skill with a description', () => {
        const skills = [makeSkill({ description: 'Adds a thing.' })];
        expect(deriveCapabilityStatements(skills)).toEqual(['Adds a thing']);
    });

    it('omits skills with null description', () => {
        const skills = [
            makeSkill({ name: 'with-desc', description: 'Adds a thing.' }),
            makeSkill({ name: 'no-desc', description: null }),
        ];
        expect(deriveCapabilityStatements(skills)).toEqual(['Adds a thing']);
    });

    it('omits skills with empty-string description', () => {
        const skills = [
            makeSkill({ name: 'with-desc', description: 'Adds a thing.' }),
            makeSkill({ name: 'empty-desc', description: '' }),
        ];
        expect(deriveCapabilityStatements(skills)).toEqual(['Adds a thing']);
    });

    it('strips the " in a Demo Builder project" boilerplate suffix', () => {
        const skills = [
            makeSkill({
                description: 'Adds or enables a component in a Demo Builder project by writing component values.',
            }),
        ];
        const result = deriveCapabilityStatements(skills);
        expect(result).toEqual(['Adds or enables a component']);
    });

    it('strips the " for Adobe Commerce storefronts" boilerplate suffix', () => {
        const skills = [
            makeSkill({
                description: 'Develops and customizes EDS blocks for Adobe Commerce storefronts. Use when building blocks.',
            }),
        ];
        const result = deriveCapabilityStatements(skills);
        expect(result).toEqual(['Develops and customizes EDS blocks']);
    });

    it('strips the "Use this skill to " prefix and capitalizes', () => {
        const skills = [
            makeSkill({
                description: 'Use this skill to update Commerce or service credentials.',
            }),
        ];
        const result = deriveCapabilityStatements(skills);
        expect(result).toEqual(['Update Commerce or service credentials']);
    });

    it('preserves a description with no trimmable prefix or suffix (minus trailing period)', () => {
        const skills = [
            makeSkill({ description: 'Manages project credentials.' }),
        ];
        expect(deriveCapabilityStatements(skills)).toEqual(['Manages project credentials']);
    });

    it('deduplicates duplicate statements, preserving first-occurrence order', () => {
        const skills = [
            makeSkill({ name: 'a', description: 'Adds a component.' }),
            makeSkill({ name: 'b', description: 'Adds a component.' }),
            makeSkill({ name: 'c', description: 'Updates credentials.' }),
        ];
        const result = deriveCapabilityStatements(skills);
        expect(result).toEqual(['Adds a component', 'Updates credentials']);
    });

    it('orders demo-builder-source entries before adobe-source entries', () => {
        const skills: SkillInventoryEntry[] = [
            makeSkill({
                name: 'aem-block-developer',
                source: 'adobe',
                description: 'Develops EDS blocks for Adobe Commerce storefronts.',
                path: '/p/.claude/skills/aem-block-developer/SKILL.md',
            }),
            makeSkill({
                name: 'add-component',
                source: 'demo-builder',
                description: 'Adds a component to a project.',
                path: '/p/.claude/skills/add-component.md',
            }),
        ];
        const result = deriveCapabilityStatements(skills);
        expect(result).toEqual(['Adds a component to a project', 'Develops EDS blocks']);
    });

    it('strips a trailing period when present', () => {
        const skills = [makeSkill({ description: 'Adds a thing.' })];
        const result = deriveCapabilityStatements(skills);
        // No trailing period in the rendered statement
        expect(result[0].endsWith('.')).toBe(false);
    });

    it('handles skills from "unknown" source with no special treatment', () => {
        const skills = [
            makeSkill({
                name: 'mystery',
                source: 'unknown',
                description: 'Does something mysterious.',
            }),
        ];
        expect(deriveCapabilityStatements(skills)).toEqual(['Does something mysterious']);
    });

    it('takes only the first sentence of a multi-sentence description', () => {
        const skills = [
            makeSkill({
                description: 'Adds a component. This involves several steps. See docs for more.',
            }),
        ];
        expect(deriveCapabilityStatements(skills)).toEqual(['Adds a component']);
    });

    it('matches prefixes case-insensitively and still capitalizes the first letter', () => {
        const skills = [
            makeSkill({
                description: 'USE WHEN syncing changes after edits.',
            }),
        ];
        expect(deriveCapabilityStatements(skills)).toEqual(['Syncing changes after edits']);
    });

    it('produces reasonable statements for the real Demo Builder skill descriptions', () => {
        const skills: SkillInventoryEntry[] = [
            makeSkill({
                name: 'add-component',
                source: 'demo-builder',
                description:
                    'Adds or enables a component in a Demo Builder project by writing component `.env` values via the MCP tools. Use when adding a new component instance, toggling an optional component on or off, or wiring credentials for a fresh component installation.',
                path: '/p/.claude/skills/add-component.md',
            }),
            makeSkill({
                name: 'sync-changes',
                source: 'demo-builder',
                description:
                    'Chooses the correct sync operation after editing a Demo Builder project. Use when files have changed and you need to pick between `sync_content` (DA.live pages), `sync_storefront` (block code), `deploy_mesh` (mesh config), `update_project_config` (credentials), or `promote_block_to_library` (block source).',
                path: '/p/.claude/skills/sync-changes.md',
            }),
            makeSkill({
                name: 'update-credentials',
                source: 'demo-builder',
                description:
                    'Updates Commerce, ACCS, API Mesh, or store-view credentials in a Demo Builder project by editing component `.env` files. Use when rotating API keys, switching backends, fixing authentication failures, or onboarding to a different Commerce instance.',
                path: '/p/.claude/skills/update-credentials.md',
            }),
        ];

        const result = deriveCapabilityStatements(skills);
        expect(result.length).toBe(3);
        // Each statement should be non-empty, start with a capital letter, and
        // not end with a period.
        for (const statement of result) {
            expect(statement.length).toBeGreaterThan(0);
            expect(statement[0]).toBe(statement[0].toUpperCase());
            expect(statement.endsWith('.')).toBe(false);
        }
        // Specific cleaned-up outputs we expect from the algorithm
        expect(result[0]).toBe('Adds or enables a component');
        expect(result[1]).toBe('Chooses the correct sync operation after editing a Demo Builder project');
        expect(result[2]).toBe(
            'Updates Commerce, ACCS, API Mesh, or store-view credentials',
        );
    });
});
