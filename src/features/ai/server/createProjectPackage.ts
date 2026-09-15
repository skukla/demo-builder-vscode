/**
 * The package `create_project` builds on: a shipped one by id, an added demo by
 * its `added:owner/repo` id (from list_demo_packages), or a colleague's link
 * probed and added inline (the dialog's own path).
 * An added demo's package is derived from its row for the chosen stack, so
 * every downstream read (mesh requirement, storefront, config) sees one
 * catalog. Its own module so the tool stays under the file limit.
 *
 * @module features/ai/server/createProjectPackage
 */

import { readDemoRow } from './addedDemoTools';
import {
    getAvailableStacksForPackage,
    getSelectablePackages,
    getStorefrontForStack,
} from '@/features/components/services/demoPackageLoader';
import {
    addedDemoId,
    isAddedDemoId,
    packageFromAddedDemo,
} from '@/features/components/services/storefrontResolver';
import { handleAddSharedDemo } from '@/features/eds/handlers/addSharedDemoHandler';
import { readAddedDemos } from '@/features/project-creation/services/addedDemoSettings';
import type { DemoPackage, Storefront } from '@/types/demoPackages';
import type { HandlerContext } from '@/types/handlers';
import type { AddedDemo } from '@/types/projectFile';

export interface ResolvedCreatePackage {
    pkg: DemoPackage;
    storefront: Storefront;
    /** The catalog the creation reads: the shipped list, plus the derived package for an added demo. */
    packages: DemoPackage[];
    /** The row, when the package is an added demo (D2). */
    demo?: AddedDemo;
}

export interface ResolvePackageArgs {
    pkgId: string;
    stackId: string;
    link?: string;
}

/** Every id a creation may name: the shipped packages and the remembered demos. */
function validPackageIds(shipped: DemoPackage[]): string[] {
    return [...shipped.map((p) => p.id), ...readAddedDemos().map(addedDemoId)];
}

/** The row for the request: added from a link now, or remembered by id. */
async function demoFor(
    ctx: HandlerContext,
    args: ResolvePackageArgs,
    shipped: DemoPackage[],
): Promise<AddedDemo | undefined | { error: Record<string, unknown> }> {
    if (args.link) {
        const row = await readDemoRow(ctx, { link: args.link });
        if ('error' in row) return row;
        const added = await handleAddSharedDemo(ctx, { demo: row.demo });
        if (!added.success || !added.result) return { error: { error: added.error } };
        return added.result.demo;
    }
    if (!isAddedDemoId(args.pkgId)) return undefined;
    const demo = readAddedDemos().find((row) => addedDemoId(row) === args.pkgId);
    return (
        demo ?? {
            error: { error: `Unknown added demo: ${args.pkgId}`, validPackages: validPackageIds(shipped) },
        }
    );
}

/**
 * Resolve what the creation builds on, or the refusal to answer with.
 */
export async function resolvePackage(
    ctx: HandlerContext,
    args: ResolvePackageArgs,
): Promise<ResolvedCreatePackage | { error: Record<string, unknown> }> {
    const shipped = await getSelectablePackages();
    const demo = await demoFor(ctx, args, shipped);
    if (demo && 'error' in demo) return demo;
    if (demo) {
        // With no stack the row is offered under every stack of its kind; that
        // list is the rule an Edge Delivery demo cannot be built headless by.
        const stacksOfKind = Object.keys(packageFromAddedDemo(demo, undefined).storefronts);
        if (!stacksOfKind.includes(args.stackId)) {
            const kind = demo.storefrontKind === 'eds' ? 'an Edge Delivery' : 'a headless';
            return {
                error: {
                    error: `"${demo.name}" is ${kind} demo and has no "${args.stackId}" storefront.`,
                    validStacksForPackage: stacksOfKind,
                },
            };
        }
        const pkg = packageFromAddedDemo(demo, args.stackId);
        return { pkg, storefront: pkg.storefronts[args.stackId], packages: [...shipped, pkg], demo };
    }
    const pkg = shipped.find((p) => p.id === args.pkgId);
    if (!pkg) {
        return { error: { error: `Unknown package: ${args.pkgId}`, validPackages: validPackageIds(shipped) } };
    }
    const storefront = await getStorefrontForStack(args.pkgId, args.stackId);
    if (!storefront) {
        return {
            error: {
                error: `Package "${args.pkgId}" has no "${args.stackId}" storefront.`,
                validStacksForPackage: await getAvailableStacksForPackage(args.pkgId),
            },
        };
    }
    return { pkg, storefront, packages: shipped };
}
