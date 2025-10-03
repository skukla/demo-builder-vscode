import React, { useEffect, useState, useMemo } from 'react';
import {
    View,
    Heading,
    Text,
    SearchField,
    ListView,
    Item,
    Well,
    Flex,
    Button,
    Content,
    ActionButton,
    Badge
} from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import Building from '@spectrum-icons/workflow/Building';
import { WizardState } from '../../types';
import { vscode } from '../../app/vscodeApi';
import { LoadingDisplay } from '../shared/LoadingDisplay';

interface Organization {
    id: string;
    code: string;
    name: string;
}

interface OrgSelectionStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    setCanProceed: (canProceed: boolean) => void;
}

export function OrgSelectionStep({ state, updateState, setCanProceed }: OrgSelectionStepProps) {
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedOrgId, setSelectedOrgId] = useState<string | null>(state.adobeOrg?.id || null);

    useEffect(() => {
        // Request organizations when component mounts
        loadOrganizations();

        // Listen for organizations from extension
        const unsubscribe = vscode.onMessage('organizations', (data) => {
            if (Array.isArray(data)) {
                setOrganizations(data);
                setError(null);
                
                // Auto-select if only one org
                if (data.length === 1) {
                    selectOrganization(data[0]);
                }
            } else {
                setError('Failed to load organizations');
            }
            setIsLoading(false);
        });

        return unsubscribe;
    }, []);

    useEffect(() => {
        // Can proceed if an organization is selected
        setCanProceed(!!state.adobeOrg?.id);
    }, [state.adobeOrg, setCanProceed]);

    const loadOrganizations = () => {
        setIsLoading(true);
        setError(null);
        vscode.requestOrganizations();
    };

    const selectOrganization = (org: Organization) => {
        setSelectedOrgId(org.id);
        updateState({
            adobeOrg: {
                id: org.id,
                code: org.code,
                name: org.name
            }
        });
    };

    // Filter organizations based on search query
    const filteredOrganizations = useMemo(() => {
        if (!searchQuery.trim()) {
            return organizations;
        }
        
        const query = searchQuery.toLowerCase();
        return organizations.filter(org => 
            org.name.toLowerCase().includes(query) ||
            org.code.toLowerCase().includes(query)
        );
    }, [organizations, searchQuery]);

    if (isLoading) {
        return (
            <div style={{ maxWidth: '800px', width: '100%', margin: '0', padding: '24px' }}>
                <View>
                <Heading level={2} marginBottom="size-300">
                    Select Organization
                </Heading>
                <LoadingDisplay 
                    size="S" 
                    message="Loading organizations..."
                    centered={false}
                />
                </View>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ maxWidth: '800px', width: '100%', margin: '0', padding: '24px' }}>
                <View>
                <Heading level={2} marginBottom="size-300">
                    Select Organization
                </Heading>
                <Well>
                    <Flex gap="size-200" alignItems="center">
                        <AlertCircle UNSAFE_className="text-red-600" />
                        <View flex>
                            <Text><strong>Error Loading Organizations</strong></Text>
                            <Text UNSAFE_className="text-sm text-gray-700">{error}</Text>
                        </View>
                    </Flex>
                </Well>
                <Button variant="secondary" onPress={loadOrganizations} marginTop="size-200">
                    Retry
                </Button>
                </View>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: '800px', width: '100%', margin: '0', padding: '24px' }}>
            <Heading level={2} marginBottom="size-300">
                Select Organization
            </Heading>
            
            <Text marginBottom="size-400">
                Choose the Adobe organization where your project will be created.
            </Text>

            {organizations.length > 0 ? (
                <>
                    {/* Search Field */}
                    <SearchField
                        label="Search organizations"
                        placeholder="Type to filter organizations..."
                        value={searchQuery}
                        onChange={setSearchQuery}
                        width="100%"
                        marginBottom="size-200"
                    />

                    {/* Results count */}
                    <Flex justifyContent="space-between" marginBottom="size-100">
                        <Text UNSAFE_className="text-sm text-gray-700">
                            {filteredOrganizations.length === organizations.length 
                                ? `${organizations.length} organizations available`
                                : `Showing ${filteredOrganizations.length} of ${organizations.length} organizations`
                            }
                        </Text>
                        {searchQuery && (
                            <ActionButton 
                                isQuiet 
                                onPress={() => setSearchQuery('')}
                            >
                                Clear search
                            </ActionButton>
                        )}
                    </Flex>

                    {/* Organizations List */}
                    {filteredOrganizations.length > 0 ? (
                        <ListView
                            items={filteredOrganizations}
                            selectionMode="single"
                            selectedKeys={selectedOrgId ? [selectedOrgId] : []}
                            onSelectionChange={(keys) => {
                                const selectedId = Array.from(keys)[0];
                                if (selectedId) {
                                    const org = organizations.find(o => o.id === selectedId);
                                    if (org) selectOrganization(org);
                                }
                            }}
                            height="size-3600"
                            width="100%"
                            marginBottom="size-300"
                        >
                            {(item) => (
                                <Item key={item.id} textValue={item.name}>
                                    <Building />
                                    <Text>{item.name}</Text>
                                    <Text slot="description" UNSAFE_className="text-sm">
                                        {item.code}
                                    </Text>
                                    {selectedOrgId === item.id && (
                                        <Badge variant="info" marginStart="auto">
                                            Selected
                                        </Badge>
                                    )}
                                </Item>
                            )}
                        </ListView>
                    ) : (
                        <Well>
                            <Flex gap="size-200" alignItems="center">
                                <AlertCircle UNSAFE_className="text-yellow-600" />
                                <Text>
                                    No organizations found matching "{searchQuery}". Try a different search term.
                                </Text>
                            </Flex>
                        </Well>
                    )}

                    {/* Selected Organization Display */}
                    {state.adobeOrg && (
                        <Well backgroundColor="blue-100">
                            <Flex gap="size-200" alignItems="center">
                                <Building />
                                <Content>
                                    <Text>
                                        <strong>Selected:</strong> {state.adobeOrg.name}
                                    </Text>
                                    <Text UNSAFE_className="text-sm text-gray-700">
                                        Code: {state.adobeOrg.code}
                                    </Text>
                                </Content>
                            </Flex>
                        </Well>
                    )}
                </>
            ) : (
                <Well>
                    <Flex gap="size-200" alignItems="center">
                        <AlertCircle color="notice" />
                        <Text>No organizations found. Please check your Adobe authentication.</Text>
                    </Flex>
                </Well>
            )}
        </div>
    );
}