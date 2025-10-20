import { logger } from "./logger";
// Functions for global world stats (time, population, births/deaths)
import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";

// Get the current world statistics
export const getWorldState = query({
  handler: async (ctx) => {
    const state = await ctx.db.query("worldState").first();
    if (!state) {
      // Return default values if world not initialized yet
      return {
        currentTime: 0,
        population: 0,
        totalBirths: 0,
        totalDeaths: 0,
        totalThoughts: 0,
        lastTickTime: Date.now(),
        socioEconomic: {
          prosperity: 0.5,
          stability: 0.7,
          happiness: 0.6,
          tension: 0.2,
          scarcity: 0.3,
        },
      };
    }
    return state;
  },
});

// Set up the world for the first time
export const initializeWorld = mutation({
  handler: async (ctx) => {
    const existing = await ctx.db.query("worldState").first();
    if (existing) {
      return existing._id;  // Already initialized, do nothing
    }

    // Create initial world state with zero values
    const worldStateId = await ctx.db.insert("worldState", {
      currentTime: 0,
      population: 0,
      totalBirths: 0,
      totalDeaths: 0,
      totalThoughts: 0,
      lastTickTime: Date.now(),
      socioEconomic: {
        prosperity: 0.5,   // Start neutral
        stability: 0.7,    // Start relatively stable
        happiness: 0.6,    // Start slightly happy
        tension: 0.2,      // Start with low tension
        scarcity: 0.3,     // Start with some scarcity
      },
    });

    // PROTAGONIST: Auto-designate a random NPC after a short delay
    // (Wait for initial NPCs to spawn first)
    // Note: This will be called by a separate mutation after NPCs exist
    logger.debug("🌍 World initialized - waiting for NPCs to spawn protagonist");

    return worldStateId;
  },
});

// Move time forward (usually called every few seconds)
export const tickWorld = mutation({
  args: {
    deltaMinutes: v.number(),
  },
  handler: async (ctx, { deltaMinutes }) => {
    const state = await ctx.db.query("worldState").first();
    if (!state) return;

    // Add time to the simulation clock
    await ctx.db.patch(state._id, {
      currentTime: state.currentTime + deltaMinutes,
      lastTickTime: Date.now(),
    });
  },
});

// Count another AI thought being generated
export const incrementThoughts = mutation({
  handler: async (ctx) => {
    const state = await ctx.db.query("worldState").first();
    if (!state) return;

    await ctx.db.patch(state._id, {
      totalThoughts: state.totalThoughts + 1,
    });
  },
});

// Track population changes (births and deaths)
export const updatePopulation = mutation({
  args: {
    delta: v.number(),  // +1 for birth, -1 for death
  },
  handler: async (ctx, { delta }) => {
    const state = await ctx.db.query("worldState").first();
    if (!state) return;

    const updates: any = {
      population: state.population + delta,
    };

    // Track whether this was a birth or death
    if (delta > 0) {
      updates.totalBirths = state.totalBirths + 1;
    } else if (delta < 0) {
      updates.totalDeaths = state.totalDeaths + 1;
    }

    await ctx.db.patch(state._id, updates);
  },
});

// Calculate and update socio-economic metrics based on current world state
export const calculateSocioEconomics = internalMutation({
  handler: async (ctx) => {
    const state = await ctx.db.query("worldState").first();
    if (!state) return;

    // Get all living entities
    const entities = await ctx.db
      .query("entities")
      .filter((q) => q.eq(q.field("alive"), true))
      .collect();

    // FIX: Sync population counter with actual entity count
    const actualPopulation = entities.length;
    if (state.population !== actualPopulation) {
      logger.debug(`🔧 Population desync fixed: ${state.population} → ${actualPopulation}`);
      await ctx.db.patch(state._id, { population: actualPopulation });
    }

    // Get active events
    const activeEvents = await ctx.db
      .query("events")
      .filter((q) => q.eq(q.field("active"), true))
      .collect();

    // If no NPCs, keep current values or use defaults
    if (entities.length === 0) {
      const defaults = {
        prosperity: 0.5,
        stability: 0.7,
        happiness: 0.6,
        tension: 0.2,
        scarcity: 0.3,
      };

      await ctx.db.patch(state._id, {
        socioEconomic: state.socioEconomic || defaults,
      });
      return;
    }

    // Calculate averages from NPCs
    const avgHealth = entities.reduce((sum, e) => sum + e.health, 0) / entities.length;
    const avgStress = entities.reduce((sum, e) => sum + e.stress, 0) / entities.length;
    const avgMood = entities.reduce((sum, e) => sum + e.personality.mood, 0) / entities.length;

    // Event impact
    const totalDanger = activeEvents.reduce((sum, e) => sum + Math.abs(e.dangerModifier), 0);
    const totalStressModifier = activeEvents.reduce((sum, e) => sum + e.stressModifier, 0);

    // Population pressure (0-1 scale, caps at 20 NPCs)
    const populationPressure = Math.min(entities.length / 20, 1);

    // Calculate each metric (0-1 scale)
    const prosperity = Math.max(0, Math.min(1, avgHealth * 0.8 + (1 - populationPressure) * 0.2));

    const stability = Math.max(0, Math.min(1,
      0.9 - (activeEvents.length * 0.1) - (avgStress * 0.3) - (totalDanger * 0.4)
    ));

    const happiness = Math.max(0, Math.min(1,
      avgMood * 0.7 + (1 - avgStress) * 0.2 + (avgHealth * 0.1)
    ));

    const tension = Math.max(0, Math.min(1,
      avgStress * 0.6 + (totalStressModifier > 0 ? totalStressModifier * 0.3 : 0) + (totalDanger * 0.1)
    ));

    const scarcity = Math.max(0, Math.min(1,
      populationPressure * 0.5 + (1 - avgHealth) * 0.3 + (totalDanger * 0.2)
    ));

    // Update world state
    await ctx.db.patch(state._id, {
      socioEconomic: {
        prosperity: Number(prosperity.toFixed(2)),
        stability: Number(stability.toFixed(2)),
        happiness: Number(happiness.toFixed(2)),
        tension: Number(tension.toFixed(2)),
        scarcity: Number(scarcity.toFixed(2)),
      },
    });
  },
});
