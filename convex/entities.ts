// Functions for managing NPCs (creating, updating, killing them)
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Get all living NPCs
export const listEntities = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("entities")
      .filter((q) => q.eq(q.field("alive"), true))
      .collect();
  },
});

// Get one specific NPC by ID
export const getEntity = query({
  args: { id: v.id("entities") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

// Create a new NPC (spawning a character)
export const createEntity = mutation({
  args: {
    name: v.string(),
    color: v.string(),
    x: v.number(),
    y: v.number(),
    personality: v.object({
      curiosity: v.number(),
      empathy: v.number(),
      boldness: v.number(),
      order: v.number(),
      mood: v.number(),
      weirdness: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    // Insert new NPC with default values for health, stress, etc.
    return await ctx.db.insert("entities", {
      ...args,
      targetX: args.x,      // Start with no movement
      targetY: args.y,
      speed: 42,
      alive: true,
      health: 1.0,          // Full health
      stress: 0.0,          // No stress
      age: 0,
    });
  },
});

// Update where an NPC is and where they're walking to
export const updatePosition = mutation({
  args: {
    id: v.id("entities"),
    x: v.number(),
    y: v.number(),
    targetX: v.number(),
    targetY: v.number(),
  },
  handler: async (ctx, { id, x, y, targetX, targetY }) => {
    await ctx.db.patch(id, { x, y, targetX, targetY });
  },
});

// Update what an NPC is doing and thinking
export const updateAction = mutation({
  args: {
    id: v.id("entities"),
    action: v.string(),
    thought: v.optional(v.string()),
  },
  handler: async (ctx, { id, action, thought }) => {
    const updates: any = { lastAction: action };
    if (thought) updates.lastThought = thought;
    await ctx.db.patch(id, updates);
  },
});

// Kill an NPC (mark as dead and update global stats)
export const killEntity = mutation({
  args: { id: v.id("entities") },
  handler: async (ctx, { id }) => {
    // Mark NPC as dead
    await ctx.db.patch(id, { alive: false });

    // Update global death count and population
    const worldState = await ctx.db.query("worldState").first();
    if (worldState) {
      await ctx.db.patch(worldState._id, {
        totalDeaths: worldState.totalDeaths + 1,
        population: worldState.population - 1,
      });
    }
  },
});

// Update NPC's health, stress, or age
export const updateStats = mutation({
  args: {
    id: v.id("entities"),
    health: v.optional(v.number()),
    stress: v.optional(v.number()),
    age: v.optional(v.number()),
  },
  handler: async (ctx, { id, health, stress, age }) => {
    // Only update the fields that were provided
    const updates: any = {};
    if (health !== undefined) updates.health = health;
    if (stress !== undefined) updates.stress = stress;
    if (age !== undefined) updates.age = age;
    await ctx.db.patch(id, updates);
  },
});

// TEST: Spawn a religious NPC near the church
export const spawnReligiousNPC = mutation({
  handler: async (ctx) => {
    // Spawn near church
    const x = 120 + Math.random() * 60;  // 120-180
    const y = 350 + Math.random() * 60;  // 350-410

    const religiousNames = ["Father John", "Sister Mary", "Brother Thomas", "Mother Teresa", "Priest Peter"];
    const name = religiousNames[Math.floor(Math.random() * religiousNames.length)];

    const npcId = await ctx.db.insert("entities", {
      name,
      color: "0xFFD700",  // Gold color for religious NPCs
      type: "religious",
      x,
      y,
      targetX: x,
      targetY: y,
      speed: 42,
      personality: {
        curiosity: 0.3 + Math.random() * 0.2,    // 0.3-0.5
        empathy: 0.7 + Math.random() * 0.2,      // 0.7-0.9
        boldness: 0.2 + Math.random() * 0.2,     // 0.2-0.4
        order: 0.8 + Math.random() * 0.15,       // 0.8-0.95
        mood: 0.45 + Math.random() * 0.15,       // 0.45-0.6
        weirdness: 0.3 + Math.random() * 0.2,    // 0.3-0.5
      },
      alive: true,
      health: 1.0,
      stress: 0.2,
      age: 0,
      energy: 0.7,
      social: 0.6,
      safety: 0.8,
      despair: 0.0,
      aggression: 0.0,
      mentalBreakpoint: 0.0,
      traumaMemories: [],
    });

    // Update world population
    const worldState = await ctx.db.query("worldState").first();
    if (worldState) {
      await ctx.db.patch(worldState._id, {
        population: worldState.population + 1,
        totalBirths: worldState.totalBirths + 1,
      });
    }

    return { id: npcId, name, x, y };
  },
});
