/**
 * ServiceGroupList
 *
 * Renders a list of service groups — one `ConfigSection` per group, with the
 * divider between them.
 *
 * It used to inline ConfigSection's body instead of using it: the same
 * `section-${id}` element, the same with-padding ternary, the same header wrapping
 * a level-3 Heading, the same Flex. Two implementations of one component, so a fix
 * to the section chrome reached only one of them. Found 2026-08-05 by
 * `component-reuse-check`, which spotted this file rendering `config-section-header`
 * while never mentioning ConfigSection.
 *
 * @module features/components/ui/components/ServiceGroupList
 */

import React from 'react';
import type { ServiceGroup, UniqueField } from '../hooks/useComponentConfig';
import { ConfigSection } from '@/core/ui/components/forms';

export interface ServiceGroupListProps {
    groups: ServiceGroup[];
    renderFieldRow: (field: UniqueField, group: ServiceGroup) => React.ReactNode;
}

export function ServiceGroupList({ groups, renderFieldRow }: ServiceGroupListProps) {
    return (
        <>
            {groups.map((group, index) => (
                // `showDivider` carries what the old `index > 0` did — ConfigSection
                // renders the divider AND picks the padded variant off the same flag,
                // which is why the two conditions collapse into one prop.
                <ConfigSection
                    key={group.id}
                    id={group.id}
                    label={group.label}
                    showDivider={index > 0}
                >
                    {group.fields.map((field) => (
                        <React.Fragment key={field.key}>
                            {renderFieldRow(field, group)}
                        </React.Fragment>
                    ))}
                </ConfigSection>
            ))}
        </>
    );
}
