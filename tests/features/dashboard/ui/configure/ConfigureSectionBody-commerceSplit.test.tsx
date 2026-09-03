/**
 * The Commerce tab reads as two named tasks, not one long list of fields.
 *
 * On PaaS that tab holds EIGHT fields with no internal structure: three URLs (one
 * of which silently auto-derives from another two rows above it), two credentials
 * and the three-picker store cascade. The wizard has always named this split —
 * Connection and Business Structure — and the field sets already existed as
 * `isStoreCodeField` / the connection-group predicate.
 *
 * **Business Structure became its own RAIL TAB on 2026-08-17**, by product
 * decision, reversing the note that used to head this file. That note argued
 * sub-sections because "two tabs would either import the wizard's gating — the
 * thing that deadlocked PaaS — or be two tabs in no particular order".
 *
 * The gating was the hazard, and it has not come along: neither tab locks, both
 * stay reachable, and the rail keeps them adjacent and ordered. What the tab does
 * carry is the honest empty state the sub-section used to solve by vanishing —
 * store pickers cannot render before the connection works, and a tab that
 * disappears is worse than one that says why it is waiting.
 *
 * Connection keeps ONE sub-section beside it, Credentials, because that pair is
 * part of reaching the instance rather than a third task.
 *
 * The store cascade branches on `group.id`, so the ORIGINAL group must still reach
 * `renderFieldRow`. Only the chrome is split.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ConfigureSectionBody } from '@/features/dashboard/ui/configure/ConfigureSectionBody';
import type { ServiceGroup, UniqueField } from '@/features/dashboard/ui/configure/configureTypes';
import type { ConfigureSection } from '@/features/dashboard/ui/configure/configureSections';

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

/** The ACCS half: the only backend with the brokered OAuth pair. */
const ACCS: ServiceGroup = {
    id: 'accs',
    label: 'Adobe Commerce Cloud Service',
    fields: [
        field('ACCS_GRAPHQL_ENDPOINT'),
        field('ACCS_OAUTH_CLIENT_ID'),
        field('ACCS_OAUTH_CLIENT_SECRET'),
        field('ACCS_WEBSITE_CODE'),
    ],
};

const CATALOG: ServiceGroup = {
    id: 'catalog-service',
    label: 'Catalog Service',
    fields: [field('ADOBE_CATALOG_API_KEY')],
};

/** A rail section for a service group; the body branches on `kind` and `id` only. */
const serviceGroupSection = (id: string, label: string): ConfigureSection => ({
    id,
    label,
    kind: 'serviceGroup',
    isComplete: true,
    requiredTotal: 0,
    requiredComplete: 0,
    hasError: false,
});

/** Records which group each field row was handed — the cascade depends on it. */
const seen: { key: string; groupId: string }[] = [];

function renderBody(group: ServiceGroup, storeStructureReady = true) {
    seen.length = 0;
    return render(
        <ConfigureSectionBody
            section={serviceGroupSection(group.id, group.label)}
            serviceGroups={[group, CATALOG]}
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
    it('names Connection, and Business Structure is NOT one of them', () => {
        renderBody(COMMERCE);

        expect(screen.getByText('Connection')).toBeInTheDocument();
        // It has its own rail tab now; a heading here too would render it twice.
        expect(screen.queryByText('Business Structure')).not.toBeInTheDocument();
    });

    it('shows no Credentials heading on PaaS, which has no OAuth pair', () => {
        // The section is for the ACCS OAuth credentials, which the shared service
        // can supply. PaaS authenticates with admin username/password, and those
        // stay in Connection — an empty heading would imply a missing setting.
        renderBody(COMMERCE);

        expect(screen.queryByText('Credentials')).not.toBeInTheDocument();
    });

    it('shows the Credentials heading on ACCS', () => {
        renderBody(ACCS);

        expect(screen.getByText('Connection')).toBeInTheDocument();
        expect(screen.getByText('Credentials')).toBeInTheDocument();
    });

    it('does NOT repeat the group label as a third heading', () => {
        // The tab already says "Adobe Commerce"; the sub-sections replace it rather
        // than nesting under it.
        renderBody(COMMERCE);

        expect(screen.queryByText('Adobe Commerce')).not.toBeInTheDocument();
    });

    it('renders only the connection half — the store codes live on the other tab', () => {
        renderBody(COMMERCE);

        expect(seen.map((s) => s.key)).toEqual([
            'ADOBE_COMMERCE_URL',
            'ADOBE_COMMERCE_ADMIN_USERNAME',
        ]);
    });

    it('hands the ORIGINAL group to every row — the store cascade branches on its id', () => {
        // Passing a synthetic 'connection' id here would orphan the website/store/
        // view pickers, which resolve their env keys from group.id.
        renderBody(COMMERCE);

        expect(seen.every((s) => s.groupId === 'adobe-commerce')).toBe(true);
    });

    it('keeps the connection sub-sections whether or not stores can load', () => {
        renderBody(ACCS, false);

        expect(screen.getByText('Connection')).toBeInTheDocument();
        expect(screen.getByText('Credentials')).toBeInTheDocument();
    });
});

describe('the Business Structure tab', () => {
    /** Render the sliced section id the rail now emits for the store cascade. */
    function renderBusinessStructure(storeStructureReady: boolean) {
        seen.length = 0;
        return render(
            <ConfigureSectionBody
                section={serviceGroupSection(
                    'adobe-commerce:business-structure',
                    'Business Structure'
                )}
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

    it('names itself, like every other section does', () => {
        // `ServiceGroupList` wraps each group in a ConfigSection with its label, so
        // a tab whose body has no heading is the odd one out.
        renderBusinessStructure(true);

        expect(screen.getByText('Business Structure')).toBeInTheDocument();
    });

    it('keeps its heading while it is waiting', () => {
        renderBusinessStructure(false);

        expect(screen.getByText('Business Structure')).toBeInTheDocument();
    });

    it('renders the store cascade and nothing else', () => {
        renderBusinessStructure(true);

        expect(seen.map((s) => s.key)).toEqual([
            'ADOBE_COMMERCE_WEBSITE_CODE',
            'ADOBE_COMMERCE_STORE_CODE',
        ]);
    });

    it('still hands rows the ORIGINAL group, so the cascade resolves its keys', () => {
        renderBusinessStructure(true);

        expect(seen.every((s) => s.groupId === 'adobe-commerce')).toBe(true);
    });

    it('says what it is waiting for instead of rendering an empty tab', () => {
        // As a sub-section this could simply vanish. A TAB cannot — a tab that
        // disappears reads as a broken feature, so it explains itself instead.
        renderBusinessStructure(false);

        expect(screen.getByText(/Fill in the Connection details/i)).toBeInTheDocument();
        expect(seen).toHaveLength(0);
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
