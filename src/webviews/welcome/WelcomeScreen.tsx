import React, { useEffect, useState } from 'react';
import {
    View,
    Flex,
    Heading,
    Text,
    Grid,
    Divider,
    ActionButton,
    Button,
    TextField,
    Form,
    DialogTrigger,
    Dialog,
    Content,
    ButtonGroup,
    AlertDialog,
    Well
} from '@adobe/react-spectrum';
import Add from '@spectrum-icons/workflow/Add';
import FolderOpen from '@spectrum-icons/workflow/FolderOpen';
import Key from '@spectrum-icons/workflow/Key';
import Book from '@spectrum-icons/workflow/Book';
import Settings from '@spectrum-icons/workflow/Settings';
import Star from '@spectrum-icons/workflow/Star';
import { vscode } from '../app/vscodeApi';

interface WelcomeScreenProps {
    theme?: 'light' | 'dark';
}

export function WelcomeScreen({ theme = 'dark' }: WelcomeScreenProps) {
    const [isLicensed, setIsLicensed] = useState<boolean | null>(null);
    const [licenseKey, setLicenseKey] = useState('');
    const [isValidating, setIsValidating] = useState(false);

    useEffect(() => {
        // Listen for initialization data
        const unsubscribe = vscode.onMessage('init', (data) => {
            if (data.isLicensed !== undefined) {
                setIsLicensed(data.isLicensed);
            }
        });

        // Request initialization
        vscode.postMessage('ready');

        return unsubscribe;
    }, []);

    const handleCreateNew = () => {
        console.log('handleCreateNew called, isLicensed:', isLicensed);
        if (isLicensed) {
            console.log('Sending create-new message');
            vscode.postMessage('create-new');
        }
    };

    const handleOpenExisting = () => {
        if (isLicensed) {
            vscode.postMessage('open-project');
        }
    };


    const handleValidateLicense = async () => {
        if (!licenseKey) return;
        
        setIsValidating(true);
        vscode.postMessage('validate-license', { licenseKey });
        
        // Listen for response
        const unsubscribe = vscode.onMessage('license-validated', (data) => {
            setIsValidating(false);
            if (data.valid) {
                setIsLicensed(true);
                setLicenseKey('');
            }
            unsubscribe();
        });
    };

    const handleOpenDocs = () => {
        vscode.postMessage('open-docs');
    };

    const handleOpenSettings = () => {
        vscode.postMessage('open-settings');
    };

    // Show license prompt if not licensed
    if (isLicensed === false) {
        return (
            <View padding="size-400" height="100vh" backgroundColor="gray-50">
                <Flex direction="column" gap="size-400" alignItems="center" justifyContent="center" height="100%">
                    <View maxWidth="600px" width="100%">
                        <Flex direction="column" gap="size-300" alignItems="center">
                            <Key size="XXL" UNSAFE_style={{ color: 'var(--spectrum-global-color-gray-600)' }} />
                            
                            <Heading level={1} UNSAFE_style={{ fontSize: '28px', textAlign: 'center' }}>
                                License Required
                            </Heading>
                            
                            <Text UNSAFE_style={{ 
                                fontSize: '14px', 
                                color: 'var(--spectrum-global-color-gray-700)',
                                textAlign: 'center',
                                marginBottom: '24px'
                            }}>
                                Adobe Demo Builder requires a valid license key to activate.
                                Please enter your license key below to continue.
                            </Text>

                            <Form width="100%">
                                <TextField
                                    label="License Key"
                                    placeholder="DEMO-2024-XXXXXX"
                                    value={licenseKey}
                                    onChange={setLicenseKey}
                                    width="100%"
                                    description="Enter the license key provided by Adobe"
                                    validationState={
                                        licenseKey && !licenseKey.match(/^DEMO-\d{4}-[A-Z0-9]{6}$/)
                                            ? 'invalid'
                                            : undefined
                                    }
                                    errorMessage={
                                        licenseKey && !licenseKey.match(/^DEMO-\d{4}-[A-Z0-9]{6}$/)
                                            ? 'Invalid license key format'
                                            : undefined
                                    }
                                />
                            </Form>

                            <ButtonGroup>
                                <Button 
                                    variant="accent"
                                    onPress={handleValidateLicense}
                                    isDisabled={!licenseKey || !licenseKey.match(/^DEMO-\d{4}-[A-Z0-9]{6}$/) || isValidating}
                                >
                                    {isValidating ? 'Validating...' : 'Activate License'}
                                </Button>
                                <Button variant="secondary" onPress={handleOpenDocs}>
                                    Get License
                                </Button>
                            </ButtonGroup>

                            <Text UNSAFE_style={{ 
                                fontSize: '12px', 
                                color: 'var(--spectrum-global-color-gray-600)',
                                textAlign: 'center',
                                marginTop: '24px'
                            }}>
                                Don't have a license? Visit the Adobe Demo Builder portal to request one.
                            </Text>
                        </Flex>
                    </View>
                </Flex>
            </View>
        );
    }

    // Show loading if license status unknown
    if (isLicensed === null) {
        return (
            <View padding="size-400" height="100vh" backgroundColor="gray-50">
                <Flex direction="column" gap="size-400" alignItems="center" justifyContent="center" height="100%">
                    <Text>Loading...</Text>
                </Flex>
            </View>
        );
    }

    // Main welcome screen (licensed)
    return (
        <View height="100vh" backgroundColor="gray-50">
            <Flex direction="column" alignItems="center" justifyContent="center" height="100%">
                <View width="100%" maxWidth="900px" padding="size-400">
                    {/* Header */}
                    <View marginBottom="size-400">
                        <Flex justifyContent="space-between" alignItems="center">
                            <View>
                                <Heading level={1} UNSAFE_style={{ fontSize: '28px', marginBottom: '8px' }}>
                                    Adobe Demo Builder
                                </Heading>
                                <Text UNSAFE_style={{ fontSize: '14px', color: 'var(--spectrum-global-color-gray-600)' }}>
                                    Create and manage Adobe Commerce demo environments
                                </Text>
                            </View>
                            <Flex gap="size-100">
                                <ActionButton isQuiet onPress={handleOpenDocs} height="32px">
                                    <Book size="S" />
                                    <Text>Docs</Text>
                                </ActionButton>
                                <ActionButton isQuiet onPress={handleOpenSettings} height="32px">
                                    <Settings size="S" />
                                    <Text>Settings</Text>
                                </ActionButton>
                            </Flex>
                        </Flex>
                    </View>

                    <Divider size="S" marginBottom="size-400" />

                    {/* Main Actions */}
                    <Grid
                        columns={['1fr', '1fr']}
                        gap="size-300"
                    >
                        {/* Create New Project Card */}
                        <ActionButton
                            onPress={handleCreateNew}
                            isQuiet
                            UNSAFE_style={{
                                background: 'var(--spectrum-global-color-gray-100)',
                                borderRadius: '8px',
                                padding: '40px',
                                transition: 'all 0.15s ease',
                                border: '1px solid var(--spectrum-global-color-gray-300)',
                                textAlign: 'center',
                                minHeight: '200px',
                                width: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'center',
                                alignItems: 'center',
                                cursor: 'pointer',
                                ':hover': {
                                    background: 'var(--spectrum-global-color-gray-200)',
                                    borderColor: 'var(--spectrum-global-color-blue-400)'
                                }
                            }}
                        >
                            <View UNSAFE_style={{ marginBottom: '20px', transform: 'scale(1.8)' }}>
                                <Add size="L" UNSAFE_style={{ color: 'var(--spectrum-global-color-blue-600)' }} />
                            </View>
                            <Heading level={3} UNSAFE_style={{ marginBottom: '8px', fontSize: '22px' }}>
                                Create New Project
                            </Heading>
                            <Text UNSAFE_style={{ fontSize: '15px', color: 'var(--spectrum-global-color-gray-700)' }}>
                                Set up a new demo environment
                            </Text>
                        </ActionButton>

                        {/* Open Existing Project Card */}
                        <ActionButton
                            onPress={handleOpenExisting}
                            isQuiet
                            UNSAFE_style={{
                                background: 'var(--spectrum-global-color-gray-100)',
                                borderRadius: '8px',
                                padding: '40px',
                                transition: 'all 0.15s ease',
                                border: '1px solid var(--spectrum-global-color-gray-300)',
                                textAlign: 'center',
                                minHeight: '200px',
                                width: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'center',
                                alignItems: 'center',
                                cursor: 'pointer',
                                ':hover': {
                                    background: 'var(--spectrum-global-color-gray-200)',
                                    borderColor: 'var(--spectrum-global-color-blue-400)'
                                }
                            }}
                        >
                            <View UNSAFE_style={{ marginBottom: '20px', transform: 'scale(1.8)' }}>
                                <FolderOpen size="L" UNSAFE_style={{ color: 'var(--spectrum-global-color-gray-700)' }} />
                            </View>
                            <Heading level={3} UNSAFE_style={{ marginBottom: '8px', fontSize: '22px' }}>
                                Open Existing Project
                            </Heading>
                            <Text UNSAFE_style={{ fontSize: '15px', color: 'var(--spectrum-global-color-gray-700)' }}>
                                Continue working on a demo
                            </Text>
                        </ActionButton>
                    </Grid>
                </View>
            </Flex>
        </View>
    );
}