/**
 * The Welcome step on Import from File with a demo bundle (EDS-72 decision 2): the demo being
 * imported, alone, chosen and fixed, under the project name. Its card is the brand the sender
 * built on (the setup's own package, decision 3), named as the bundle names the demo.
 *
 * @module features/project-creation/ui/components/ImportedDemoGallery
 */

import React from 'react';
import { BrandGallery } from './BrandGallery';
import type { DemoPackage } from '@/types/demoPackages';
import type { ImportedFrom } from '@/types/projectFile';
import type { Stack } from '@/types/stacks';
import type { WizardState } from '@/types/webview';

/** The file's own name, for the card's line: the path is this machine's, the name is what the SC chose. */
function fileNameOf(bundlePath: string): string {
    return bundlePath.split(/[\\/]/).pop() ?? bundlePath;
}

/**
 * The one card: the brand's package (its storefronts and defaults) under the imported demo's name.
 * The brand may not have loaded yet, or be hidden; the card stands on the import alone then.
 */
export function importedDemoCard(importedFrom: ImportedFrom, packageId: string, brand: DemoPackage | undefined): DemoPackage {
    return {
        configDefaults: {},
        storefronts: {},
        ...brand,
        id: packageId,
        name: importedFrom.bundleName,
        description: `Imported from ${fileNameOf(importedFrom.bundlePath)}`,
    };
}

/** Nothing to choose: the imported demo is the project's. */
const STAYS_FIXED = (): void => undefined;

interface ImportedDemoGalleryProps {
    importedFrom: ImportedFrom;
    packages: DemoPackage[];
    stacks: Stack[];
    state: Pick<WizardState, 'selectedPackage' | 'selectedStack' | 'selectedBlockLibraries' | 'customBlockLibraries'>;
    /** The project name field, as the grid shows it. */
    headerContent: React.ReactNode;
}

export function ImportedDemoGallery({ importedFrom, packages, stacks, state, headerContent }: ImportedDemoGalleryProps) {
    const packageId = state.selectedPackage ?? '';
    const card = importedDemoCard(importedFrom, packageId, packages.find((pkg) => pkg.id === packageId));
    return (
        <BrandGallery
            packages={[card]}
            stacks={stacks}
            selectedPackage={packageId}
            selectedStack={state.selectedStack}
            onPackageSelect={STAYS_FIXED}
            selectedBlockLibraries={state.selectedBlockLibraries}
            customBlockLibraries={state.customBlockLibraries}
            headerContent={headerContent}
            fixed
        />
    );
}
