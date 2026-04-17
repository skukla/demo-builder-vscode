/**
 * AI Feature — Public API
 *
 * Exports the public surface for the AI interaction layer:
 * - AI context file verification (aiSetupVerifier)
 * - VS Code chat participant registration (vscodeChatParticipant)
 *
 * Internal imports should use this barrel rather than the individual
 * module paths to respect feature boundaries.
 */

export { verifyAiSetup } from './aiSetupVerifier';
export type { AiCheckResult, AiVerificationResult } from './aiSetupVerifier';

// TODO(phase-2): wire registerChatParticipant into extension.ts once Phase 2 ships.
// Not yet activated — exported here so activation is one import away.
export { registerChatParticipant } from './vscodeChatParticipant';
export type { ProjectResolver } from './vscodeChatParticipant';
