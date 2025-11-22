import React from 'react';
import { Form, Flex, Divider, Heading, Text } from '@adobe/react-spectrum';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { ServiceGroup, UniqueField } from '../ComponentConfigStep';

interface ConfigurationFormProps {
    serviceGroups: ServiceGroup[];
    renderField: (field: UniqueField) => React.ReactNode;
    isLoading: boolean;
}

const SECTION_HEADER_STYLE = {
    paddingBottom: '4px',
    marginBottom: '12px',
    borderBottom: '1px solid var(--spectrum-global-color-gray-200)',
} as const;

export function ConfigurationForm({ serviceGroups, renderField, isLoading }: ConfigurationFormProps) {
    if (isLoading) {
        return (
            <Flex direction="column" justifyContent="center" alignItems="center" height="350px">
                <LoadingDisplay
                    size="L"
                    message="Loading component configurations..."
                />
            </Flex>
        );
    }

    if (serviceGroups.length === 0) {
        return (
            <Text UNSAFE_className="text-gray-600">
                No components requiring configuration were selected.
            </Text>
        );
    }

    return (
        <Form UNSAFE_style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
            {serviceGroups.map((group, index) => {
                return (
                    <React.Fragment key={group.id}>
                        {index > 0 && (
                            <Divider
                                size="S"
                                marginTop="size-100"
                                marginBottom="size-100"
                                data-testid="service-group-divider"
                            />
                        )}

                        <div id={`section-${group.id}`} style={{
                            scrollMarginTop: '-16px',
                            paddingTop: index > 0 ? '4px' : '0',
                            paddingBottom: '4px',
                        }}>
                            {/* Section Header */}
                            <div data-testid="section-header" style={SECTION_HEADER_STYLE}>
                                <Heading level={3}>{group.label}</Heading>
                            </div>

                            {/* Section Content */}
                            <Flex direction="column" marginBottom="size-100">
                                {group.fields.map(field => renderField(field))}
                            </Flex>
                        </div>
                    </React.Fragment>
                );
            })}
        </Form>
    );
}
