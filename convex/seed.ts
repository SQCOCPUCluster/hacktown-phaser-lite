import { logger } from "./logger";
// Setup scripts to populate the database with starting NPCs and data
import { internalMutation } from "./_generated/server";

// Fill the world with 5 starting NPCs and their initial memories
export const seedWorld = internalMutation({
  handler: async (ctx) => {
    // Don't seed if NPCs already exist
    const existing = await ctx.db.query("entities").first();
    if (existing) {
      logger.debug("World already seeded");
      return { message: "World already has entities" };
    }

    // Create the global world state
    await ctx.db.insert("worldState", {
      currentTime: 0,
      population: 5,
      totalBirths: 5,
      totalDeaths: 0,
      totalThoughts: 0,
      lastTickTime: Date.now(),
    });

    // Create the 5 starter NPCs (Alice, Ben, Chloe, Diego, Eve)
    const alice = await ctx.db.insert("entities", {
      name: "Alice",
      color: "0x5fa8d3",
      x: 220,
      y: 160,
      targetX: 220,
      targetY: 160,
      speed: 42,
      personality: {
        curiosity: 0.8,
        empathy: 0.9,
        boldness: 0.7,
        order: 0.8,
        mood: 0.7,
        weirdness: 0.4,
      },
      alive: true,
      health: 1.0,
      stress: 0.0,
      age: 0,
      lastAction: "Planning café meetup",
    });

    const ben = await ctx.db.insert("entities", {
      name: "Ben",
      color: "0xd85f5f",
      x: 480,
      y: 340,
      targetX: 480,
      targetY: 340,
      speed: 42,
      personality: {
        curiosity: 0.6,
        empathy: 0.5,
        boldness: 0.8,
        order: 0.5,
        mood: 0.6,
        weirdness: 0.7,
      },
      alive: true,
      health: 1.0,
      stress: 0.0,
      age: 0,
    });

    const chloe = await ctx.db.insert("entities", {
      name: "Chloe",
      color: "0x9acd32",
      x: 740,
      y: 120,
      targetX: 740,
      targetY: 120,
      speed: 42,
      personality: {
        curiosity: 0.9,
        empathy: 0.7,
        boldness: 0.6,
        order: 0.6,
        mood: 0.8,
        weirdness: 0.5,
      },
      alive: true,
      health: 1.0,
      stress: 0.0,
      age: 0,
    });

    const diego = await ctx.db.insert("entities", {
      name: "Diego",
      color: "0xffaf40",
      x: 140,
      y: 420,
      targetX: 140,
      targetY: 420,
      speed: 42,
      personality: {
        curiosity: 0.7,
        empathy: 0.8,
        boldness: 0.5,
        order: 0.7,
        mood: 0.7,
        weirdness: 0.6,
      },
      alive: true,
      health: 1.0,
      stress: 0.0,
      age: 0,
    });

    const eve = await ctx.db.insert("entities", {
      name: "Eve",
      color: "0xc084fc",
      x: 360,
      y: 220,
      targetX: 360,
      targetY: 220,
      speed: 42,
      personality: {
        curiosity: 0.8,
        empathy: 0.6,
        boldness: 0.7,
        order: 0.4,
        mood: 0.6,
        weirdness: 0.9,
      },
      alive: true,
      health: 1.0,
      stress: 0.0,
      age: 0,
    });

    // Give each NPC one starting memory
    await ctx.db.insert("memories", {
      entityId: alice,
      entityName: "Alice",
      text: "I plan a small meetup at the cafe at 18:00 to talk side projects.",
      timestamp: 0,
      importance: 0.9,
    });

    await ctx.db.insert("memories", {
      entityId: ben,
      entityName: "Ben",
      text: "Alice often hosts meetups.",
      timestamp: 0,
      importance: 0.5,
    });

    await ctx.db.insert("memories", {
      entityId: chloe,
      entityName: "Chloe",
      text: "I want to meet more builders.",
      timestamp: 0,
      importance: 0.6,
    });

    await ctx.db.insert("memories", {
      entityId: diego,
      entityName: "Diego",
      text: "I enjoy talking about app ideas at the cafe.",
      timestamp: 0,
      importance: 0.5,
    });

    await ctx.db.insert("memories", {
      entityId: eve,
      entityName: "Eve",
      text: "I should socialize after school.",
      timestamp: 0,
      importance: 0.5,
    });

    logger.debug("World seeded successfully!");
    return {
      message: "World seeded with 5 NPCs and initial memories",
      entities: 5,
      memories: 5,
    };
  },
});

// Wipe everything from the database (dangerous - deletes all NPCs, memories, events)
export const clearWorld = internalMutation({
  handler: async (ctx) => {
    // Delete all NPCs
    const entities = await ctx.db.query("entities").collect();
    for (const entity of entities) {
      await ctx.db.delete(entity._id);
    }

    // Delete all memories
    const memories = await ctx.db.query("memories").collect();
    for (const memory of memories) {
      await ctx.db.delete(memory._id);
    }

    // Delete all events
    const events = await ctx.db.query("events").collect();
    for (const event of events) {
      await ctx.db.delete(event._id);
    }

    // Delete world state
    const worldState = await ctx.db.query("worldState").collect();
    for (const state of worldState) {
      await ctx.db.delete(state._id);
    }

    return { message: "World cleared" };
  },
});