import React, { useEffect } from 'react';
import {
    View,
    Flex,
    Form,
    TextField,
    Heading,
    Text,
    Grid,
    Divider,
    Content
} from '@adobe/react-spectrum';
import ShoppingCart from '@spectrum-icons/workflow/ShoppingCart';
import Code from '@spectrum-icons/workflow/Code';
import Search from '@spectrum-icons/workflow/Search';
import GraphBarVertical from '@spectrum-icons/workflow/GraphBarVertical';
import Link from '@spectrum-icons/workflow/Link';
import ViewGrid from '@spectrum-icons/workflow/ViewGrid';
import { WizardState, ProjectTemplate } from '../../types';

interface WelcomeStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    onNext: () => void;
    onBack: () => void;
    setCanProceed: (canProceed: boolean) => void;
}

const TEMPLATE_COMPONENTS = [
    { icon: ShoppingCart, name: 'Storefront', description: 'Venia PWA Studio frontend' },
    { icon: ViewGrid, name: 'Admin Panel', description: 'Full Commerce admin' },
    { icon: Link, name: 'API Mesh', description: 'GraphQL orchestration' },
    { icon: Search, name: 'Live Search', description: 'AI-powered search' },
    { icon: GraphBarVertical, name: 'Catalog Service', description: 'Product management' },
    { icon: Code, name: 'Demo Inspector', description: 'Development tools' }
];

export function WelcomeStep({ state, updateState, setCanProceed }: WelcomeStepProps) {
    const validateProjectName = (value: string): string | undefined => {
        if (!value) return 'Project name is required';
        if (!/^[a-z0-9-]+$/.test(value)) {
            return 'Use lowercase letters, numbers, and hyphens only';
        }
        if (value.length < 3) return 'Name must be at least 3 characters';
        if (value.length > 30) return 'Name must be less than 30 characters';
        return undefined;
    };

    useEffect(() => {
        const isValid = 
            state.projectName.length >= 3 && 
            validateProjectName(state.projectName) === undefined;
        setCanProceed(isValid);
    }, [state.projectName, setCanProceed]);

    return (
        <View height="100%" UNSAFE_style={{ maxWidth: '100%' }}>
            <Grid
                columns={['1fr', '1fr']}
                gap="size-400"
                height="100%"
            >
                {/* Left Column - Project Details */}
                <View>
                    <Heading level={3} marginBottom="size-200" UNSAFE_style={{ fontSize: '16px' }}>
                        Project Information
                    </Heading>
                    
                    <Text marginBottom="size-300" UNSAFE_style={{ 
                        color: 'var(--spectrum-global-color-gray-600)',
                        fontSize: '13px'
                    }}>
                        Enter a unique name for your demo project. This will be used to identify your Commerce environment.
                    </Text>

                    <Form necessityIndicator="icon">
                        <TextField
                            label="Project Name"
                            value={state.projectName}
                            onChange={(value) => updateState({ projectName: value })}
                            placeholder="my-commerce-demo"
                            description="Lowercase letters, numbers, and hyphens only"
                            validationState={
                                state.projectName && validateProjectName(state.projectName) 
                                    ? 'invalid' 
                                    : state.projectName && !validateProjectName(state.projectName)
                                    ? 'valid'
                                    : undefined
                            }
                            errorMessage={
                                state.projectName 
                                    ? validateProjectName(state.projectName) 
                                    : undefined
                            }
                            isRequired
                            width="100%"
                            autoFocus
                        />
                    </Form>
                </View>

                {/* Right Column - Template Selection */}
                <View>
                    <Heading level={3} marginBottom="size-200" UNSAFE_style={{ fontSize: '16px' }}>
                        Template Configuration
                    </Heading>
                    
                    <View 
                        padding="size-300"
                        backgroundColor="gray-100"
                        borderRadius="medium"
                        marginBottom="size-200"
                        UNSAFE_style={{
                            border: '2px solid var(--spectrum-global-color-blue-400)'
                        }}
                    >
                        <Flex alignItems="center" gap="size-200" marginBottom="size-200">
                            <View 
                                width="size-600" 
                                height="size-600"
                                UNSAFE_style={{
                                    background: 'var(--spectrum-global-color-blue-100)',
                                    borderRadius: '8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                                <Text UNSAFE_style={{ fontSize: '24px' }}>☁️</Text>
                            </View>
                            <View flex>
                                <Heading level={4} UNSAFE_style={{ fontSize: '14px', marginBottom: '4px' }}>
                                    Adobe Commerce (Platform-as-a-Service)
                                </Heading>
                                <Text UNSAFE_style={{ fontSize: '12px', color: 'var(--spectrum-global-color-gray-600)' }}>
                                    Full Commerce instance with all services
                                </Text>
                            </View>
                        </Flex>

                        <Divider size="S" marginBottom="size-200" />

                        <Text UNSAFE_style={{ 
                            fontSize: '11px', 
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            color: 'var(--spectrum-global-color-gray-600)',
                            marginBottom: '12px'
                        }}>
                            Included Components
                        </Text>

                        <Grid columns={['1fr', '1fr']} gap="size-150">
                            {TEMPLATE_COMPONENTS.map((component) => {
                                const Icon = component.icon;
                                return (
                                    <Flex key={component.name} gap="size-100" alignItems="flex-start">
                                        <Icon 
                                            size="XS" 
                                            UNSAFE_style={{ 
                                                color: 'var(--spectrum-global-color-blue-600)',
                                                marginTop: '2px',
                                                flexShrink: 0
                                            }} 
                                        />
                                        <View flex>
                                            <Text UNSAFE_style={{ 
                                                fontSize: '12px', 
                                                fontWeight: 600,
                                                marginBottom: '2px'
                                            }}>
                                                {component.name}
                                            </Text>
                                            <Text UNSAFE_style={{ 
                                                fontSize: '11px', 
                                                color: 'var(--spectrum-global-color-gray-600)'
                                            }}>
                                                {component.description}
                                            </Text>
                                        </View>
                                    </Flex>
                                );
                            })}
                        </Grid>
                    </View>

                    <View 
                        padding="size-200"
                        backgroundColor="blue-100"
                        borderRadius="medium"
                    >
                        <Text UNSAFE_style={{ fontSize: '12px', color: 'var(--spectrum-global-color-blue-700)' }}>
                            ℹ️ This template provides a complete Commerce environment with all essential services pre-configured
                        </Text>
                    </View>
                </View>
            </Grid>
        </View>
    );
}