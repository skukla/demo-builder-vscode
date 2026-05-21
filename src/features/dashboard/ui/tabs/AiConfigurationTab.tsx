/**
 * AI Configuration Tab (Cycle D)
 *
 * Replaces the older `AiSetupTab.tsx`. Renders the Cycle C AI inventory payload
 * (skills + project MCPs + session MCPs) plus the global MCP registration
 * state from `~/.claude.json`. Four rollup rows expand to show details:
 *
 *   - Skills              → name + description + source classification
 *   - Project MCP Servers → server id + each `tools/list` entry
 *   - Session MCP Servers → display name + needsAuth indicator
 *   - Global MCP Registration → `registered` / `unregistered` / `declined`
 *
 * Actions:
 *   - Refresh            → dispatches `inspect-mcp`, then re-runs verify
 *   - Regenerate AI Files → dispatches `regenerate-ai-files`, then re-runs verify
 *   - Register (when not already registered) → dispatches `register-global-mcp`,
 *     then re-runs verify
 *
 * Composition notes (per Batch D3 plan):
 *   - Composes only existing primitives (StatusCard, useSetToggle,
 *     useAsyncOperation, ChevronDown/Right). No new UI abstractions.
 *   - Inline collapsible-row JSX matches NavigationPanel:84-119 — DO NOT extract.
 *   - `inspect-mcp` is the refresh surface — do not bypass.
 */

import { Button, Flex, Heading, Text, View } from '@adobe/react-spectrum';
import ChevronDown from '@spectrum-icons/workflow/ChevronDown';
import ChevronRight from '@spectrum-icons/workflow/ChevronRight';
import React, { useCallback, useEffect, useState } from 'react';
import { StatusCard } from '@/core/ui/components/feedback/StatusCard';
import { useAsyncOperation } from '@/core/ui/hooks/useAsyncOperation';
import { useSetToggle } from '@/core/ui/hooks/useSetToggle';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { AiCheckResult } from '@/features/ai/aiSetupVerifier';
import type { AiInventory, McpInventoryEntry, SessionMcpEntry, SkillInventoryEntry } from '@/types/ai';

// ─── Style constants ──────────────────────────────────────────────────────────
// Hoisted at module scope so the file's per-render `UNSAFE_style={{...}}`
// literal count stays under the SOP inline-style threshold (5).

const STYLE_ERROR_TEXT = { color: 'var(--spectrum-semantic-negative-color-default)' } as const;
const STYLE_ROW_ERROR = {
    fontSize: '12px',
    color: 'var(--spectrum-global-color-gray-600)',
    marginLeft: '24px',
} as const;
const STYLE_SMALL_TEXT = { fontSize: '12px' } as const;
const STYLE_TAG_TEXT = { fontSize: '11px', textTransform: 'uppercase' as const };
const STYLE_BOLD = { fontWeight: 600 } as const;
const STYLE_MONO = { fontFamily: 'monospace' } as const;
const STYLE_INDENT = { marginLeft: '16px' } as const;
const STYLE_NEEDS_AUTH = { fontSize: '11px', color: 'var(--spectrum-global-color-yellow-700)' } as const;

// ─── Public types ─────────────────────────────────────────────────────────────

export interface AiConfigurationTabProps {
    projectPath: string;
}

type GlobalMcpRegistrationStateValue = 'registered' | 'declined' | 'unregistered';

/**
 * Shape returned by the `verify-ai-setup` handler. Backwards compatible with
 * the existing `AiVerificationResult` plus the optional `globalMcpRegistration`
 * field added in Cycle D.
 */
interface VerifyAiSetupResponse {
    status: 'ok' | 'warning' | 'error';
    checks: AiCheckResult[];
    inventory: AiInventory;
    globalMcpRegistration?: GlobalMcpRegistrationStateValue;
}

// ─── Component ────────────────────────────────────────────────────────────────

const SECTION_IDS = {
    skills: 'skills',
    projectMcps: 'project-mcps',
    sessionMcps: 'session-mcps',
    globalMcp: 'global-mcp',
} as const;

export function AiConfigurationTab({ projectPath }: AiConfigurationTabProps): React.ReactElement {
    const [verifyResult, setVerifyResult] = useState<VerifyAiSetupResponse | null>(null);
    const [initialError, setInitialError] = useState<string | null>(null);
    const [expandedSections, toggleSection] = useSetToggle<string>();

    const verifyOp = useAsyncOperation<VerifyAiSetupResponse>();
    const refreshOp = useAsyncOperation<void>();
    const regenerateOp = useAsyncOperation<void>();
    const registerOp = useAsyncOperation<void>();

    // ─── Verify (initial + after every action) ───────────────────────────────

    const runVerify = useCallback(async (): Promise<void> => {
        setInitialError(null);
        const result = await verifyOp.execute(async () => {
            return await webviewClient.request<VerifyAiSetupResponse>(
                'verify-ai-setup',
                { projectPath },
            );
        });
        if (result) {
            setVerifyResult(result);
        }
    }, [projectPath, verifyOp]);

    // Reset all op state on mount, then kick off the initial verify.
    useEffect(() => {
        verifyOp.reset();
        refreshOp.reset();
        regenerateOp.reset();
        registerOp.reset();
        void runVerify();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectPath]);

    // Surface the initial verify error inline.
    useEffect(() => {
        if (verifyResult === null && verifyOp.error) {
            setInitialError(verifyOp.error.message);
        }
    }, [verifyOp.error, verifyResult]);

    // ─── Actions ──────────────────────────────────────────────────────────────

    const handleRefresh = useCallback(async (): Promise<void> => {
        await refreshOp.execute(async () => {
            await webviewClient.request('inspect-mcp', {});
        });
        await runVerify();
    }, [refreshOp, runVerify]);

    const handleRegenerate = useCallback(async (): Promise<void> => {
        await regenerateOp.execute(async () => {
            await webviewClient.request('regenerate-ai-files', { projectPath });
        });
        await runVerify();
    }, [projectPath, regenerateOp, runVerify]);

    const handleRegister = useCallback(async (): Promise<void> => {
        await registerOp.execute(async () => {
            await webviewClient.request('register-global-mcp', {});
        });
        await runVerify();
    }, [registerOp, runVerify]);

    // ─── Derived state ───────────────────────────────────────────────────────

    const inventory: AiInventory = verifyResult?.inventory ?? {
        skills: [],
        mcps: [],
        sessionMcps: [],
    };
    const globalState: GlobalMcpRegistrationStateValue =
        verifyResult?.globalMcpRegistration ?? 'unregistered';

    const isBusy =
        verifyOp.isExecuting ||
        refreshOp.isExecuting ||
        regenerateOp.isExecuting ||
        registerOp.isExecuting;

    return (
        <View padding="size-300">
            <Flex direction="column" gap="size-200">
                <Flex justifyContent="space-between" alignItems="center">
                    <Heading level={3}>AI Configuration</Heading>
                    <Flex gap="size-100">
                        <Button
                            variant="secondary"
                            isDisabled={isBusy}
                            onPress={handleRefresh}
                        >
                            Refresh
                        </Button>
                        <Button
                            variant="secondary"
                            isDisabled={isBusy}
                            onPress={handleRegenerate}
                        >
                            Regenerate AI Files
                        </Button>
                        {globalState !== 'registered' && (
                            <Button
                                variant="cta"
                                isDisabled={isBusy}
                                onPress={handleRegister}
                            >
                                Register
                            </Button>
                        )}
                    </Flex>
                </Flex>

                {initialError && (
                    <Text UNSAFE_style={STYLE_ERROR_TEXT}>
                        {initialError}
                    </Text>
                )}

                {/* ─── Skills row ──────────────────────────────────────────── */}
                <SectionRow
                    sectionId={SECTION_IDS.skills}
                    label="Skills"
                    statusText={`${inventory.skills.length} detected`}
                    color={resolveColor(inventory.skills.length, inventory.skillsError)}
                    error={inventory.skillsError}
                    expanded={expandedSections.has(SECTION_IDS.skills)}
                    onToggle={toggleSection}
                >
                    <SkillsDetail
                        skills={inventory.skills}
                        hasError={Boolean(inventory.skillsError)}
                    />
                </SectionRow>

                {/* ─── Project MCP Servers row ─────────────────────────────── */}
                <SectionRow
                    sectionId={SECTION_IDS.projectMcps}
                    label="Project MCP Servers"
                    statusText={`${inventory.mcps.length} detected`}
                    color={resolveColor(inventory.mcps.length, inventory.mcpsError)}
                    error={inventory.mcpsError}
                    expanded={expandedSections.has(SECTION_IDS.projectMcps)}
                    onToggle={toggleSection}
                >
                    <ProjectMcpsDetail
                        mcps={inventory.mcps}
                        hasError={Boolean(inventory.mcpsError)}
                    />
                </SectionRow>

                {/* ─── Session MCP Servers row ─────────────────────────────── */}
                <SectionRow
                    sectionId={SECTION_IDS.sessionMcps}
                    label="Session MCP Servers"
                    statusText={`${inventory.sessionMcps.length} detected`}
                    color={resolveColor(inventory.sessionMcps.length, inventory.sessionMcpsError)}
                    error={inventory.sessionMcpsError}
                    expanded={expandedSections.has(SECTION_IDS.sessionMcps)}
                    onToggle={toggleSection}
                >
                    <SessionMcpsDetail
                        sessions={inventory.sessionMcps}
                        hasError={Boolean(inventory.sessionMcpsError)}
                    />
                </SectionRow>

                {/* ─── Global MCP Registration row ─────────────────────────── */}
                <SectionRow
                    sectionId={SECTION_IDS.globalMcp}
                    label="Global MCP Registration"
                    statusText={globalStateLabel(globalState)}
                    color={globalState === 'registered' ? 'green' : 'yellow'}
                    expanded={expandedSections.has(SECTION_IDS.globalMcp)}
                    onToggle={toggleSection}
                >
                    <Text>
                        {globalState === 'registered'
                            ? 'demo-builder is registered in ~/.claude.json.'
                            : 'demo-builder is not registered in ~/.claude.json. Click Register to add it.'}
                    </Text>
                </SectionRow>
            </Flex>
        </View>
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Green when items exist and no error; yellow when error or zero items. */
function resolveColor(count: number, error: string | undefined): 'green' | 'yellow' {
    if (error) return 'yellow';
    return count > 0 ? 'green' : 'yellow';
}

function globalStateLabel(state: GlobalMcpRegistrationStateValue): string {
    switch (state) {
        case 'registered':
            return 'Registered';
        case 'declined':
            return 'Declined';
        case 'unregistered':
        default:
            return 'Not registered';
    }
}

// ─── Inline composition: SectionRow ───────────────────────────────────────────
// Matches the NavigationPanel:84-119 collapsible-row pattern. Per the D3 plan
// constraint we do NOT extract this to a shared component — only one consumer.

interface SectionRowProps {
    sectionId: string;
    label: string;
    statusText: string;
    color: 'green' | 'yellow';
    error?: string;
    expanded: boolean;
    onToggle: (id: string, selected: boolean) => void;
    children: React.ReactNode;
}

function SectionRow({
    sectionId,
    label,
    statusText,
    color,
    error,
    expanded,
    onToggle,
    children,
}: SectionRowProps): React.ReactElement {
    const handleClick = useCallback(() => {
        onToggle(sectionId, !expanded);
    }, [sectionId, expanded, onToggle]);

    return (
        <div
            data-testid={`ai-config-row-${sectionId}`}
            data-expanded={expanded ? 'true' : 'false'}
            className="w-full"
        >
            <button
                data-testid={`ai-config-row-${sectionId}-toggle`}
                onClick={handleClick}
                className="nav-section-button"
                type="button"
            >
                <Flex width="100%" justifyContent="space-between" alignItems="center">
                    <Flex gap="size-100" alignItems="center">
                        <span data-testid={`ai-config-chevron-${expanded ? 'down' : 'right'}`}>
                            {expanded ? <ChevronDown size="S" /> : <ChevronRight size="S" />}
                        </span>
                        <Text>{label}</Text>
                    </Flex>
                    <div data-color={color}>
                        <StatusCard status={statusText} color={color} size="S" />
                    </div>
                </Flex>
            </button>
            {error && (
                <Text
                    data-testid="ai-config-row-error"
                    UNSAFE_style={STYLE_ROW_ERROR}
                >
                    {error}
                </Text>
            )}
            {expanded && (
                <div data-testid={`ai-config-detail-${sectionId}`} className="nav-section-fields">
                    {children}
                </div>
            )}
        </div>
    );
}

// ─── Per-section detail bodies ────────────────────────────────────────────────

function SkillsDetail({
    skills,
    hasError,
}: {
    skills: SkillInventoryEntry[];
    hasError: boolean;
}): React.ReactElement {
    if (skills.length === 0 && !hasError) {
        return <Text>No skills detected.</Text>;
    }
    return (
        <Flex direction="column" gap="size-100">
            {skills.map(skill => (
                <Flex key={skill.path} direction="column" gap="size-50">
                    <Flex gap="size-100" alignItems="center">
                        <Text UNSAFE_style={STYLE_BOLD}>{skill.name}</Text>
                        <Text
                            UNSAFE_style={STYLE_TAG_TEXT}
                            data-testid={`skill-source-${skill.source}`}
                        >
                            {skill.source}
                        </Text>
                    </Flex>
                    {skill.description && (
                        <Text UNSAFE_style={STYLE_SMALL_TEXT}>{skill.description}</Text>
                    )}
                </Flex>
            ))}
        </Flex>
    );
}

function ProjectMcpsDetail({
    mcps,
    hasError,
}: {
    mcps: McpInventoryEntry[];
    hasError: boolean;
}): React.ReactElement {
    if (mcps.length === 0 && !hasError) {
        return <Text>No project MCP servers detected.</Text>;
    }
    return (
        <Flex direction="column" gap="size-150">
            {mcps.map(server => (
                <Flex key={server.id} direction="column" gap="size-50">
                    <Text UNSAFE_style={STYLE_BOLD}>{server.id}</Text>
                    {server.status === 'ok' && server.tools && server.tools.length > 0 && (
                        <Flex direction="column" gap="size-25" UNSAFE_style={STYLE_INDENT}>
                            {server.tools.map(tool => (
                                <Flex key={tool.name} direction="column" gap="size-25">
                                    <Text UNSAFE_style={STYLE_MONO}>{tool.name}</Text>
                                    <Text UNSAFE_style={STYLE_SMALL_TEXT}>{tool.description}</Text>
                                </Flex>
                            ))}
                        </Flex>
                    )}
                    {server.status !== 'ok' && (
                        <Text UNSAFE_style={STYLE_SMALL_TEXT}>
                            {server.status === 'timeout' ? 'Inspector timed out' : (server.error ?? 'Inspector failed')}
                        </Text>
                    )}
                </Flex>
            ))}
        </Flex>
    );
}

function SessionMcpsDetail({
    sessions,
    hasError,
}: {
    sessions: SessionMcpEntry[];
    hasError: boolean;
}): React.ReactElement {
    if (sessions.length === 0 && !hasError) {
        return <Text>No session MCP activity detected.</Text>;
    }
    return (
        <Flex direction="column" gap="size-100">
            {sessions.map(session => (
                <Flex key={session.displayName} gap="size-100" alignItems="center">
                    <Text>{session.displayName}</Text>
                    {session.needsAuth && (
                        <Text
                            data-testid="session-mcp-needs-auth"
                            UNSAFE_style={STYLE_NEEDS_AUTH}
                        >
                            needs auth
                        </Text>
                    )}
                </Flex>
            ))}
        </Flex>
    );
}
