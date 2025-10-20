/**
 * Provider Adapters for Unified Load Balancer
 * Abstracts different AI provider APIs (Ollama, Groq) into a common interface
 */

import { logger } from "./logger";

/**
 * Common request format for all providers
 */
export interface ProviderRequest {
  model: string;
  prompt: string;
  temperature: number;
  maxTokens: number;
  timeout?: number; // Optional timeout in milliseconds
}

/**
 * Common response format from all providers
 */
export interface ProviderResponse {
  text: string;
  model: string;
  tokensUsed?: number;
  provider: string;
}

/**
 * Provider health status
 */
export interface ProviderHealth {
  healthy: boolean;
  latency?: number; // Response time in ms
  error?: string;
}

/**
 * Base interface for all provider adapters
 */
export interface IProviderAdapter {
  readonly name: string;
  readonly type: "ollama" | "groq";

  /**
   * Generate text using this provider
   */
  generate(request: ProviderRequest): Promise<ProviderResponse>;

  /**
   * Check if this provider is healthy and available
   */
  checkHealth(): Promise<ProviderHealth>;

  /**
   * Get the base URL or endpoint for this provider
   */
  getEndpoint(): string;
}

/**
 * Ollama Provider Adapter
 * Handles local Ollama servers (GPU clusters)
 */
export class OllamaProvider implements IProviderAdapter {
  readonly type = "ollama" as const;

  constructor(
    public readonly name: string,
    private readonly url: string,
    private readonly defaultModel?: string
  ) {}

  getEndpoint(): string {
    return this.url;
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    const timeoutMs = request.timeout || 30000;
    const model = this.defaultModel || request.model;

    logger.debug(`🔵 Ollama ${this.name}: Generating with ${model}`);

    const response = await fetch(`${this.url}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt: request.prompt,
        stream: false,
        options: {
          temperature: request.temperature,
          num_predict: request.maxTokens,
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Ollama HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      text: data.response || "",
      model: data.model || model,
      provider: `ollama:${this.name}`,
    };
  }

  async checkHealth(): Promise<ProviderHealth> {
    try {
      const startTime = Date.now();
      const response = await fetch(`${this.url}/api/tags`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });

      const latency = Date.now() - startTime;

      if (!response.ok) {
        return {
          healthy: false,
          latency,
          error: `HTTP ${response.status}`,
        };
      }

      return {
        healthy: true,
        latency,
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * Groq Provider Adapter
 * Handles cloud-based Groq API
 */
export class GroqProvider implements IProviderAdapter {
  readonly type = "groq" as const;
  readonly name: string;

  private apiKey: string | null = null;

  constructor(
    name: string,
    private readonly defaultModel: string = "llama-3.3-70b-versatile"
  ) {
    this.name = name;
    // API key will be injected at runtime via setApiKey()
  }

  /**
   * Set the Groq API key (must be called before use)
   */
  setApiKey(apiKey: string) {
    this.apiKey = apiKey;
  }

  getEndpoint(): string {
    return "https://api.groq.com/openai/v1/chat/completions";
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    if (!this.apiKey) {
      throw new Error("Groq API key not set. Call setApiKey() first or set GROQ_API_KEY environment variable.");
    }

    const model = request.model || this.defaultModel;
    const timeoutMs = request.timeout || 30000;

    logger.debug(`🟢 Groq ${this.name}: Generating with ${model}`);

    const response = await fetch(this.getEndpoint(), {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: request.prompt,
          },
        ],
        temperature: request.temperature,
        max_tokens: request.maxTokens,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`Groq API HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";
    const usage = data.usage?.total_tokens;

    return {
      text: text.trim(),
      model: data.model || model,
      tokensUsed: usage,
      provider: `groq:${this.name}`,
    };
  }

  async checkHealth(): Promise<ProviderHealth> {
    // Groq doesn't have a dedicated health endpoint
    // We'll do a minimal request to check if the API is accessible
    if (!this.apiKey) {
      return {
        healthy: false,
        error: "No API key configured",
      };
    }

    try {
      const startTime = Date.now();

      // Make a minimal request to test connectivity
      const response = await fetch(this.getEndpoint(), {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.defaultModel,
          messages: [{ role: "user", content: "hi" }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(5000),
      });

      const latency = Date.now() - startTime;

      if (!response.ok) {
        return {
          healthy: false,
          latency,
          error: `HTTP ${response.status}`,
        };
      }

      return {
        healthy: true,
        latency,
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * Factory function to create provider adapters
 */
export function createProvider(
  type: "ollama" | "groq",
  name: string,
  config: {
    url?: string;
    model?: string;
    apiKey?: string;
  }
): IProviderAdapter {
  if (type === "ollama") {
    if (!config.url) {
      throw new Error("Ollama provider requires a URL");
    }
    return new OllamaProvider(name, config.url, config.model);
  } else if (type === "groq") {
    const provider = new GroqProvider(name, config.model);
    if (config.apiKey) {
      provider.setApiKey(config.apiKey);
    }
    return provider;
  } else {
    throw new Error(`Unknown provider type: ${type}`);
  }
}
