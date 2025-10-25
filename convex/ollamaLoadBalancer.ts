import { logger } from "./logger";
import {
  IProviderAdapter,
  ProviderRequest,
  ProviderResponse,
  createProvider,
  GroqProvider,
} from "./providers";

/**
 * Unified Load Balancer for Multiple AI Providers
 * Distributes inference requests across Ollama servers (local GPU) and Groq (cloud)
 * Features:
 * - Weighted distribution (e.g., 70% Groq, 30% Ollama)
 * - Automatic fallback on provider failure
 * - Health monitoring for all providers
 * - Cost optimization (use local for simple, cloud for complex)
 */

export interface OllamaServer {
  url: string;
  name: string;
  type: "ollama" | "groq"; // Server type
  weight: number; // 0.0 to 1.0 (percentage of requests)
  healthy: boolean;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalResponseTime: number;
  activeRequests: number;
  model?: string; // Model to use for this server (optional, defaults per type)
  provider?: IProviderAdapter; // Provider adapter instance
}

export interface GenerateRequest {
  model: string;
  prompt: string;
  stream: boolean;
  options: {
    temperature: number;
    num_predict: number;
  };
  timeout?: number; // Optional timeout in milliseconds (default: 30000)
}

export interface GenerateResponse {
  response: string;
  server: string; // Which server handled the request
}

class OllamaLoadBalancer {
  private servers: OllamaServer[] = [];
  private lastHealthCheck = 0;
  private initialized = false;
  private groqApiKey: string | null = null;

  constructor(
    servers: Array<{
      url: string;
      name: string;
      type: "ollama" | "groq";
      weight: number;
      model?: string;
    }>,
    groqApiKey?: string
  ) {
    this.groqApiKey = groqApiKey || null;

    // Create provider adapters for each server
    this.servers = servers.map(s => {
      let provider: IProviderAdapter;

      if (s.type === "groq") {
        provider = createProvider("groq", s.name, {
          model: s.model,
          apiKey: this.groqApiKey || undefined,
        });
      } else {
        provider = createProvider("ollama", s.name, {
          url: s.url,
          model: s.model,
        });
      }

      return {
        ...s,
        provider,
        healthy: true, // Assume healthy initially
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        totalResponseTime: 0,
        activeRequests: 0,
      };
    });

    // Don't log or run health checks in constructor
    // Will be done lazily on first use
  }

  /**
   * Initialize the load balancer (call on first use)
   */
  private ensureInitialized() {
    if (!this.initialized) {
      const serverTypes = this.servers.map(s => s.type).join(', ');
      logger.info(`🔄 Load balancer initialized with ${this.servers.length} server${this.servers.length > 1 ? 's' : ''} [${serverTypes}]:`);
      this.servers.forEach(s => {
        const deviceInfo = s.type === 'ollama' && s.url.includes('localhost') ? ' 🎮 GPU' : '';
        logger.info(`   • ${s.name} (${s.type})${deviceInfo} - ${(s.weight * 100).toFixed(0)}% weight`);
      });
      this.initialized = true;
    }
  }

  /**
   * Check health of all servers using their provider adapters
   */
  async checkHealth(): Promise<void> {
    logger.debug("🏥 Running health checks on all servers...");

    const healthPromises = this.servers.map(async (server) => {
      if (!server.provider) {
        logger.warn(`⚠️ ${server.name} has no provider adapter`);
        server.healthy = false;
        return;
      }

      try {
        const wasHealthy = server.healthy;
        const healthStatus = await server.provider.checkHealth();

        server.healthy = healthStatus.healthy;

        if (server.healthy && !wasHealthy) {
          const latencyMsg = healthStatus.latency ? ` (${healthStatus.latency}ms)` : "";
          logger.info(`✅ ${server.name} is now healthy${latencyMsg}`);
        } else if (!server.healthy && wasHealthy) {
          const errorMsg = healthStatus.error ? `: ${healthStatus.error}` : "";
          logger.warn(`❌ ${server.name} is now unhealthy${errorMsg}`);
        }
      } catch (error) {
        const wasHealthy = server.healthy;
        server.healthy = false;
        if (wasHealthy) {
          logger.warn(`❌ ${server.name} health check failed:`, error);
        }
      }
    });

    await Promise.all(healthPromises);
    this.lastHealthCheck = Date.now();
  }

  /**
   * Get next server using weighted round-robin
   */
  private getNextServer(): OllamaServer | null {
    const healthyServers = this.servers.filter(s => s.healthy);

    if (healthyServers.length === 0) {
      logger.error("❌ No healthy servers available");
      return null;
    }

    // Weighted round-robin selection with normalized weights
    // Calculate total weight and normalize to ensure proper distribution
    const totalWeight = healthyServers.reduce((sum, s) => sum + s.weight, 0);
    const random = Math.random();
    let cumulative = 0;

    for (const server of healthyServers) {
      cumulative += server.weight / totalWeight; // Normalize weights
      if (random <= cumulative) {
        return server;
      }
    }

    // Fallback to first healthy server
    return healthyServers[0];
  }

  /**
   * Generate text using load-balanced providers (Ollama + Groq)
   */
  async generate(request: GenerateRequest): Promise<GenerateResponse | null> {
    // Lazy initialization on first use
    this.ensureInitialized();

    // Run health check if it's been more than 30 seconds
    if (Date.now() - this.lastHealthCheck > 30000) {
      // Don't await - let it run in background
      this.checkHealth().catch(err =>
        logger.debug("Health check error:", err)
      );
    }

    const maxRetries = 2;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const server = this.getNextServer();

      if (!server) {
        logger.error("❌ No servers available for inference");
        return null;
      }

      if (!server.provider) {
        logger.error(`❌ ${server.name} has no provider adapter`);
        continue;
      }

      try {
        const deviceTag = server.type === 'ollama' && server.url.includes('localhost') ? ' 🎮' : '';
        logger.debug(`🎯${deviceTag} Routing to ${server.name} (${server.type}) [${request.model}] - attempt ${attempt + 1}/${maxRetries}`);

        server.totalRequests++;
        server.activeRequests++;
        const startTime = Date.now();

        // Convert GenerateRequest to ProviderRequest format
        const providerRequest: ProviderRequest = {
          model: request.model,
          prompt: request.prompt,
          temperature: request.options.temperature,
          maxTokens: request.options.num_predict,
          timeout: request.timeout,
        };

        // Use the provider adapter to generate
        const providerResponse: ProviderResponse = await server.provider.generate(providerRequest);

        const elapsed = Date.now() - startTime;
        server.activeRequests--;

        // Success!
        server.successfulRequests++;
        server.totalResponseTime += elapsed;

        const avgTime = (server.totalResponseTime / server.successfulRequests).toFixed(0);
        const responsePreview = providerResponse.text.substring(0, 50).replace(/\n/g, ' ');
        logger.info(`✅${deviceTag} ${server.name}: ${elapsed}ms (avg: ${avgTime}ms) → "${responsePreview}${providerResponse.text.length > 50 ? '...' : ''}"`);

        return {
          response: providerResponse.text,
          server: server.name,
        };

      } catch (error) {
        server.failedRequests++;
        server.activeRequests--;
        lastError = error as Error;

        const errorName = error instanceof Error ? error.name : 'Unknown';
        const errorMsg = error instanceof Error ? error.message : String(error);

        logger.warn(`⚠️ ${server.name} (${server.type}) request failed: ${errorName} - ${errorMsg}`);

        // Mark server as unhealthy if it fails
        server.healthy = false;

        // Try next server on failure
        continue;
      }
    }

    // All retries failed
    logger.error(`❌ All inference attempts failed. Last error:`, lastError);
    return null;
  }

  /**
   * Get load balancer statistics
   */
  getStats() {
    const stats = this.servers.map(s => ({
      name: s.name,
      url: s.url,
      healthy: s.healthy,
      weight: s.weight,
      totalRequests: s.totalRequests,
      successfulRequests: s.successfulRequests,
      failedRequests: s.failedRequests,
      successRate: s.totalRequests > 0
        ? ((s.successfulRequests / s.totalRequests) * 100).toFixed(1)
        : "N/A",
      avgResponseTime: s.successfulRequests > 0
        ? (s.totalResponseTime / s.successfulRequests).toFixed(0)
        : "N/A",
      activeRequests: s.activeRequests,
    }));

    return stats;
  }

  /**
   * Log current statistics
   */
  logStats() {
    logger.info("📊 Load Balancer Statistics:");
    const stats = this.getStats();
    stats.forEach(s => {
      logger.info(`   ${s.name}: ${s.successfulRequests}/${s.totalRequests} requests (${s.successRate}% success) - avg ${s.avgResponseTime}ms - ${s.healthy ? '✅' : '❌'}`);
    });
  }
}

// Singleton instance to avoid multiple initializations
let loadBalancerInstance: OllamaLoadBalancer | null = null;

/**
 * Server configuration interface for creating load balancer
 */
export interface ServerConfig {
  url: string;
  name: string;
  type: "ollama" | "groq";
  weight: number;
  model?: string;
}

/**
 * Get the shared load balancer instance with custom configuration
 * This version accepts server configurations directly (for database-driven config)
 *
 * @param servers - Array of server configurations
 * @param groqApiKey - Optional Groq API key for Groq servers
 */
export function getLoadBalancerWithConfig(
  servers: ServerConfig[],
  groqApiKey?: string
): OllamaLoadBalancer {
  // Always recreate instance to use latest configuration
  // This ensures database changes are reflected immediately
  loadBalancerInstance = new OllamaLoadBalancer(servers, groqApiKey);
  return loadBalancerInstance;
}

/**
 * Get the shared load balancer instance (LEGACY - uses hardcoded config)
 * Supports mixed providers: Ollama (local GPU) + Groq (cloud)
 *
 * NOTE: This function uses hardcoded configuration.
 * For database-driven configuration, use getLoadBalancerWithConfig() instead.
 *
 * @param groqApiKey - Optional Groq API key. If not provided, only Ollama will be used.
 *                     In Convex functions, pass the API key from environment using:
 *                     const apiKey = process.env.GROQ_API_KEY;
 */
export function getLoadBalancer(groqApiKey?: string): OllamaLoadBalancer {
  if (!loadBalancerInstance) {
    // Use provided API key (passed from Convex function that has access to env)
    const apiKey = groqApiKey;

    // Configuration examples:
    // 1. Groq-first with Ollama fallback (70/30 split):
    //    [ { type: "groq", weight: 0.7 }, { type: "ollama", weight: 0.3 } ]
    // 2. Ollama-only (current default):
    //    [ { type: "ollama", weight: 1.0 } ]
    // 3. Groq-only (cloud-only):
    //    [ { type: "groq", weight: 1.0 } ]

    const servers = [];

    // Add Groq provider if API key is available
    if (apiKey) {
      servers.push({
        url: "groq", // Not used for Groq, but required by interface
        name: "Groq Cloud",
        type: "groq" as const,
        weight: 0.7, // 70% of requests to fast cloud API
        model: "llama-3.3-70b-versatile", // Optional: override default model
      });
      logger.info("🌩️ Groq Cloud API enabled (70% weight)");
    }

    // Add local Ollama server(s)
    servers.push({
      url: "http://localhost:11434",
      name: "Local Ollama",
      type: "ollama" as const,
      weight: apiKey ? 0.3 : 1.0, // 30% if Groq available, 100% otherwise
    });

    // Optionally add Mac GPU (uncomment to enable)
    // servers.push({
    //   url: "http://100.97.106.7:11434",
    //   name: "Mac GPU",
    //   type: "ollama" as const,
    //   weight: 0.15, // Additional 15% to Mac GPU
    // });

    loadBalancerInstance = new OllamaLoadBalancer(servers, apiKey);
  }
  return loadBalancerInstance;
}

/**
 * Reset the load balancer instance (useful for testing or reconfiguration)
 */
export function resetLoadBalancer(): void {
  loadBalancerInstance = null;
}

// Backwards compatibility: export the getter function as the default
export const ollamaLoadBalancer = {
  generate: async (request: GenerateRequest) => getLoadBalancer().generate(request),
  checkHealth: async () => getLoadBalancer().checkHealth(),
  getStats: () => getLoadBalancer().getStats(),
  logStats: () => getLoadBalancer().logStats(),
};
