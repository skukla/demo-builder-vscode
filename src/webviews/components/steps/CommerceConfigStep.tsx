import React, { useEffect, useState } from 'react';
import {
    View,
    Heading,
    Text,
    TextField,
    Checkbox,
    Well,
    Flex,
    Content,
    Picker,
    Item,
    Form
} from '@adobe/react-spectrum';
import Link from '@spectrum-icons/workflow/Link';
import Settings from '@spectrum-icons/workflow/Settings';
import { WizardState } from '../../types';
import { vscode } from '../../app/vscodeApi';

interface CommerceConfigStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    setCanProceed: (canProceed: boolean) => void;
}

export function CommerceConfigStep({ state, updateState, setCanProceed }: CommerceConfigStepProps) {
    const [commerceUrl, setCommerceUrl] = useState(state.commerceConfig?.url || '');
    const [adminUser, setAdminUser] = useState(state.commerceConfig?.adminUser || 'admin');
    const [adminPassword, setAdminPassword] = useState(state.commerceConfig?.adminPassword || '');
    const [apiKey, setApiKey] = useState(state.commerceConfig?.apiKey || '');
    const [environmentType, setEnvironmentType] = useState(state.commerceConfig?.environment || 'staging');
    const [enableSampleData, setEnableSampleData] = useState(state.commerceConfig?.sampleData !== false);
    const [urlError, setUrlError] = useState<string>('');

    useEffect(() => {
        // Listen for validation results
        const unsubscribe = vscode.onMessage('validation-result', (data) => {
            if (data.field === 'commerceUrl') {
                setUrlError(data.isValid ? '' : data.message);
            }
        });

        return unsubscribe;
    }, []);

    useEffect(() => {
        // Save configuration to state
        updateState({
            commerceConfig: {
                url: commerceUrl,
                adminUser,
                adminPassword,
                apiKey,
                environment: environmentType,
                sampleData: enableSampleData
            }
        });

        // Validate if we can proceed
        const canProceed = !!(
            commerceUrl && 
            !urlError &&
            adminUser &&
            adminPassword
        );
        setCanProceed(canProceed);
    }, [commerceUrl, adminUser, adminPassword, apiKey, environmentType, enableSampleData, urlError]);

    const validateUrl = (url: string) => {
        setCommerceUrl(url);
        if (url) {
            vscode.requestValidation('commerceUrl', url);
        } else {
            setUrlError('');
        }
    };

    return (
        <div style={{ maxWidth: '800px', width: '100%', margin: '0', padding: '24px' }}>
            <Heading level={2} marginBottom="size-300">
                Commerce Configuration
            </Heading>
            
            <Text marginBottom="size-400">
                Configure your Adobe Commerce instance settings for the demo environment.
            </Text>

            <Form>
                <Well marginBottom="size-400">
                    <Flex direction="column" gap="size-200">
                        <Flex gap="size-200" alignItems="center">
                            <Link />
                            <Text><strong>Commerce Instance</strong></Text>
                        </Flex>
                        
                        <TextField
                            label="Commerce URL"
                            placeholder="https://your-instance.magento.cloud"
                            value={commerceUrl}
                            onChange={validateUrl}
                            validationState={urlError ? 'invalid' : undefined}
                            errorMessage={urlError}
                            width="100%"
                            isRequired
                            description="The URL of your Adobe Commerce instance"
                        />

                        <Picker
                            label="Environment Type"
                            selectedKey={environmentType}
                            onSelectionChange={(key) => setEnvironmentType(key.toString())}
                            width="100%"
                        >
                            <Item key="staging">Staging</Item>
                            <Item key="production">Production</Item>
                            <Item key="development">Development</Item>
                        </Picker>
                    </Flex>
                </Well>

                <Well marginBottom="size-400">
                    <Flex direction="column" gap="size-200">
                        <Flex gap="size-200" alignItems="center">
                            <Settings />
                            <Text><strong>Admin Credentials</strong></Text>
                        </Flex>
                        
                        <TextField
                            label="Admin Username"
                            value={adminUser}
                            onChange={setAdminUser}
                            width="100%"
                            isRequired
                            description="Username for Commerce admin panel"
                        />

                        <TextField
                            label="Admin Password"
                            type="password"
                            value={adminPassword}
                            onChange={setAdminPassword}
                            width="100%"
                            isRequired
                            description="Password for Commerce admin panel"
                        />

                        <TextField
                            label="API Key (Optional)"
                            value={apiKey}
                            onChange={setApiKey}
                            width="100%"
                            description="API key for Commerce web APIs"
                        />
                    </Flex>
                </Well>

                <Well>
                    <Flex direction="column" gap="size-200">
                        <Text><strong>Additional Options</strong></Text>
                        
                        <Checkbox 
                            isSelected={enableSampleData}
                            onChange={setEnableSampleData}
                        >
                            Install sample data
                        </Checkbox>
                        
                        <Text UNSAFE_className="text-sm text-gray-700">
                            Sample data includes products, categories, and customer data for demo purposes.
                        </Text>
                    </Flex>
                </Well>

                {state.adobeProject && (
                    <Well marginTop="size-400" backgroundColor="blue-100">
                        <Content>
                            <Text UNSAFE_className="text-sm text-gray-700">
                                This configuration will be used for project: <strong>{state.adobeProject.title}</strong>
                            </Text>
                        </Content>
                    </Well>
                )}
            </Form>
        </div>
    );
}