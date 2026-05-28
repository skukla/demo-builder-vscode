/**
 * AI Feature — Public API
 *
 * Exports the public surface for the AI interaction layer:
 * - AI context file verification (`verifyAiSetup`) and inventory gathering
 *   (`gatherInventory`) — `aiSetupVerifier`
 * - Skill inspector — `skillInspector`
 * - MCP server inspector with TTL cache — `mcpInspector`
 * - Session-level MCP detector — `sessionMcpDetector`
 *
 * Internal imports should use this barrel rather than the individual
 * module paths to respect feature boundaries.
 */

export { verifyAiSetup, gatherInventory } from './aiSetupVerifier';
export type { AiCheckResult, AiVerificationResult } from './aiSetupVerifier';

export { inspectSkills } from './skillInspector';
export { inspectAllServers, clearMcpCache, MCP_INSPECT_TIMEOUT_MS } from './mcpInspector';
export { detectSessionMcps } from './sessionMcpDetector';
