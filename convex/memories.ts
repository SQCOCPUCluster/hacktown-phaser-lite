// Functions for NPC memories (storing and retrieving what NPCs remember)
import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

// Get recent memories for a specific NPC
export const getMemories = query({
  args: {
    entityId: v.id("entities"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { entityId, limit = 50 }) => {
    // Fetch memories newest first, limited to 50 by default
    return await ctx.db
      .query("memories")
      .withIndex("by_entity", (q) => q.eq("entityId", entityId))
      .order("desc")
      .take(limit);
  },
});

// Save a new memory for an NPC
export const addMemory = mutation({
  args: {
    entityId: v.id("entities"),
    entityName: v.string(),
    text: v.string(),
    timestamp: v.number(),
    importance: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("memories", args);
  },
});

// Search an NPC's memories for a specific word
export const searchMemories = query({
  args: {
    entityId: v.id("entities"),
    keyword: v.string(),
  },
  handler: async (ctx, { entityId, keyword }) => {
    // Get all memories for this NPC
    const allMemories = await ctx.db
      .query("memories")
      .withIndex("by_entity", (q) => q.eq("entityId", entityId))
      .collect();

    // Filter for keyword match, sort by importance, return top 10
    return allMemories
      .filter((m) => m.text.toLowerCase().includes(keyword.toLowerCase()))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 10);
  },
});

// Get only important memories (significance > 0.6)
export const getImportantMemories = query({
  args: {
    entityId: v.id("entities"),
  },
  handler: async (ctx, { entityId }) => {
    // Fetch all memories for this NPC
    const allMemories = await ctx.db
      .query("memories")
      .withIndex("by_entity", (q) => q.eq("entityId", entityId))
      .collect();

    // Filter for high importance, sort by time, return top 10
    return allMemories
      .filter((m) => m.importance > 0.6)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10);
  },
});

// Get recent meaningful memories for AI context (recency + importance)
export const getRecentMeaningfulMemories = query({
  args: {
    entityId: v.id("entities"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { entityId, limit = 5 }) => {
    // Get last 20 memories
    const recentMemories = await ctx.db
      .query("memories")
      .withIndex("by_entity", (q) => q.eq("entityId", entityId))
      .order("desc")
      .take(20);

    // Filter for importance > 0.5 (meaningful), sort by recency, take top N
    return recentMemories
      .filter((m) => m.importance > 0.5)
      .slice(0, limit);
  },
});

// ============================================================
// MEMORY MAINTENANCE & CLEANUP FUNCTIONS
// ============================================================

// Get memory statistics for monitoring and debugging
// Uses pagination to avoid hitting Convex's 4096 read limit
export const getMemoryStats = query({
  args: {
    sampleSize: v.optional(v.number()), // Sample this many memories for stats (default: 2000)
  },
  handler: async (ctx, { sampleSize = 2000 }) => {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const twoHoursAgo = now - 2 * 60 * 60 * 1000;

    // Sample memories instead of collecting all
    const memoriesSample = await ctx.db.query("memories").take(sampleSize);

    // Get count of all entities to estimate total memories
    const allEntities = await ctx.db.query("entities").collect();

    // Group by entity to find per-NPC counts
    const memoryCountsByEntity = new Map<string, number>();
    const importanceDistribution = { low: 0, medium: 0, high: 0, critical: 0 };
    const ageDistribution = { recent: 0, oneHour: 0, twoHours: 0, old: 0 };
    let totalGossip = 0;
    let highDistortionGossip = 0;

    for (const memory of memoriesSample) {
      // Per-entity counts
      const count = memoryCountsByEntity.get(memory.entityId) || 0;
      memoryCountsByEntity.set(memory.entityId, count + 1);

      // Importance distribution
      if (memory.importance >= 0.8) importanceDistribution.critical++;
      else if (memory.importance >= 0.5) importanceDistribution.high++;
      else if (memory.importance >= 0.3) importanceDistribution.medium++;
      else importanceDistribution.low++;

      // Age distribution
      if (memory.timestamp > oneHourAgo) ageDistribution.recent++;
      else if (memory.timestamp > twoHoursAgo) ageDistribution.oneHour++;
      else ageDistribution.old++;

      // Gossip tracking
      if (memory.heardFrom) {
        totalGossip++;
        if ((memory.distortionLevel || 0) > 0.7) {
          highDistortionGossip++;
        }
      }
    }

    // Find max memories per entity from sample
    let maxMemoriesPerEntity = 0;
    let entityWithMostMemories = "";
    for (const [entityId, count] of memoryCountsByEntity.entries()) {
      if (count > maxMemoriesPerEntity) {
        maxMemoriesPerEntity = count;
        entityWithMostMemories = entityId;
      }
    }

    // Estimate total by checking if we got fewer than sample size
    const estimatedTotal = memoriesSample.length < sampleSize
      ? memoriesSample.length
      : memoriesSample.length; // If we hit sample limit, actual total might be higher

    return {
      totalMemories: estimatedTotal,
      isSample: memoriesSample.length >= sampleSize,
      sampleSize: memoriesSample.length,
      uniqueEntities: memoryCountsByEntity.size,
      totalEntities: allEntities.length,
      averageMemoriesPerEntity: estimatedTotal / Math.max(1, memoryCountsByEntity.size),
      maxMemoriesPerEntity,
      entityWithMostMemories,
      importanceDistribution,
      ageDistribution,
      gossipStats: {
        total: totalGossip,
        highDistortion: highDistortionGossip,
      },
    };
  },
});

// Delete old memories based on age and importance thresholds
// Processes a fixed number of memories to avoid read limits
export const deleteOldMemories = mutation({
  args: {
    maxAgeMs: v.number(), // Delete memories older than this (milliseconds)
    minImportanceToKeep: v.optional(v.number()), // Keep memories above this importance regardless of age
    maxToProcess: v.optional(v.number()), // Max memories to check (to stay under read limit)
  },
  handler: async (ctx, { maxAgeMs, minImportanceToKeep = 0.8, maxToProcess = 200 }) => {
    const now = Date.now();
    const cutoffTime = now - maxAgeMs;

    // Read up to maxToProcess memories in a single query
    const memories = await ctx.db.query("memories").take(maxToProcess);

    let deletedCount = 0;

    for (const memory of memories) {
      // Keep high-importance memories forever
      if (memory.importance >= minImportanceToKeep) {
        continue;
      }

      // Delete if older than cutoff
      if (memory.timestamp < cutoffTime) {
        await ctx.db.delete(memory._id);
        deletedCount++;
      }
    }

    return {
      deletedCount,
      cutoffTime,
      processedCount: memories.length,
      hasMore: memories.length === maxToProcess,
    };
  },
});

// Delete low-importance memories
// Processes a fixed number of memories to avoid read limits
export const deleteLowImportanceMemories = mutation({
  args: {
    maxImportance: v.number(), // Delete memories below this threshold
    maxAgeMs: v.optional(v.number()), // Only delete if also older than this
    maxToProcess: v.optional(v.number()), // Max memories to check (to stay under read limit)
  },
  handler: async (ctx, { maxImportance, maxAgeMs, maxToProcess = 200 }) => {
    const now = Date.now();

    // Read up to maxToProcess memories in a single query
    const memories = await ctx.db.query("memories").take(maxToProcess);

    let deletedCount = 0;

    for (const memory of memories) {
      // Check importance threshold
      if (memory.importance > maxImportance) {
        continue;
      }

      // If age constraint specified, check it
      if (maxAgeMs !== undefined) {
        const cutoffTime = now - maxAgeMs;
        if (memory.timestamp >= cutoffTime) {
          continue;
        }
      }

      await ctx.db.delete(memory._id);
      deletedCount++;
    }

    return {
      deletedCount,
      processedCount: memories.length,
      hasMore: memories.length === maxToProcess,
    };
  },
});

// Delete highly distorted gossip memories
// Processes a fixed number of memories to avoid read limits
export const deleteDistortedGossip = mutation({
  args: {
    minDistortion: v.number(), // Delete gossip with distortion above this threshold
    maxToProcess: v.optional(v.number()), // Max memories to check (to stay under read limit)
  },
  handler: async (ctx, { minDistortion, maxToProcess = 200 }) => {
    // Read up to maxToProcess memories in a single query
    const memories = await ctx.db.query("memories").take(maxToProcess);

    let deletedCount = 0;

    for (const memory of memories) {
      // Only check gossip (memories with heardFrom)
      if (!memory.heardFrom) {
        continue;
      }

      // Delete if distortion is too high
      if ((memory.distortionLevel || 0) >= minDistortion) {
        await ctx.db.delete(memory._id);
        deletedCount++;
      }
    }

    return {
      deletedCount,
      processedCount: memories.length,
      hasMore: memories.length === maxToProcess,
    };
  },
});

// Enforce per-NPC memory limits (keep only top N most important/recent)
export const trimMemoriesForEntity = internalMutation({
  args: {
    entityId: v.id("entities"),
    maxMemories: v.number(), // Keep only this many memories
    minImportanceToKeep: v.optional(v.number()), // Always keep memories above this importance
  },
  handler: async (ctx, { entityId, maxMemories, minImportanceToKeep = 0.8 }) => {
    const allMemories = await ctx.db
      .query("memories")
      .withIndex("by_entity", (q) => q.eq("entityId", entityId))
      .collect();

    // Separate into protected and trimmable
    const protected_memories = allMemories.filter((m) => m.importance >= minImportanceToKeep);
    const trimmable = allMemories.filter((m) => m.importance < minImportanceToKeep);

    // If we're under the limit including protected, nothing to do
    if (allMemories.length <= maxMemories) {
      return { deletedCount: 0, keptCount: allMemories.length };
    }

    // Sort trimmable by composite score (importance * 0.6 + recency * 0.4)
    const now = Date.now();
    const maxAge = 2 * 60 * 60 * 1000; // 2 hours for normalization

    trimmable.sort((a, b) => {
      const scoreA = a.importance * 0.6 + Math.min(1, (now - a.timestamp) / maxAge) * 0.4;
      const scoreB = b.importance * 0.6 + Math.min(1, (now - b.timestamp) / maxAge) * 0.4;
      return scoreB - scoreA; // Higher score first
    });

    // Calculate how many trimmable we can keep
    const slotsForTrimmable = Math.max(0, maxMemories - protected_memories.length);
    const toDelete = trimmable.slice(slotsForTrimmable);

    // Delete excess memories
    let deletedCount = 0;
    for (const memory of toDelete) {
      await ctx.db.delete(memory._id);
      deletedCount++;
    }

    return {
      deletedCount,
      keptCount: allMemories.length - deletedCount,
      protectedCount: protected_memories.length,
    };
  },
});

// Trim all entities to enforce memory limits
// Gets entity IDs from entities table to avoid reading all memories
export const trimAllMemories = mutation({
  args: {
    maxMemoriesPerEntity: v.number(),
  },
  handler: async (ctx, { maxMemoriesPerEntity }) => {
    // Get all entities instead of all memories to avoid read limit
    const allEntities = await ctx.db.query("entities").collect();

    let totalDeleted = 0;
    const results = [];

    for (const entity of allEntities) {
      const result = await ctx.runMutation(internal.memories.trimMemoriesForEntity, {
        entityId: entity._id,
        maxMemories: maxMemoriesPerEntity,
      });
      totalDeleted += result.deletedCount;

      // Only include in results if memories were actually deleted
      if (result.deletedCount > 0) {
        results.push({ entityId: entity._id, entityName: entity.name, ...result });
      }
    }

    return { totalDeleted, entityResults: results };
  },
});
