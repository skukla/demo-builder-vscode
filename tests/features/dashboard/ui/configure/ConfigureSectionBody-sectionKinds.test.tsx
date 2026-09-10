/**
 * ConfigureSectionBody draws ONE section, and which one is a four-way decision.
 *
 * The Commerce split has its own suite; this one covers the other three kinds —
 * Project, Authoring, and a single App Builder component — plus the fall-through
 * that ends in `null`. Each of those branches was reachable only through the
 * rail, so nothing here was entered by a test before 2026-09-06: the Project
 * body could have stopped rendering its "nothing to configure" note, the
 * Authoring radios could have stopped reporting a choice, and the App Builder
 * section could have been handed the WHOLE catalog instead of the one entry its
 * tab is for, with every test still green.
 *
 * The App Builder section is mocked so the catalog it receives can be asserted
 * as an argument — the narrowing happens in the props, and a rendered field list
 * would only say what survived it.
 */

import { fireEvent, screen } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';

jest.mock('@adobe/react-spectrum', () => ({
    TextField: ({ label, description, errorMessage }: any) => (
        <div>
            <span>{label}</span>
            {description ? <span data-testid="field-description">{description}</span> : null}
            {errorMessage ? <span data-testid="field-error">{errorMessage}</span> : null}
        </div>
    ),
    RadioGroup: ({ children, value, onChange, 'aria-label': ariaLabel }: any) => (
        <div role="radiogroup" aria-label={ariaLabel} data-value={value}>
            {children}
            <button type="button" onClick={() => onChange('experience-workspace')}>
                pick Experience Workspace
            </button>
        </div>
    ),
    Radio: ({ children, value }: any) => <div data-value={value}>{children}</div>,
    Flex: ({ children }: any) => <div>{children}</div>,
    Text: ({ children }: any) => <span>{children}</span>,
    Link: ({ children, onPress, UNSAFE_className }: any) => (
        <span role="link" tabIndex={0} onClick={onPress} className={UNSAFE_className}>
            {children}
        </span>
    ),
    Heading: ({ children }: any) => <h3>{children}</h3>,
    View: ({ children }: any) => <div>{children}</div>,
    Divider: () => <hr />,
}));

const mockPostMessage = jest.fn();
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: { postMessage: (...a: unknown[]) => mockPostMessage(...a) },
}));

/** Records the props the App Builder section is handed — the narrowing is in them. */
const appBuilderProps: Record<string, unknown>[] = [];
jest.mock('@/features/dashboard/ui/configure/AppBuilderComponentFieldsSection', () => ({
    AppBuilderComponentFieldsSection: (props: Record<string, unknown>) => {
        appBuilderProps.push(props);
        return <div data-testid="app-builder-fields" />;
    },
}));

// Below the mocks deliberately: testUtils owns the component import, so every
// mock above has to be registered before this line runs.
import {
    CATALOG,
    COMMERCE,
    renderSectionBody,
    sectionOf,
    serviceGroupSection,
} from './ConfigureSectionBody.testUtils';

const entry = (id: string): AppBuilderComponentCatalogEntry =>
    ({ id, name: id, description: id }) as AppBuilderComponentCatalogEntry;

const PROJECT_SECTION = sectionOf('project', 'project-info', 'Project');
const AUTHORING_SECTION = sectionOf('authoring', 'authoring-experience', 'Authoring');

beforeEach(() => {
    jest.clearAllMocks();
    appBuilderProps.length = 0;
});

describe('the Project section', () => {
    it('draws the rename field and its error, not a service group', () => {
        renderSectionBody({
            section: PROJECT_SECTION,
            projectName: 'bodea',
            projectNameError: 'Already taken',
            projectNameTouched: true,
        });

        expect(screen.getByText('Project Name')).toBeInTheDocument();
        expect(screen.getByTestId('field-error')).toHaveTextContent('Already taken');
        expect(screen.queryByText('Connection')).not.toBeInTheDocument();
    });

    it('says where the project lands on disk', () => {
        // ConfigureScreen derives the slug and passes it; the body forwarded
        // nothing, so this description never rendered before 2026-09-06.
        renderSectionBody({ section: PROJECT_SECTION, projectFolder: 'bodea-demo' });

        expect(screen.getByTestId('field-description')).toHaveTextContent('Folder: bodea-demo');
    });

    it('leaves the description off when there is no folder yet', () => {
        renderSectionBody({ section: PROJECT_SECTION, projectFolder: undefined });

        expect(screen.queryByTestId('field-description')).not.toBeInTheDocument();
    });

    it('carries the "nothing to configure" note ONLY when there are no groups', () => {
        renderSectionBody({ section: PROJECT_SECTION, serviceGroups: [] });

        expect(screen.getByText(/No components requiring configuration/i)).toBeInTheDocument();
    });

    it('drops that note as soon as one group exists', () => {
        renderSectionBody({ section: PROJECT_SECTION, serviceGroups: [CATALOG] });

        expect(
            screen.queryByText(/No components requiring configuration/i)
        ).not.toBeInTheDocument();
    });

    it('draws no divider — it is the first thing on the tab', () => {
        const { container } = renderSectionBody({ section: PROJECT_SECTION });

        expect(container.querySelectorAll('hr')).toHaveLength(0);
    });
});

describe('the Authoring section', () => {
    it('offers both authoring experiences and shows the current one', () => {
        const { container } = renderSectionBody({
            section: AUTHORING_SECTION,
            authoringExperience: 'experience-workspace',
        });

        expect(screen.getByText('DA.live Classic')).toBeInTheDocument();
        expect(screen.getByText('Experience Workspace')).toBeInTheDocument();
        expect(screen.getByRole('radiogroup')).toHaveAttribute(
            'data-value',
            'experience-workspace'
        );
        expect(container.querySelectorAll('hr')).toHaveLength(0);
    });

    it('reports the chosen experience to its owner', () => {
        const onAuthoringExperienceChange = jest.fn();
        renderSectionBody({
            section: AUTHORING_SECTION,
            authoringExperience: 'da-live-classic',
            onAuthoringExperienceChange,
        });

        fireEvent.click(screen.getByText('pick Experience Workspace'));

        expect(onAuthoringExperienceChange).toHaveBeenCalledWith('experience-workspace');
    });

    it('its footer link opens the EDS settings, and asks for those by name', () => {
        renderSectionBody({ section: AUTHORING_SECTION });

        fireEvent.click(screen.getByRole('link'));

        expect(mockPostMessage).toHaveBeenCalledWith('open-eds-settings');
    });
});

describe('an App Builder component section', () => {
    /** The rail's id for a component tab is the entry id behind a fixed prefix. */
    const componentSection = (entryId: string) =>
        sectionOf('appBuilderComponent', `appBuilderComponent-${entryId}`, entryId);

    it('hands the section its OWN entry and no other', () => {
        renderSectionBody({
            section: componentSection('citisignal-erp'),
            appBuilderComponentCatalog: [entry('citisignal-erp'), entry('citisignal-crm')],
        });

        expect(screen.getByTestId('app-builder-fields')).toBeInTheDocument();
        expect(appBuilderProps).toHaveLength(1);
        expect(appBuilderProps[0].catalog).toStrictEqual([entry('citisignal-erp')]);
    });

    it('hands it the configs, provided values and secret flags it draws from', () => {
        const onAppBuilderValueChange = jest.fn();
        renderSectionBody({
            section: componentSection('citisignal-erp'),
            appBuilderComponentCatalog: [entry('citisignal-erp')],
            componentConfigs: { 'citisignal-erp': { ERP_URL: 'https://erp.example.com' } },
            providedEnvVars: { ERP_TOKEN: 'from-mesh' },
            appBuilderComponentSecretFlags: { 'citisignal-erp': { ERP_TOKEN: true } },
            onAppBuilderValueChange,
        });

        expect(appBuilderProps[0]).toMatchObject({
            configs: { 'citisignal-erp': { ERP_URL: 'https://erp.example.com' } },
            provided: { ERP_TOKEN: 'from-mesh' },
            secretFlags: { 'citisignal-erp': { ERP_TOKEN: true } },
            onTextChange: onAppBuilderValueChange,
            onSecretChange: onAppBuilderValueChange,
        });
    });

    it('narrows to nothing when the catalog no longer holds that entry', () => {
        renderSectionBody({
            section: componentSection('citisignal-erp'),
            appBuilderComponentCatalog: [entry('citisignal-crm')],
        });

        expect(appBuilderProps[0].catalog).toStrictEqual([]);
    });
});

describe('a service-group section nothing matches', () => {
    it('draws the group whose id matches, not merely the first one', () => {
        renderSectionBody({
            section: serviceGroupSection(CATALOG.id, CATALOG.label),
            serviceGroups: [COMMERCE, CATALOG],
        });

        expect(screen.getByText('Catalog Service')).toBeInTheDocument();
        expect(screen.queryByText('Connection')).not.toBeInTheDocument();
    });

    it('renders nothing at all when no group carries the section id', () => {
        const { container } = renderSectionBody({
            section: serviceGroupSection('a-group-that-left', 'Gone'),
            serviceGroups: [COMMERCE, CATALOG],
        });

        expect(container).toBeEmptyDOMElement();
    });
});
