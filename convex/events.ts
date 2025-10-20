// Functions for world events (festivals, storms, etc.)
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Get all events currently happening
export const getActiveEvents = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("events")
      .filter((q) => q.eq(q.field("active"), true))
      .collect();
  },
});

// Start a new event (like a storm or festival) - LEGACY, use godEvents instead
export const createEvent = mutation({
  args: {
    type: v.string(),
    description: v.string(),
    startTime: v.number(),
    endTime: v.number(),
    stressModifier: v.number(),
    dangerModifier: v.number(),
    locationX: v.optional(v.number()),
    locationY: v.optional(v.number()),
    locationName: v.optional(v.string()),
    scope: v.optional(v.string()),
    severity: v.optional(v.number()),
    affectedRadius: v.optional(v.number()),
    witnessIds: v.optional(v.array(v.id("entities"))),
  },
  handler: async (ctx, args) => {
    // Create event and mark it as active (with defaults for new fields)
    return await ctx.db.insert("events", {
      type: args.type,
      description: args.description,
      startTime: args.startTime,
      endTime: args.endTime,
      stressModifier: args.stressModifier,
      dangerModifier: args.dangerModifier,
      active: true,
      locationX: args.locationX ?? 450,  // Default to center
      locationY: args.locationY ?? 260,
      locationName: args.locationName,
      scope: args.scope ?? "citywide",   // Legacy events are citywide
      severity: args.severity ?? 0.5,
      affectedRadius: args.affectedRadius ?? 500,
      witnessIds: args.witnessIds ?? [],
    });
  },
});

// Stop an event manually
export const endEvent = mutation({
  args: { id: v.id("events") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { active: false });
  },
});

// Automatically end events that have passed their end time
export const updateEventStatus = mutation({
  args: { currentTime: v.number() },
  handler: async (ctx, { currentTime }) => {
    const events = await ctx.db.query("events").collect();

    // Check each event and end it if time has passed
    for (const event of events) {
      if (event.active && currentTime > event.endTime) {
        await ctx.db.patch(event._id, { active: false });
      }
    }
  },
});
