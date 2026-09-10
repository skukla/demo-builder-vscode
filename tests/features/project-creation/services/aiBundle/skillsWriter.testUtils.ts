/**
 * Shared Adobe-skill-bundle disk mock for the skillsWriter suites.
 *
 * The writer reads the bundle out of the project's ISOLATED MCP tools dir, so
 * the fixture path is spelled once here rather than per suite — the 2026-08-26
 * regression was a mock that answered whichever path it was handed, which let a
 * copy that could never resolve in production pass every test.
 *
 * `mockAdobeBundleTree` takes a nested tree: a string leaf is a file's raw
 * content, an object is a directory. The mock behaves like a real filesystem at
 * the edges the writer depends on — `readdir` on a file rejects ENOTDIR,
 * `readFile` on a directory rejects EISDIR, anything absent rejects ENOENT — so
 * a test can tell "the writer skipped it" apart from "the mock answered anyway".
 */
import { fsPromises } from './aiBundleFsMock';
import * as path from 'path';
import { enoentError, mcpToolsManifest } from './generatedFileWriter.testUtils';

/** A file (its raw content) or a directory (its entries). */
export type BundleNode = string | { [name: string]: BundleNode };

const ADOBE_BUNDLE_RELATIVE =
    'node_modules/@adobe-commerce/commerce-extensibility-tools/dist/aem-boilerplate-commerce/skills';

/** Where `copyAdobeSkillBundle` must read the EDS bundle from. */
export const EDS_STOREFRONT_BUNDLE_PATH = `/projects/test/.demo-builder-mcp/${ADOBE_BUNDLE_RELATIVE}`;

export function makeDirent(
    name: string,
    isDirectory: boolean
): { name: string; isDirectory: () => boolean } {
    return { name, isDirectory: () => isDirectory };
}

function codedError(code: string, message: string): NodeJS.ErrnoException {
    const err = new Error(message) as NodeJS.ErrnoException;
    err.code = code;
    return err;
}

/** Walk `tree` to the node at `absolutePath`, or undefined when absent. */
function resolveNode(tree: BundleNode, absolutePath: string): BundleNode | undefined {
    if (absolutePath === EDS_STOREFRONT_BUNDLE_PATH) return tree;
    if (!absolutePath.startsWith(`${EDS_STOREFRONT_BUNDLE_PATH}/`)) return undefined;
    const segments = absolutePath.slice(EDS_STOREFRONT_BUNDLE_PATH.length + 1).split('/');
    let node: BundleNode | undefined = tree;
    for (const segment of segments) {
        if (typeof node !== 'object') return undefined;
        node = node[segment];
        if (node === undefined) return undefined;
    }
    return node;
}

/**
 * Serve `tree` as the Adobe bundle on the mocked fs. The installed-tools
 * manifest reports playwright so the gated first-party skills stay deliverable.
 */
export function mockAdobeBundleTree(tree: BundleNode): void {
    (fsPromises.readdir as jest.Mock).mockImplementation(async (dirPath: string) => {
        const node = resolveNode(tree, String(dirPath));
        if (node === undefined) throw enoentError();
        if (typeof node === 'string') throw codedError('ENOTDIR', `ENOTDIR: ${dirPath}`);
        return Object.entries(node).map(([name, child]) =>
            makeDirent(name, typeof child === 'object')
        );
    });

    (fsPromises.readFile as jest.Mock).mockImplementation(async (filePath: string) => {
        if (String(filePath).endsWith('.demo-builder-mcp/package.json')) {
            return mcpToolsManifest(['@playwright/mcp']);
        }
        const node = resolveNode(tree, String(filePath));
        if (node === undefined) throw enoentError();
        if (typeof node !== 'string') throw codedError('EISDIR', `EISDIR: ${filePath}`);
        return node;
    });
}

/**
 * The flat form the older suite uses: `skillFiles[skillName]` lists filenames
 * inside that skill folder, each `.md` carrying stock Adobe frontmatter.
 */
export function mockAdobeSkillBundle(skillFiles: Record<string, string[]>): void {
    const tree: Record<string, BundleNode> = {};
    for (const [skillName, filenames] of Object.entries(skillFiles)) {
        const folder: Record<string, BundleNode> = {};
        for (const filename of filenames) {
            folder[filename] = filename.endsWith('.md')
                ? `---\nname: ${skillName}\ndescription: Adobe skill ${skillName}\n---\n\n` +
                  `# ${skillName}\n\nBody for ${skillName}.\n`
                : `content of ${filename}`;
        }
        tree[skillName] = folder;
    }
    mockAdobeBundleTree(tree);
}

/** No bundle on disk at all — every readdir ENOENTs. */
export function mockMissingAdobeBundle(): void {
    (fsPromises.readdir as jest.Mock).mockImplementation(async () => {
        throw enoentError();
    });
}

/** Absolute path of a file inside a copied bundle skill, as the writer lands it. */
export function copiedSkillPath(prefixedSkill: string, ...segments: string[]): string {
    return path.join('/projects/test/.claude/skills', prefixedSkill, ...segments);
}
