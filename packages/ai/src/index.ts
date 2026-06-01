/**
 * @cytolens/ai — AI gating and interpretation layer.
 *
 * Local heuristics + optional LLM providers (BYOK).
 */

export { AIClient } from './AIClient.js';
export type { AIMessage, AICompletionOptions, AICompletionResult, AIProvider, AIClientConfig } from './AIClient.js';
export { suggestScatterGate } from './heuristic/UniversalGateHeuristic.js';
export type { HeuristicGateResult } from './heuristic/UniversalGateHeuristic.js';
