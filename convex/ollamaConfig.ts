/**
 * Ollama Load Balancer Configuration Management
 * Allows runtime selection of GPUs and models for AI inference
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get all Ollama server configurations
 */
export const getConfigs = query({
  handler: async (ctx) => {
    const configs = await ctx.db
      .query("ollamaConfig")
      .withIndex("by_priority")
      .collect();

    return configs.sort((a, b) => a.priority - b.priority);
  },
});

/**
 * Get enabled Ollama server configurations
 */
export const getEnabledConfigs = query({
  handler: async (ctx) => {
    const configs = await ctx.db
      .query("ollamaConfig")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect();

    return configs.sort((a, b) => a.priority - b.priority);
  },
});

/**
 * Add a new Ollama server configuration
 */
export const addConfig = mutation({
  args: {
    url: v.string(),
    name: v.string(),
    type: v.union(v.literal("ollama"), v.literal("groq")),
    weight: v.number(),
    model: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Get the next priority (highest + 1)
    const allConfigs = await ctx.db.query("ollamaConfig").collect();
    const maxPriority = Math.max(0, ...allConfigs.map(c => c.priority));

    const configId = await ctx.db.insert("ollamaConfig", {
      url: args.url,
      name: args.name,
      type: args.type,
      weight: args.weight,
      model: args.model,
      enabled: args.enabled ?? true,
      priority: maxPriority + 1,
      lastUpdated: Date.now(),
    });

    return configId;
  },
});

/**
 * Update an existing Ollama server configuration
 */
export const updateConfig = mutation({
  args: {
    id: v.id("ollamaConfig"),
    url: v.optional(v.string()),
    name: v.optional(v.string()),
    type: v.optional(v.union(v.literal("ollama"), v.literal("groq"))),
    weight: v.optional(v.number()),
    model: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
    priority: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;

    await ctx.db.patch(id, {
      ...updates,
      lastUpdated: Date.now(),
    });
  },
});

/**
 * Delete an Ollama server configuration
 */
export const deleteConfig = mutation({
  args: {
    id: v.id("ollamaConfig"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

/**
 * Toggle enabled status for a configuration
 */
export const toggleEnabled = mutation({
  args: {
    id: v.id("ollamaConfig"),
  },
  handler: async (ctx, args) => {
    const config = await ctx.db.get(args.id);
    if (!config) {
      throw new Error("Configuration not found");
    }

    await ctx.db.patch(args.id, {
      enabled: !config.enabled,
      lastUpdated: Date.now(),
    });
  },
});

/**
 * Initialize default configurations if none exist
 */
export const initializeDefaults = mutation({
  handler: async (ctx) => {
    const existing = await ctx.db.query("ollamaConfig").collect();

    if (existing.length > 0) {
      return { message: "Configurations already exist", count: existing.length };
    }

    // Add default local Ollama server
    await ctx.db.insert("ollamaConfig", {
      url: "http://localhost:11434",
      name: "Local Ollama",
      type: "ollama",
      weight: 1.0,
      model: "gemma3:12b",
      enabled: true,
      priority: 1,
      lastUpdated: Date.now(),
    });

    // Add optional Mac GPU server (disabled by default)
    await ctx.db.insert("ollamaConfig", {
      url: "http://100.97.106.7:11434",
      name: "Mac GPU",
      type: "ollama",
      weight: 0.3,
      model: "gemma3:12b",
      enabled: false,
      priority: 2,
      lastUpdated: Date.now(),
    });

    // Add optional Groq cloud (disabled by default)
    await ctx.db.insert("ollamaConfig", {
      url: "groq",
      name: "Groq Cloud",
      type: "groq",
      weight: 0.7,
      model: "llama-3.3-70b-versatile",
      enabled: false,
      priority: 0, // Highest priority when enabled
      lastUpdated: Date.now(),
    });

    return { message: "Default configurations initialized", count: 3 };
  },
});

/**
 * Bulk update weights to ensure they sum to 1.0
 */
export const normalizeWeights = mutation({
  handler: async (ctx) => {
    const configs = await ctx.db
      .query("ollamaConfig")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect();

    if (configs.length === 0) {
      return { message: "No enabled configurations to normalize" };
    }

    const totalWeight = configs.reduce((sum, c) => sum + c.weight, 0);

    if (totalWeight === 0) {
      // Equal distribution if all weights are 0
      const equalWeight = 1.0 / configs.length;
      for (const config of configs) {
        await ctx.db.patch(config._id, {
          weight: equalWeight,
          lastUpdated: Date.now(),
        });
      }
      return { message: `Weights normalized to ${equalWeight.toFixed(2)} each` };
    }

    // Normalize to sum to 1.0
    for (const config of configs) {
      await ctx.db.patch(config._id, {
        weight: config.weight / totalWeight,
        lastUpdated: Date.now(),
      });
    }

    return { message: "Weights normalized to sum to 1.0" };
  },
});

/**
 * Quick presets for common configurations
 */
export const applyPreset = mutation({
  args: {
    preset: v.union(
      v.literal("local-only"),
      v.literal("groq-primary"),
      v.literal("balanced"),
      v.literal("mac-gpu")
    ),
  },
  handler: async (ctx, args) => {
    const configs = await ctx.db.query("ollamaConfig").collect();

    switch (args.preset) {
      case "local-only":
        // Enable only local Ollama, disable everything else
        for (const config of configs) {
          if (config.url === "http://localhost:11434") {
            await ctx.db.patch(config._id, {
              enabled: true,
              weight: 1.0,
              lastUpdated: Date.now(),
            });
          } else {
            await ctx.db.patch(config._id, {
              enabled: false,
              lastUpdated: Date.now(),
            });
          }
        }
        return { message: "Local Ollama only (100%)" };

      case "groq-primary":
        // 70% Groq, 30% local fallback
        for (const config of configs) {
          if (config.type === "groq") {
            await ctx.db.patch(config._id, {
              enabled: true,
              weight: 0.7,
              lastUpdated: Date.now(),
            });
          } else if (config.url === "http://localhost:11434") {
            await ctx.db.patch(config._id, {
              enabled: true,
              weight: 0.3,
              lastUpdated: Date.now(),
            });
          } else {
            await ctx.db.patch(config._id, {
              enabled: false,
              lastUpdated: Date.now(),
            });
          }
        }
        return { message: "Groq primary (70%), Local fallback (30%)" };

      case "balanced":
        // Enable all, equal weights
        const enabledCount = configs.length;
        const equalWeight = 1.0 / enabledCount;
        for (const config of configs) {
          await ctx.db.patch(config._id, {
            enabled: true,
            weight: equalWeight,
            lastUpdated: Date.now(),
          });
        }
        return { message: `All servers enabled (${(equalWeight * 100).toFixed(1)}% each)` };

      case "mac-gpu":
        // Enable Mac GPU as primary
        for (const config of configs) {
          if (config.name.toLowerCase().includes("mac")) {
            await ctx.db.patch(config._id, {
              enabled: true,
              weight: 0.7,
              lastUpdated: Date.now(),
            });
          } else if (config.url === "http://localhost:11434") {
            await ctx.db.patch(config._id, {
              enabled: true,
              weight: 0.3,
              lastUpdated: Date.now(),
            });
          } else {
            await ctx.db.patch(config._id, {
              enabled: false,
              lastUpdated: Date.now(),
            });
          }
        }
        return { message: "Mac GPU primary (70%), Local fallback (30%)" };

      default:
        return { message: "Unknown preset" };
    }
  },
});
