/**
 * toComponentDefinitionEntry — the one entry shape creation and reset both hand
 * the orchestrator (PL-69 pair 22).
 */

import { toComponentDefinitionEntry } from '@/features/project-creation/services/componentDefinitionEntry';
import type { TransformedComponentDefinition } from '@/types/components';

// The registry lists the mesh as a dependency; a stack may list it under another type.
const MESH_DEF: TransformedComponentDefinition = {
    id: 'commerce-mesh',
    name: 'Commerce Mesh',
    type: 'dependency',
    subType: 'mesh',
    source: { type: 'git', url: 'https://github.com/example/mesh', branch: 'main' },
};

describe('toComponentDefinitionEntry', () => {
    it('stamps the definition with the type the stack lists it under', () => {
        const entry = toComponentDefinitionEntry(MESH_DEF, 'app-builder');

        expect(entry).toEqual({
            definition: { ...MESH_DEF, type: 'app-builder' },
            type: 'app-builder',
            installOptions: { skipDependencies: true },
        });
    });

    it('keeps every other field of the definition, source included', () => {
        const entry = toComponentDefinitionEntry(MESH_DEF, 'frontend');

        expect(entry.definition.source).toBe(MESH_DEF.source);
        expect(entry.definition.id).toBe('commerce-mesh');
        expect(entry.definition.name).toBe('Commerce Mesh');
    });

    it('does not change the definition it was given', () => {
        const before = { ...MESH_DEF };

        toComponentDefinitionEntry(MESH_DEF, 'dependency');

        expect(MESH_DEF).toEqual(before);
        expect(MESH_DEF.type).toBe('dependency');
    });

    it('always skips dependencies: each component is listed on its own', () => {
        expect(toComponentDefinitionEntry(MESH_DEF, 'app-builder').installOptions).toEqual({
            skipDependencies: true,
        });
    });
});
