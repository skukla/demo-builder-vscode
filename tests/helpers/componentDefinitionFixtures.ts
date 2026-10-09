/**
 * component-definition.json fixtures — the file a storefront's DA.live block
 * list is built from: `groups[]`, each with `components[]` of `{ id, title,
 * plugins.da.unsafeHTML }`. The shape the block-library installer
 * (`blockCollectionHelpers.ts`) and the agent's promote/remove tools
 * (`src/mcp/blockAuthoring.ts`) both parse.
 *
 * Here rather than beside the installer's suites because the update and MCP
 * suites need the same file.
 */

/** Create a component-definition.json with specified blocks */
export function createComponentDef(
    blocks: Array<{ title: string; id: string; unsafeHTML?: string }>,
): string {
    return JSON.stringify({
        groups: [{
            id: 'blocks',
            title: 'Blocks',
            components: blocks.map(b => ({
                title: b.title,
                id: b.id,
                plugins: b.unsafeHTML ? { da: { unsafeHTML: b.unsafeHTML } } : undefined,
            })),
        }],
    });
}

/** Create a destination component-definition.json with existing blocks */
export function createDestComponentDef(
    blocks: Array<{ title: string; id: string }> = [
        { title: 'Hero', id: 'hero' },
        { title: 'Cards', id: 'cards' },
    ],
): string {
    return JSON.stringify({
        groups: [{
            id: 'blocks',
            title: 'Blocks',
            components: blocks.map(b => ({ title: b.title, id: b.id })),
        }],
    });
}
