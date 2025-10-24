// Physics configuration system - runtime tunable parameters for emergence
import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { logger } from "./logger";

/**
 * Initialize physics config with default values
 * Called on first setup or reset
 */
export const initializePhysicsConfig = internalMutation({
  handler: async (ctx) => {
    logger.info("🔧 Initializing physics configuration with default values...");

    const now = Date.now();

    // Default configuration values
    const defaultConfig = [
      // DRIVE WEIGHTS
      { key: "hunger-weight", value: 0.70, category: "drive_weights", description: "How strongly hunger influences decisions" },
      { key: "social-weight", value: 0.60, category: "drive_weights", description: "How strongly loneliness influences decisions" },
      { key: "safety-weight", value: 0.80, category: "drive_weights", description: "How strongly danger influences decisions" },
      { key: "explore-weight", value: 0.30, category: "drive_weights", description: "How strongly curiosity influences decisions" },

      // DECAY RATES
      { key: "energy-decay-moving", value: 0.010, category: "decay_rates", description: "Hunger rate while moving" },
      { key: "energy-decay-still", value: 0.005, category: "decay_rates", description: "Hunger rate while idle" },
      { key: "social-decay", value: 0.003, category: "decay_rates", description: "Loneliness accumulation rate" },
      { key: "safety-decay", value: 0.002, category: "decay_rates", description: "Stress recovery rate" },

      // FIELD DYNAMICS - DIFFUSION
      { key: "heat-diffusion", value: 0.12, category: "field_dynamics", description: "How fast danger spreads to neighbors" },
      { key: "food-diffusion", value: 0.05, category: "field_dynamics", description: "How fast food spreads to neighbors" },
      { key: "trauma-diffusion", value: 0.08, category: "field_dynamics", description: "How fast trauma spreads to neighbors" },

      // FIELD DYNAMICS - EVAPORATION
      { key: "heat-evap", value: 0.020, category: "field_dynamics", description: "How fast danger decays over time" },
      { key: "food-evap", value: 0.010, category: "field_dynamics", description: "How fast food decays over time" },
      { key: "trauma-evap", value: 0.005, category: "field_dynamics", description: "How fast trauma decays over time" },
      { key: "food-regrowth", value: 0.002, category: "field_dynamics", description: "How fast food regenerates at landmarks" },

      // DARK PSYCHOLOGY WEIGHTS
      { key: "isolation-weight", value: 0.35, category: "psychology", description: "Loneliness contribution to despair" },
      { key: "starvation-weight", value: 0.30, category: "psychology", description: "Hunger contribution to despair" },
      { key: "trauma-despair", value: 0.25, category: "psychology", description: "Trauma contribution to despair" },
      { key: "suicide-prob", value: 0.08, category: "psychology", description: "Max suicide probability (%)" },
      { key: "violence-prob", value: 0.04, category: "psychology", description: "Max violence probability (%)" },
    ];

    // Check if config already exists
    const existing = await ctx.db.query("physicsConfig").first();
    if (existing) {
      logger.info("⚠️ Physics config already exists, skipping initialization");
      return;
    }

    // Insert all default configs
    for (const config of defaultConfig) {
      await ctx.db.insert("physicsConfig", {
        key: config.key,
        value: config.value,
        category: config.category,
        description: config.description,
        lastUpdated: now,
      });
    }

    logger.info("✅ Physics config initialized with " + defaultConfig.length + " parameters");
  },
});

/**
 * Get a specific physics parameter value
 */
export const getPhysicsParam = query({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const config = await ctx.db
      .query("physicsConfig")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    return config?.value ?? null;
  },
});

/**
 * Get all physics parameters
 */
export const getAllPhysicsParams = query({
  handler: async (ctx) => {
    const allConfigs = await ctx.db.query("physicsConfig").collect();

    // Convert to key-value object for easier access
    const configMap: Record<string, number> = {};
    for (const config of allConfigs) {
      configMap[config.key] = config.value;
    }

    return configMap;
  },
});

/**
 * Get physics parameters by category
 */
export const getPhysicsParamsByCategory = query({
  args: { category: v.string() },
  handler: async (ctx, args) => {
    const configs = await ctx.db
      .query("physicsConfig")
      .withIndex("by_category", (q) => q.eq("category", args.category))
      .collect();

    return configs;
  },
});

/**
 * Update a single physics parameter
 */
export const updatePhysicsParam = mutation({
  args: {
    key: v.string(),
    value: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("physicsConfig")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    if (!existing) {
      logger.warn(`⚠️ Physics param '${args.key}' not found, creating new entry`);
      await ctx.db.insert("physicsConfig", {
        key: args.key,
        value: args.value,
        category: "custom",
        description: "Custom parameter",
        lastUpdated: Date.now(),
      });
      return;
    }

    await ctx.db.patch(existing._id, {
      value: args.value,
      lastUpdated: Date.now(),
    });

    logger.debug(`🔧 Updated physics param: ${args.key} = ${args.value}`);
  },
});

/**
 * Update multiple physics parameters at once
 */
export const updateMultiplePhysicsParams = mutation({
  args: {
    updates: v.array(v.object({
      key: v.string(),
      value: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    logger.info(`🔧 Updating ${args.updates.length} physics parameters...`);

    for (const update of args.updates) {
      const existing = await ctx.db
        .query("physicsConfig")
        .withIndex("by_key", (q) => q.eq("key", update.key))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          value: update.value,
          lastUpdated: Date.now(),
        });
      }
    }

    logger.info(`✅ Updated ${args.updates.length} physics parameters`);
  },
});

/**
 * Reset all physics parameters to defaults
 */
export const resetPhysicsConfig = mutation({
  handler: async (ctx) => {
    logger.info("🔄 Resetting physics config to defaults...");

    // Delete all existing configs
    const allConfigs = await ctx.db.query("physicsConfig").collect();
    for (const config of allConfigs) {
      await ctx.db.delete(config._id);
    }

    // Reinitialize with defaults
    await ctx.runMutation("physicsConfig:initializePhysicsConfig" as any);

    logger.info("✅ Physics config reset to defaults");
  },
});

/**
 * Get emergence metrics for the control panel
 * Calculates live statistics about NPC behavior patterns
 */
export const getEmergenceMetrics = query({
  handler: async (ctx) => {
    const entities = await ctx.db
      .query("entities")
      .withIndex("by_alive", (q) => q.eq("alive", true))
      .collect();

    // Calculate action distribution
    const actionCounts: Record<string, number> = {};
    let totalEnergy = 0;
    let totalSocial = 0;
    let totalSafety = 0;
    let despairCount = 0;
    let aggressionCount = 0;

    for (const entity of entities) {
      // Count actions
      if (entity.lastAction) {
        actionCounts[entity.lastAction] = (actionCounts[entity.lastAction] || 0) + 1;
      }

      // Sum drives
      totalEnergy += entity.energy ?? 0.5;
      totalSocial += entity.social ?? 0.5;
      totalSafety += entity.safety ?? 0.5;

      // Count crisis states
      if ((entity.despair ?? 0) > 0.7) despairCount++;
      if ((entity.aggression ?? 0) > 0.6) aggressionCount++;
    }

    const totalNPCs = entities.length;

    // Get field averages
    const heatFields = await ctx.db
      .query("fields")
      .withIndex("by_type", (q) => q.eq("type", "heat"))
      .collect();
    const foodFields = await ctx.db
      .query("fields")
      .withIndex("by_type", (q) => q.eq("type", "food"))
      .collect();
    const traumaFields = await ctx.db
      .query("fields")
      .withIndex("by_type", (q) => q.eq("type", "trauma"))
      .collect();

    const avgHeat = heatFields.length > 0
      ? heatFields.reduce((sum, f) => sum + f.value, 0) / heatFields.length
      : 0;
    const avgFood = foodFields.length > 0
      ? foodFields.reduce((sum, f) => sum + f.value, 0) / foodFields.length
      : 0;
    const avgTrauma = traumaFields.length > 0
      ? traumaFields.reduce((sum, f) => sum + f.value, 0) / traumaFields.length
      : 0;

    return {
      totalNPCs,
      actionCounts,
      averages: {
        energy: totalNPCs > 0 ? totalEnergy / totalNPCs : 0,
        social: totalNPCs > 0 ? totalSocial / totalNPCs : 0,
        safety: totalNPCs > 0 ? totalSafety / totalNPCs : 0,
        heat: avgHeat,
        food: avgFood,
        trauma: avgTrauma,
      },
      crisisStats: {
        despairCount,
        aggressionCount,
      },
    };
  },
});
