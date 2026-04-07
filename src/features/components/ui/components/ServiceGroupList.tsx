/**
 * ServiceGroupList
 *
 * Renders a list of service groups with dividers, section headings, and per-field
 * rows. Shared between ComponentConfigStep and ConnectStoreStepContent.
 *
 * @module features/components/ui/components/ServiceGroupList
 */

import { Flex, Heading, Divider } from '@adobe/react-spectrum';
import React from 'react';
import type { ServiceGroup, UniqueField } from '../hooks/useComponentConfig';

export interface ServiceGroupListProps {
    groups: ServiceGroup[];
    renderFieldRow: (field: UniqueField, group: ServiceGroup) => React.ReactNode;
}

export function ServiceGroupList({ groups, renderFieldRow }: ServiceGroupListProps) {
    return (
        <>
            {groups.map((group, index) => (
                <React.Fragment key={group.id}>
                    {index > 0 && (
                        <Divider
                            size="S"
                            marginTop="size-100"
                            marginBottom="size-100"
                        />
                    )}
                    <div id={`section-${group.id}`} className={index > 0 ? 'config-section-with-padding' : 'config-section'}>
                        <div className="config-section-header">
                            <Heading level={3}>{group.label}</Heading>
                        </div>
                        <Flex direction="column" marginBottom="size-100">
                            {group.fields.map(field => (
                                <React.Fragment key={field.key}>
                                    {renderFieldRow(field, group)}
                                </React.Fragment>
                            ))}
                        </Flex>
                    </div>
                </React.Fragment>
            ))}
        </>
    );
}
