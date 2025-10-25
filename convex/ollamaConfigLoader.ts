/**
 * Database-driven Ollama Load Balancer Configuration Loader
 * Reads GPU and model configuration from the database
 */

import { DatabaseReader } from "./_generated/server";
import { getLoadBalancerWithConfig, ServerConfig } from "./ollamaLoadBalancer";
import { logger } from "./logger";

/**
 * Load load balancer configuration from database
 * This function should be called from within Convex mutations/queries
 *
 * @param db - Convex database reader
 * @param groqApiKey - Optional Groq API key
 * @returns Configured load balancer instance
 */
export async function getConfiguredLoadBalancer(
  db: DatabaseReader,
  groqApiKey?: string
) {
  // Fetch enabled configurations from database
  const dbConfigs = await db
    .query("ollamaConfig")
    .withIndex("by_enabled", (q) => q.eq("enabled", true))
    .collect();

  // Sort by priority
  const sortedConfigs = dbConfigs.sort((a, b) => a.priority - b.priority);

  // If no configurations exist, use fallback
  if (sortedConfigs.length === 0) {
    logger.warn("⚠️ No Ollama configurations found in database, using fallback");

    // Fallback to local Ollama
    const fallbackServers: ServerConfig[] = [
      {
        url: "http://localhost:11434",
        name: "Local Ollama (Fallback)",
        type: "ollama",
        weight: 1.0,
      },
    ];

    return getLoadBalancerWithConfig(fallbackServers, groqApiKey);
  }

  // Convert database configs to ServerConfig format
  const servers: ServerConfig[] = sortedConfigs.map(config => ({
    url: config.url,
    name: config.name,
    type: config.type,
    weight: config.weight,
    model: config.model,
  }));

  // Log configuration
  logger.info(`📋 Loading ${servers.length} server configuration(s) from database:`);
  servers.forEach(s => {
    const modelInfo = s.model ? ` [${s.model}]` : "";
    const deviceTag = s.type === 'ollama' && s.url.includes('localhost') ? ' 🎮' : '';
    logger.info(`   • ${s.name}${deviceTag} (${s.type})${modelInfo} - ${(s.weight * 100).toFixed(0)}% weight`);
  });

  return getLoadBalancerWithConfig(servers, groqApiKey);
}

/**
 * Example usage in a Convex function:
 *
 * export const myMutation = mutation({
 *   handler: async (ctx) => {
 *     const groqApiKey = process.env.GROQ_API_KEY;
 *     const loadBalancer = await getConfiguredLoadBalancer(ctx.db, groqApiKey);
 *
 *     const response = await loadBalancer.generate({
 *       model: "llama3.2:1b",
 *       prompt: "Hello!",
 *       stream: false,
 *       options: { temperature: 0.7, num_predict: 100 },
 *     });
 *
 *     return response;
 *   },
 * });
 */
