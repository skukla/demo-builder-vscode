/**
 * The Commerce tab reads as two named tasks, not one long list of fields.
 *
 * On PaaS that tab holds EIGHT fields with no internal structure: three URLs (one
 * of which silently auto-derives from another two rows above it), two credentials
 * and the three-picker store cascade. The wizard has always named this split —
 * Connection and Business Structure — and the field sets already existed as
 * `isStoreCodeField` / the connection-group predicate.
 *
 * SUB-SECTIONS, NOT TABS. Configure is an edit surface: every tab is deliberately
 * always reachable and there is no lock vocabulary. Two tabs would either import
 * the wizard's gating — the thing that deadlocked PaaS — or be two tabs in no
 * particular order, which is worse than two headings.
 *
 * The store cascade branches on `group.id`, so the ORIGINAL group must still reach
 * `renderFieldRow`. Only the section chrome is split.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ConfigureSectionBody } from '@/features/dashboard/ui/configure/ConfigureSectionBody';
import type { ServiceGroup, UniqueField } from '@/features/dashboard/ui/configure/configureTypes';

jest.mock('@adobe/react-spectrum', () => ({
    TextField: ({ label }: any) => <div>{label}</div>,
    RadioGroup: ({ children }: any) => <div>{children}</div>,
    Radio: ({ children }: any) => <div>{children}</div>,
    Flex: ({ children }: any) => <div>{children}</div>,
    Text: ({ children }: any) => <span>{children}</span>,
    Link: ({ children }: any) => <span>{children}</span>,
    Heading: ({ children }: any) => <h3>{children}</h3>,
    View: ({ children }: any) => <div>{children}</div>,
    Divider: () => <hr />,
}));

const field = (key: string): UniqueField =>
    ({ key, label: key, type: 'text', required: false, componentIds: ['c'] }) as UniqueField;

const COMMERCE: ServiceGroup = {
    id: 'adobe-commerce',
    label: 'Adobe Commerce',
    fields: [
        field('ADOBE_COMMERCE_URL'),
        field('ADOBE_COMMERCE_ADMIN_USERNAME'),
        field('ADOBE_COMMERCE_WEBSITE_CODE'),
        field('ADOBE_COMMERCE_STORE_CODE'),
    ],
};

const CATALOG: ServiceGroup = {
    id: 'catalog-service',
    label: 'Catalog Service',
    fields: [field('ADOBE_CATALOG_API_KEY')],
};

/** Records which group each field row was handed — the cascade depends on it. */
const seen: { key: string; groupId: string }[] = [];

function renderBody(group: ServiceGroup, storeStructureReady = true) {
    seen.length = 0;
    return render(
        <ConfigureSectionBody
            section={{ id: group.id, label: group.label, kind: 'serviceGroup' } as never}
            serviceGroups={[COMMERCE, CATALOG]}
            renderFieldRow={(f, g) => {
                seen.push({ key: f.key, groupId: g.id });
                return <div data-testid={`row-${f.key}`} />;
            }}
            projectName="p"
            onProjectNameChange={jest.fn()}
            projectNameTouched={false}
            appBuilderComponentCatalog={[]}
            componentConfigs={{}}
            providedEnvVars={{}}
            appBuilderComponentSecretFlags={{}}
            onAppBuilderValueChange={jest.fn()}
            authoringExperience="da-live-classic"
            onAuthoringExperienceChange={jest.fn()}
            storeStructureReady={storeStructureReady}
        />
    );
}

describe('ConfigureSectionBody — the Commerce tab splits into two sub-sections', () => {
    it('names both sub-sections', () => {
        renderBody(COMMERCE);

        expect(screen.getByText('Connection')).toBeInTheDocument();
        expect(screen.getByText('Business Structure')).toBeInTheDocument();
    });

    it('does NOT repeat the group label as a third heading', () => {
        // The tab already says "Adobe Commerce"; the sub-sections replace it rather
        // than nesting under it.
        renderBody(COMMERCE);

        expect(screen.queryByText('Adobe Commerce')).not.toBeInTheDocument();
    });

    it('puts each field in the right sub-section and loses none', () => {
        renderBody(COMMERCE);

        expect(seen.map((s) => s.key)).toEqual([
            'ADOBE_COMMERCE_URL',
            'ADOBE_COMMERCE_ADMIN_USERNAME',
            'ADOBE_COMMERCE_WEBSITE_CODE',
            'ADOBE_COMMERCE_STORE_CODE',
        ]);
    });

    it('hands the ORIGINAL group to every row — the store cascade branches on its id', () => {
        // Passing a synthetic 'connection' id here would orphan the website/store/
        // view pickers, which resolve their env keys from group.id.
        renderBody(COMMERCE);

        expect(seen.every((s) => s.groupId === 'adobe-commerce')).toBe(true);
    });

    it('hides Business Structure until the store structure can load', () => {
        // Its fields render null before then (StoreConfigFieldRow's disclosure
        // gate), so the heading would otherwise sit above nothing.
        renderBody(COMMERCE, false);

        expect(screen.getByText('Connection')).toBeInTheDocument();
        expect(screen.queryByText('Business Structure')).not.toBeInTheDocument();
    });

    it('draws no divider between the two sub-sections', () => {
        // Each ConfigSection header already has a border-bottom. A Divider on top of
        // that is a second rule, and it read as a harder break than the tab strip.
        const { container } = renderBody(COMMERCE);

        expect(container.querySelectorAll('hr')).toHaveLength(0);
    });

    it('leaves a NON-connection group as a single section — control', () => {
        renderBody(CATALOG);

        expect(screen.getByText('Catalog Service')).toBeInTheDocument();
        expect(screen.queryByText('Connection')).not.toBeInTheDocument();
    });
});
