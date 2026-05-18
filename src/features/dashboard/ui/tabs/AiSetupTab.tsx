/**
 * AI Setup Tab
 *
 * Displays the AI setup health checks for a Demo Builder project:
 * - CLAUDE.md present and non-empty
 * - .claude/mcp.json valid JSON
 * - MCP server binary built
 * - Skill files present
 *
 * "Verify Now" refreshes all checks.
 * "Regenerate AI Files" re-runs context file generation then re-verifies.
 */

import { Button, Flex, Heading, Text, View } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useState } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { AiCheckResult, AiVerificationResult } from '@/features/ai/aiSetupVerifier';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface AiSetupTabProps {
    projectPath: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AiSetupTab({ projectPath }: AiSetupTabProps): React.ReactElement {
    const [result, setResult] = useState<AiVerificationResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const verify = useCallback(async (): Promise<void> => {
        setLoading(true);
        setError(null);
        try {
            const r = await webviewClient.request<AiVerificationResult>('verify-ai-setup', { projectPath });
            setResult(r);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Verification failed');
        } finally {
            setLoading(false);
        }
    }, [projectPath]);

    useEffect(() => {
        void verify();
    }, [verify]);

    const regenerate = useCallback(async (): Promise<void> => {
        setLoading(true);
        setError(null);
        try {
            await webviewClient.request('regenerate-ai-files', { projectPath });
            await verify();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Regeneration failed');
        } finally {
            setLoading(false);
        }
    }, [projectPath, verify]);

    return (
        <View padding="size-300">
            <Flex direction="column" gap="size-200">
                <Heading level={3}>AI Setup</Heading>

                {error && (
                    <Text UNSAFE_style={{ color: 'var(--spectrum-semantic-negative-color-default)' }}>
                        {error}
                    </Text>
                )}

                {result && <CheckList checks={result.checks} />}

                <Flex gap="size-100">
                    <Button
                        variant="secondary"
                        isDisabled={loading}
                        onPress={verify}
                    >
                        Verify Now
                    </Button>
                    <Button
                        variant="secondary"
                        isDisabled={loading}
                        onPress={regenerate}
                    >
                        Regenerate AI Files
                    </Button>
                </Flex>
            </Flex>
        </View>
    );
}

// ─── CheckList ────────────────────────────────────────────────────────────────

function CheckList({ checks }: { checks: AiCheckResult[] }): React.ReactElement {
    return (
        <Flex direction="column" gap="size-100">
            {checks.map(check => (
                <CheckRow key={check.name} check={check} />
            ))}
        </Flex>
    );
}

function CheckRow({ check }: { check: AiCheckResult }): React.ReactElement {
    const icon = statusIcon(check.status);
    return (
        <Flex direction="column" gap="size-50">
            <Text>
                {icon} {check.name}
            </Text>
            {check.message && (
                <Text UNSAFE_style={{ fontSize: '12px', color: 'var(--spectrum-global-color-gray-600)' }}>
                    {check.message}
                </Text>
            )}
        </Flex>
    );
}

function statusIcon(status: AiCheckResult['status']): string {
    switch (status) {
        case 'ok': return '✅';
        case 'warning': return '⚠️';
        case 'error': return '❌';
    }
}
