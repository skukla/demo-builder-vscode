/**
 * ConfigureSectionBody
 *
 * Renders the ONE section currently selected on the Configure rail. Which section that
 * is comes from {@link buildConfigureSections}; this module only knows how to draw each
 * of the four kinds.
 *
 * Split out of ConfigureScreen because the rail turned "render every section stacked"
 * into "render exactly one", which is a switch — and a switch inside an already
 * over-length component is where god files come from.
 *
 * @module features/dashboard/ui/configure/ConfigureSectionBody
 */

import { Text, Flex, Link, TextField, RadioGroup, Radio } from '@adobe/react-spectrum';
import React from 'react';
import { AppBuilderComponentFieldsSection } from './AppBuilderComponentFieldsSection';
import { slicedSectionId, type ConfigureSection } from './configureSections';
import type { ServiceGroup, UniqueField } from './configureTypes';
import { ConfigSection } from '@/core/ui/components/forms/ConfigSection';
import { getValidationState } from '@/core/ui/utils/validationState';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import {
    filterGroupsForSection,
    isConnectionGroup,
    type ConnectStoreSection,
} from '@/features/components/config/storeFieldHelpers';
import { ServiceGroupList } from '@/features/components/ui/components/ServiceGroupList';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AuthoringExperience } from '@/types/base';
import type { ComponentConfigs } from '@/types/webview';

/** The `appBuilderComponent-` prefix its section ids carry (see configureSections). */
const APP_BUILDER_SECTION_PREFIX = 'appBuilderComponent-';

export interface ConfigureSectionBodyProps {
    /** The section to draw. */
    section: ConfigureSection;
    /** All service groups (the active one is looked up by id). */
    serviceGroups: ServiceGroup[];
    /** Renders one field row — the same callback shape `ServiceGroupList` takes. */
    renderFieldRow: (field: UniqueField, group: ServiceGroup) => React.ReactNode;
    /** Project-name field state. */
    projectName: string;
    onProjectNameChange: (value: string) => void;
    projectNameError?: string;
    projectNameTouched: boolean;
    /** The slug derived from the name, shown so the user can find it on disk. */
    projectFolder?: string;
    /** Catalog entries for the project's selected appBuilderComponents. */
    appBuilderComponentCatalog: AppBuilderComponentCatalogEntry[];
    /** Current componentConfigs (App Builder text values live here). */
    componentConfigs: ComponentConfigs;
    /** Resolved provided env values (bucket-2 "connected" sources). */
    providedEnvVars: Record<string, string>;
    /** Per-appBuilderComponent "is set" flags for secret vars. */
    appBuilderComponentSecretFlags: Record<string, Record<string, boolean>>;
    /** Stage an App Builder value (text and secret share the staging path). */
    onAppBuilderValueChange: (componentId: string, varName: string, value: string) => void;
    /**
     * Whether store discovery can run yet (connection fields filled).
     *
     * Gates the Business Structure sub-section. Its fields render null before
     * this — StoreConfigFieldRow's own disclosure gate — so without it the
     * heading would sit above nothing.
     */
    storeStructureReady: boolean;
    /** EDS authoring-experience preference. */
    authoringExperience: AuthoringExperience;
    onAuthoringExperienceChange: (value: AuthoringExperience) => void;
}

/**
 * The Project section: the rename field, plus the "nothing to configure" note when the
 * project has no service groups at all. That note used to sit where the groups would
 * have been; with one section per tab there is no such place, and Project is the tab
 * every user lands on, so it is the one spot where the note is guaranteed to be seen.
 */
function ProjectBody({
    projectName,
    onProjectNameChange,
    projectNameError,
    projectNameTouched,
    projectFolder,
    hasServiceGroups,
}: {
    projectName: string;
    onProjectNameChange: (value: string) => void;
    projectNameError?: string;
    projectNameTouched: boolean;
    /** The slug derived from the name, shown so the user can find it on disk. */
    projectFolder?: string;
    hasServiceGroups: boolean;
}): React.ReactElement {
    return (
        <ConfigSection id="project-info" label="Project" showDivider={false}>
            <TextField
                label="Project Name"
                value={projectName}
                onChange={onProjectNameChange}
                isRequired
                width="100%"
                validationState={getValidationState(projectNameError, projectNameTouched)}
                errorMessage={projectNameError}
                // The rule still holds, it just applies to the derived folder
                // rather than to what is typed -- so say where it lands instead
                // of dictating what to type.
                description={
                    projectFolder ? `Folder: ${projectFolder}` : undefined
                }
            />
            {hasServiceGroups ? null : (
                <Text UNSAFE_className="text-gray-600">
                    No components requiring configuration were found.
                </Text>
            )}
        </ConfigSection>
    );
}

/**
 * EDS-only authoring-experience preference. A setup-time choice (saved via the Configure
 * footer's Save), not an on-the-fly action — so it lives here rather than on the
 * dashboard/kebab action surfaces.
 */
function AuthoringBody({
    value,
    onChange,
}: {
    value: AuthoringExperience;
    onChange: (value: AuthoringExperience) => void;
}): React.ReactElement {
    return (
        <ConfigSection
            id="authoring-experience"
            label="Authoring"
            showDivider={false}
            footer={
                <Flex marginTop="size-200">
                    <Text UNSAFE_className="text-gray-600 text-sm">
                        DA.live & authoring settings are configured in{' '}
                        <Link
                            onPress={() => webviewClient.postMessage('open-eds-settings')}
                            UNSAFE_className="cursor-pointer"
                        >
                            Extension Settings
                        </Link>
                    </Text>
                </Flex>
            }
        >
            {/* aria-label (not label): the "Authoring" section heading already names this,
                so a visible RadioGroup label would be a redundant subheading. */}
            <RadioGroup
                aria-label="Authoring Experience"
                value={value}
                onChange={(next) => onChange(next as AuthoringExperience)}
            >
                <Radio value="da-live-classic">DA.live Classic</Radio>
                <Radio value="experience-workspace">Experience Workspace</Radio>
            </RadioGroup>
        </ConfigSection>
    );
}

/**
 * The Commerce group rendered as Connection + Business Structure.
 *
 * `renderFieldRow` receives the ORIGINAL group, never a synthetic one: the store
 * cascade resolves its three env keys from `group.id`
 * (`StoreSelectionRow.getFieldKeys`) and progressive disclosure keys off the same
 * value, so a relabelled id would orphan the pickers.
 *
 * Uses `ConfigSection` directly rather than `ServiceGroupList`, which keys its
 * sections by `group.id` — both halves share one id here, and only the chrome
 * differs.
 */
/**
 * The store-scope cascade, as its own rail tab.
 *
 * The tab is ALWAYS reachable — no lock. Its fields disclose themselves (they
 * render null until the connection is usable), so before then the tab would be an
 * empty pane; a line saying what is missing is the difference between "not yet"
 * and "broken". The wizard says the same thing for its locked Catalog step.
 */
function BusinessStructureSection({
    group,
    renderFieldRow,
    storeStructureReady,
}: {
    group: ServiceGroup;
    renderFieldRow: (field: UniqueField, group: ServiceGroup) => React.ReactNode;
    storeStructureReady: boolean;
}): React.ReactElement {
    const sliced = filterGroupsForSection([group], 'business-structure')[0];

    // The heading is the section's name, exactly as every other section renders it
    // (`ServiceGroupList` wraps each group in a ConfigSection with its label). It
    // stays put in the waiting state too — a body that swaps its heading for a
    // sentence reads as a different screen rather than the same one, not ready.
    return (
        <ConfigSection id="business-structure" label="Business Structure">
            {!storeStructureReady || !sliced ? (
                <Text UNSAFE_className="text-gray-600">
                    Fill in the Connection details to load this instance&apos;s websites and
                    stores.
                </Text>
            ) : (
                sliced.fields.map((field) => (
                    <React.Fragment key={field.key}>{renderFieldRow(field, group)}</React.Fragment>
                ))
            )}
        </ConfigSection>
    );
}

function CommerceSubSections({
    group,
    renderFieldRow,
}: {
    group: ServiceGroup;
    renderFieldRow: (field: UniqueField, group: ServiceGroup) => React.ReactNode;
}): React.ReactElement {
    const parts: { section: ConnectStoreSection; label: string }[] = [
        { section: 'connection', label: 'Connection' },
        // Credentials get their own heading even though they usually render a
        // single line saying nothing needs entering — because "Use my own instead"
        // reveals two inputs, and those need somewhere to belong rather than
        // appearing under the endpoint field they have nothing to do with.
        { section: 'credentials', label: 'Credentials' },
    ];

    return (
        <>
            {parts.map(({ section, label }) => {
                const sliced = filterGroupsForSection([group], section)[0];
                if (!sliced) return null;
                return (
                    // No `showDivider`. Every ConfigSection header already draws its own
                    // border-bottom, so the divider would put a SECOND rule between two
                    // sub-sections of one tab — reading as a harder break than the tab
                    // boundaries above it. The headings are the separation.
                    <ConfigSection key={section} id={section} label={label}>
                        {sliced.fields.map((field) => (
                            <React.Fragment key={field.key}>
                                {renderFieldRow(field, group)}
                            </React.Fragment>
                        ))}
                    </ConfigSection>
                );
            })}
        </>
    );
}

/**
 * Draw the active section.
 *
 * @param props - the section plus every source it might need to draw itself
 * @returns the section body, or null when the section has nothing to draw
 */
export function ConfigureSectionBody({
    section,
    serviceGroups,
    renderFieldRow,
    projectName,
    onProjectNameChange,
    projectNameError,
    projectNameTouched,
    appBuilderComponentCatalog,
    componentConfigs,
    providedEnvVars,
    appBuilderComponentSecretFlags,
    onAppBuilderValueChange,
    storeStructureReady,
    authoringExperience,
    onAuthoringExperienceChange,
}: ConfigureSectionBodyProps): React.ReactElement | null {
    if (section.kind === 'project') {
        return (
            <ProjectBody
                projectName={projectName}
                onProjectNameChange={onProjectNameChange}
                projectNameError={projectNameError}
                projectNameTouched={projectNameTouched}
                hasServiceGroups={serviceGroups.length > 0}
            />
        );
    }

    if (section.kind === 'authoring') {
        return (
            <AuthoringBody
                value={authoringExperience}
                onChange={onAuthoringExperienceChange}
            />
        );
    }

    if (section.kind === 'appBuilderComponent') {
        // The section id is the entry id with a prefix; narrowing the catalog to that one
        // entry makes the (unchanged) group renderer draw exactly one group.
        const entryId = section.id.slice(APP_BUILDER_SECTION_PREFIX.length);
        return (
            <AppBuilderComponentFieldsSection
                catalog={appBuilderComponentCatalog.filter((entry) => entry.id === entryId)}
                configs={componentConfigs}
                provided={providedEnvVars}
                secretFlags={appBuilderComponentSecretFlags}
                onTextChange={onAppBuilderValueChange}
                onSecretChange={onAppBuilderValueChange}
            />
        );
    }

    // Business Structure is its own rail tab, so its id carries the slice suffix.
    const businessStructureOf = serviceGroups.find(
        (g) => slicedSectionId(g.id, 'business-structure') === section.id,
    );
    if (businessStructureOf) {
        return (
            <BusinessStructureSection
                group={businessStructureOf}
                renderFieldRow={renderFieldRow}
                storeStructureReady={storeStructureReady}
            />
        );
    }

    const group = serviceGroups.find((g) => g.id === section.id);
    if (!group) return null;

    // The Commerce group is TWO tasks: reaching the instance, and choosing the
    // scope within it. Eight fields on PaaS with nothing separating them.
    //
    // Those are now a rail tab each. The earlier note here preferred sub-sections
    // because "two tabs would have to borrow the wizard's gating, which is what
    // deadlocked PaaS" — the gating is the hazard, not the tabs, and neither tab
    // here locks. Connection keeps its Credentials sub-section, because that pair
    // is part of reaching the instance rather than a third task.
    if (isConnectionGroup(group.id)) {
        return <CommerceSubSections group={group} renderFieldRow={renderFieldRow} />;
    }

    // One group in, so `ServiceGroupList` gives it showDivider={false} — right, because
    // there is nothing above it to divide from.
    return <ServiceGroupList groups={[group]} renderFieldRow={renderFieldRow} />;
}
