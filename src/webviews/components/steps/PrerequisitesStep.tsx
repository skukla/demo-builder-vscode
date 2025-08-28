import React, { useEffect, useState } from 'react';
import {
    View,
    Flex,
    Heading,
    Text,
    Button,
    ProgressCircle,
    Well,
    Content,
    ActionButton,
    Divider
} from '@adobe/react-spectrum';
import ChevronDown from '@spectrum-icons/workflow/ChevronDown';
import ChevronUp from '@spectrum-icons/workflow/ChevronUp';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import CloseCircle from '@spectrum-icons/workflow/CloseCircle';
import { WizardState, PrerequisiteCheck } from '../../types';
import { vscode } from '../../app/vscodeApi';
import { TerminalOutput } from '../feedback/TerminalOutput';

interface PrerequisitesStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    onNext: () => void;
    onBack: () => void;
    setCanProceed: (canProceed: boolean) => void;
}

const PREREQUISITES: PrerequisiteCheck[] = [
    {
        name: 'Node.js',
        description: 'JavaScript runtime (v18 or v20)',
        status: 'pending',
        canInstall: true,
        isOptional: false
    },
    {
        name: 'Node Version Manager',
        description: 'Manage multiple Node.js versions (fnm)',
        status: 'pending',
        canInstall: true,
        isOptional: false
    },
    {
        name: 'Adobe I/O CLI',
        description: 'Command-line interface for Adobe services',
        status: 'pending',
        canInstall: true,
        isOptional: false
    },
    {
        name: 'API Mesh Plugin',
        description: 'Adobe API Mesh management',
        status: 'pending',
        canInstall: true,
        isOptional: false
    }
];

export function PrerequisitesStep({ setCanProceed }: PrerequisitesStepProps) {
    const [checks, setChecks] = useState<PrerequisiteCheck[]>(PREREQUISITES);
    const [isChecking, setIsChecking] = useState(false);
    const [showTerminal, setShowTerminal] = useState(false);
    const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
    const [installingIndex, setInstallingIndex] = useState<number | null>(null);

    useEffect(() => {
        // Check prerequisites on mount
        checkPrerequisites();

        // Listen for feedback from extension
        const unsubscribe = vscode.onMessage('prerequisite-status', (data) => {
            const { index, status, message, log } = data;
            
            if (log) {
                setTerminalLogs(prev => [...prev, log]);
            }

            setChecks(prev => {
                const newChecks = [...prev];
                if (newChecks[index]) {
                    newChecks[index] = {
                        ...newChecks[index],
                        status,
                        message
                    };
                }
                return newChecks;
            });

            // If installation complete, move to next
            if (status === 'success' && installingIndex === index) {
                setInstallingIndex(null);
                // Check if there are more to install
                const nextToInstall = checks.findIndex(
                    (check, idx) => idx > index && check.status === 'error' && check.canInstall
                );
                if (nextToInstall !== -1) {
                    installPrerequisite(nextToInstall);
                }
            }
        });

        return unsubscribe;
    }, []);

    useEffect(() => {
        // Check if all required prerequisites are met
        const allRequired = checks
            .filter(check => !check.isOptional)
            .every(check => check.status === 'success' || check.status === 'warning');
        setCanProceed(allRequired);
    }, [checks, setCanProceed]);

    const checkPrerequisites = () => {
        setIsChecking(true);
        setTerminalLogs([]);
        vscode.postMessage('check-prerequisites');

        // Set all to checking status
        setChecks(prev => prev.map(check => ({
            ...check,
            status: 'checking'
        })));
    };

    const installPrerequisite = (index: number) => {
        setInstallingIndex(index);
        setShowTerminal(true);
        setTerminalLogs(prev => [...prev, `\nInstalling ${checks[index].name}...\n`]);
        
        vscode.postMessage('install-prerequisite', { 
            index, 
            name: checks[index].name 
        });

        setChecks(prev => {
            const newChecks = [...prev];
            newChecks[index].status = 'checking';
            newChecks[index].message = 'Installing...';
            return newChecks;
        });
    };

    const installAll = () => {
        const firstToInstall = checks.findIndex(
            check => check.status === 'error' && check.canInstall
        );
        if (firstToInstall !== -1) {
            installPrerequisite(firstToInstall);
        }
    };

    const getStatusIcon = (status: PrerequisiteCheck['status']) => {
        switch (status) {
            case 'success':
                return <CheckmarkCircle color="positive" />;
            case 'error':
                return <CloseCircle color="negative" />;
            case 'warning':
                return <AlertCircle color="notice" />;
            case 'checking':
                return <ProgressCircle size="S" isIndeterminate />;
            default:
                return <div style={{ width: '20px', height: '20px' }} />;
        }
    };

    const hasErrors = checks.some(check => check.status === 'error');
    const hasInstallable = checks.some(check => check.status === 'error' && check.canInstall);

    return (
        <View maxWidth="size-6000" height="100%" UNSAFE_style={{ display: 'flex', flexDirection: 'column' }}>
            <Text marginBottom="size-200" UNSAFE_style={{ color: 'var(--spectrum-global-color-gray-700)', fontSize: '14px' }}>
                Checking required tools. Missing tools can be installed automatically.
            </Text>

            <View 
                flex
                UNSAFE_style={{ 
                    overflowY: 'auto',
                    marginBottom: '16px',
                    border: '1px solid var(--spectrum-global-color-gray-300)',
                    borderRadius: '4px',
                    padding: '12px'
                }}
            >
                <Flex direction="column" gap="size-150">
                    {checks.map((check, index) => (
                        <Flex key={check.name} justifyContent="space-between" alignItems="center" 
                            UNSAFE_style={{ 
                                padding: '8px',
                                borderBottom: index < checks.length - 1 ? '1px solid var(--spectrum-global-color-gray-200)' : 'none'
                            }}
                        >
                            <Flex gap="size-150" alignItems="center" flex>
                                {getStatusIcon(check.status)}
                                <View flex>
                                    <Text UNSAFE_style={{ fontSize: '13px', fontWeight: 600 }}>
                                        {check.name}
                                        {check.isOptional && <span style={{ fontWeight: 400, opacity: 0.7 }}> (Optional)</span>}
                                    </Text>
                                    <Text UNSAFE_style={{ fontSize: '12px', color: 'var(--spectrum-global-color-gray-600)' }}>
                                        {check.description}
                                    </Text>
                                    {check.message && (
                                        <Text UNSAFE_style={{ 
                                            fontSize: '11px',
                                            color: check.status === 'error' 
                                                ? 'var(--spectrum-global-color-red-600)' 
                                                : 'var(--spectrum-global-color-gray-600)'
                                        }}>
                                            {check.message}
                                        </Text>
                                    )}
                                </View>
                            </Flex>
                            {check.status === 'error' && check.canInstall && (
                                <Button
                                    variant="secondary"
                                    isQuiet
                                    onPress={() => installPrerequisite(index)}
                                    isDisabled={installingIndex !== null}
                                    UNSAFE_style={{ minWidth: '60px', height: '28px', fontSize: '12px' }}
                                >
                                    Install
                                </Button>
                            )}
                        </Flex>
                    ))}
                </Flex>
            </View>

            <Flex gap="size-150" marginBottom="size-200">
                <Button
                    variant="secondary"
                    onPress={checkPrerequisites}
                    isDisabled={isChecking || installingIndex !== null}
                    UNSAFE_style={{ height: '32px', fontSize: '13px' }}
                >
                    {isChecking ? 'Checking...' : 'Recheck'}
                </Button>
                {hasInstallable && (
                    <Button
                        variant="accent"
                        onPress={installAll}
                        isDisabled={installingIndex !== null}
                        UNSAFE_style={{ height: '32px', fontSize: '13px' }}
                    >
                        Install Missing
                    </Button>
                )}
            </Flex>

            {(terminalLogs.length > 0 || installingIndex !== null) && showTerminal && (
                <View 
                    UNSAFE_style={{ 
                        maxHeight: '150px',
                        overflow: 'hidden',
                        borderTop: '1px solid var(--spectrum-global-color-gray-300)',
                        paddingTop: '8px'
                    }}
                >
                    <Flex justifyContent="space-between" alignItems="center" marginBottom="size-100">
                        <Text UNSAFE_style={{ fontSize: '12px', fontWeight: 600 }}>Terminal Output</Text>
                        <ActionButton 
                            isQuiet 
                            onPress={() => setShowTerminal(!showTerminal)}
                            UNSAFE_style={{ height: '24px', padding: '0 4px' }}
                        >
                            <ChevronUp />
                        </ActionButton>
                    </Flex>
                    <TerminalOutput logs={terminalLogs} />
                </View>
            )}

            {!hasErrors && checks.every(check => check.status === 'success') && (
                <View 
                    padding="size-150" 
                    backgroundColor="green-100"
                    borderRadius="medium"
                    UNSAFE_style={{ marginTop: 'auto' }}
                >
                    <Flex gap="size-100" alignItems="center">
                        <CheckmarkCircle size="S" color="positive" />
                        <Text UNSAFE_style={{ fontSize: '13px', color: 'var(--spectrum-global-color-green-700)' }}>
                            All prerequisites installed!
                        </Text>
                    </Flex>
                </View>
            )}
        </View>
    );
}