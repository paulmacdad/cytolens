/**
 * AIClient — provider-agnostic interface for LLM calls.
 *
 * All LLM interactions go through this interface.
 * Supports OpenAI, Anthropic, and Ollama (local) providers.
 * BYOK: user provides their own API key via app settings.
 */

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AICompletionOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

export interface AICompletionResult {
  content: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  provider: string;
}

export interface AIProvider {
  name: string;
  complete(messages: AIMessage[], options?: AICompletionOptions): Promise<AICompletionResult>;
  isAvailable(): Promise<boolean>;
}

export interface AIClientConfig {
  provider: 'openai' | 'anthropic' | 'ollama';
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
}

export class AIClient {
  private provider: AIProvider;

  constructor(provider: AIProvider) {
    this.provider = provider;
  }

  async complete(messages: AIMessage[], options?: AICompletionOptions): Promise<AICompletionResult> {
    return this.provider.complete(messages, options);
  }

  async isAvailable(): Promise<boolean> {
    return this.provider.isAvailable();
  }

  get providerName(): string {
    return this.provider.name;
  }
}
