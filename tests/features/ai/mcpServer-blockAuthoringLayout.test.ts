/**
 * promote_block_to_library and remove_block_from_library edit the storefront
 * checkout's component-definition.json. They write it back in the indentation
 * it already had, not a fixed two spaces (EDS-36): a one-entry change stays a
 * one-entry diff for an SC whose file uses four spaces or tabs.
 */

jest.mock('fs/promises', () => ({
    readFile: jest.fn(),
    writeFile: jest.fn(),
}));

import * as fsProm from 'fs/promises';
import {
    applyComponentDefinitionEntry,
    removeComponentDefinitionEntry,
} from '../../../src/mcp/blockAuthoring';
import { createDestComponentDef } from '../../helpers/componentDefinitionFixtures';

const STOREFRONT = '/projects/demo/components/eds-storefront';

function storefrontFile(indent: number | string): string {
    return `${JSON.stringify(JSON.parse(createDestComponentDef()), null, indent)}\n`;
}

function written(): string {
    const call = (fsProm.writeFile as jest.Mock).mock.calls[0];
    expect(call[0]).toBe(`${STOREFRONT}/component-definition.json`);
    return call[1] as string;
}

beforeEach(() => {
    jest.clearAllMocks();
    (fsProm.writeFile as jest.Mock).mockResolvedValue(undefined);
});

describe.each([
    ['four spaces', 4],
    ['tabs', '\t'],
])('component-definition.json indented with %s', (_label, indent) => {
    it('promote adds the entry and keeps the indentation and final newline', async () => {
        const original = storefrontFile(indent);
        (fsProm.readFile as jest.Mock).mockResolvedValue(original);

        await applyComponentDefinitionEntry(STOREFRONT, 'promo', 'Promo', '<div></div>', undefined);

        const expected = JSON.parse(original);
        expected.groups[0].components.push({
            id: 'promo', title: 'Promo', plugins: { da: { unsafeHTML: '<div></div>' } },
        });
        expect(written()).toBe(`${JSON.stringify(expected, null, indent)}\n`);
    });

    it('remove drops the entry and keeps the indentation and final newline', async () => {
        const original = storefrontFile(indent);
        (fsProm.readFile as jest.Mock).mockResolvedValue(original);

        await removeComponentDefinitionEntry(STOREFRONT, 'cards');

        const expected = JSON.parse(original);
        expected.groups[0].components = [{ title: 'Hero', id: 'hero' }];
        expect(written()).toBe(`${JSON.stringify(expected, null, indent)}\n`);
    });
});
