import { logger } from "./logger";
// Database migrations - update old data to new schema
import { mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Migrate old events to new schema with location fields
 * Run this once to update existing events in the database
 */
export const migrateOldEvents = mutation({
  handler: async (ctx) => {
    logger.debug("🔄 Starting event migration...");

    const allEvents = await ctx.db.query("events").collect();
    let migratedCount = 0;
    let deletedCount = 0;

    for (const event of allEvents) {
      // Check if event has new fields
      const hasNewFields =
        'locationX' in event &&
        'locationY' in event &&
        'scope' in event &&
        'severity' in event &&
        'affectedRadius' in event &&
        'witnessIds' in event;

      if (!hasNewFields) {
        // Delete old events (they're already expired anyway)
        await ctx.db.delete(event._id);
        deletedCount++;
        logger.debug(`🗑️ Deleted old event: ${event.description}`);
      } else {
        migratedCount++;
      }
    }

    logger.debug(`✅ Migration complete!`);
    logger.debug(`   - Already migrated: ${migratedCount} events`);
    logger.debug(`   - Deleted old events: ${deletedCount} events`);

    return {
      message: "Migration complete",
      migratedCount,
      deletedCount,
    };
  },
});

/**
 * Clear all events (useful for fresh start)
 */
export const clearAllEvents = mutation({
  handler: async (ctx) => {
    const allEvents = await ctx.db.query("events").collect();
    let count = 0;

    for (const event of allEvents) {
      await ctx.db.delete(event._id);
      count++;
    }

    logger.debug(`🗑️ Cleared ${count} events`);
    return { message: `Cleared ${count} events` };
  },
});

/**
 * Clear all memories (useful for fresh start)
 */
export const clearAllMemories = mutation({
  handler: async (ctx) => {
    const allMemories = await ctx.db.query("memories").collect();
    let count = 0;

    for (const memory of allMemories) {
      await ctx.db.delete(memory._id);
      count++;
    }

    logger.debug(`🗑️ Cleared ${count} memories`);
    return { message: `Cleared ${count} memories` };
  },
});

/**
 * Full reset - clear events and memories for fresh god events testing
 */
export const resetForGodEvents = mutation({
  handler: async (ctx) => {
    logger.debug("🔄 Resetting for god events system...");

    // Clear all old events
    const allEvents = await ctx.db.query("events").collect();
    for (const event of allEvents) {
      await ctx.db.delete(event._id);
    }

    // Clear all memories
    const allMemories = await ctx.db.query("memories").collect();
    for (const memory of allMemories) {
      await ctx.db.delete(memory._id);
    }

    logger.debug(`✅ Reset complete!`);
    logger.debug(`   - Deleted ${allEvents.length} events`);
    logger.debug(`   - Deleted ${allMemories.length} memories`);

    return {
      message: "Reset complete - ready for god events!",
      eventsDeleted: allEvents.length,
      memoriesDeleted: allMemories.length,
    };
  },
});

// ============================================================
// MEMORY CLEANUP MIGRATIONS
// ============================================================

/**
 * AGGRESSIVE MEMORY CLEANUP - Run this once to clean existing bloated data
 * This is a one-time cleanup for databases that have been running without maintenance
 *
 * Cleanup strategy for short sessions:
 * - Deletes distorted gossip (>0.7 distortion)
 * - Deletes low-importance (<0.3) memories older than 30 min
 * - Deletes moderate importance (<0.5) older than 1 hour
 * - Deletes all memories older than 2 hours (except critical >0.8)
 * - Enforces hard cap of 100 memories per NPC
 * - Deletes old conversations (>3 hours)
 */
export const aggressiveMemoryCleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    logger.debug("🚨 STARTING AGGRESSIVE MEMORY CLEANUP 🚨");
    const startTime = Date.now();

    // Skip initial stats to save reads (2000 reads saved!)
    logger.debug("📊 Starting cleanup (run stats separately to see current state)");

    let totalDeleted = 0;

    // STEP 1: Delete ALL highly distorted gossip (>0.7 distortion)
    logger.debug("\n🗑️  STEP 1: Deleting distorted gossip...");
    const gossipResult = await ctx.runMutation(internal.memories.deleteDistortedGossip, {
      minDistortion: 0.7,
      maxToProcess: 200, // Reduced to 200 to stay well under 4096 total limit
    });
    totalDeleted += gossipResult.deletedCount;
    logger.debug(`   ✓ Deleted ${gossipResult.deletedCount} distorted gossip memories (processed ${gossipResult.processedCount})`);
    if (gossipResult.hasMore) {
      logger.debug(`   ⚠️  More gossip to delete - run this migration again`);
    }

    // STEP 2: Delete ALL low-importance memories (<0.3) older than 30 minutes
    logger.debug("\n🗑️  STEP 2: Deleting old low-importance memories...");
    const lowImportanceResult = await ctx.runMutation(
      internal.memories.deleteLowImportanceMemories,
      {
        maxImportance: 0.3,
        maxAgeMs: 30 * 60 * 1000, // 30 minutes
        maxToProcess: 200,
      }
    );
    totalDeleted += lowImportanceResult.deletedCount;
    logger.debug(
      `   ✓ Deleted ${lowImportanceResult.deletedCount} low-importance memories (processed ${lowImportanceResult.processedCount})`
    );
    if (lowImportanceResult.hasMore) {
      logger.debug(`   ⚠️  More low-importance memories to delete - run this migration again`);
    }

    // STEP 3: Delete moderate importance (<0.5) older than 1 hour
    logger.debug("\n🗑️  STEP 3: Deleting moderate importance old memories...");
    const moderateResult = await ctx.runMutation(
      internal.memories.deleteLowImportanceMemories,
      {
        maxImportance: 0.5,
        maxAgeMs: 1 * 60 * 60 * 1000, // 1 hour
        maxToProcess: 200,
      }
    );
    totalDeleted += moderateResult.deletedCount;
    logger.debug(`   ✓ Deleted ${moderateResult.deletedCount} moderate importance memories (processed ${moderateResult.processedCount})`);
    if (moderateResult.hasMore) {
      logger.debug(`   ⚠️  More moderate-importance memories to delete - run this migration again`);
    }

    // STEP 4: Delete ALL memories older than 2 hours (except critical >0.8)
    logger.debug("\n🗑️  STEP 4: Deleting all memories older than 2 hours...");
    const oldMemoriesResult = await ctx.runMutation(internal.memories.deleteOldMemories, {
      maxAgeMs: 2 * 60 * 60 * 1000, // 2 hours
      minImportanceToKeep: 0.8, // Keep critical memories forever
      maxToProcess: 200,
    });
    totalDeleted += oldMemoriesResult.deletedCount;
    logger.debug(`   ✓ Deleted ${oldMemoriesResult.deletedCount} old memories (kept >0.8, processed ${oldMemoriesResult.processedCount})`);
    if (oldMemoriesResult.hasMore) {
      logger.debug(`   ⚠️  More old memories to delete - run this migration again`);
    }

    // STEP 5: Enforce hard cap of 100 memories per NPC
    logger.debug("\n🗑️  STEP 5: Enforcing per-NPC memory caps (100 max)...");
    const trimResult = await ctx.runMutation(internal.memories.trimAllMemories, {
      maxMemoriesPerEntity: 100,
    });
    totalDeleted += trimResult.totalDeleted;
    logger.debug(
      `   ✓ Trimmed ${trimResult.totalDeleted} memories to enforce per-NPC limits`
    );

    // STEP 6: Delete ended conversations older than 3 hours
    logger.debug("\n🗑️  STEP 6: Deleting old conversations...");
    const conversationResult = await ctx.runMutation(
      internal.conversations.deleteArchivedConversations,
      {
        maxAgeMs: 3 * 60 * 60 * 1000, // 3 hours
        maxToProcess: 200,
      }
    );
    logger.debug(`   ✓ Deleted ${conversationResult.deletedCount} old conversations (processed ${conversationResult.processedCount})`);
    if (conversationResult.hasMore) {
      logger.debug(`   ⚠️  More conversations to delete - run this migration again`);
    }

    // Skip final stats to save reads - user can check manually
    const duration = Date.now() - startTime;

    // Check if more passes are needed
    const needsAnotherPass =
      gossipResult.hasMore ||
      lowImportanceResult.hasMore ||
      moderateResult.hasMore ||
      oldMemoriesResult.hasMore ||
      conversationResult.hasMore;

    logger.debug("\n✅ AGGRESSIVE CLEANUP COMPLETE!");
    logger.debug(`   Total deleted: ${totalDeleted} memories`);
    logger.debug(`   Deleted conversations: ${conversationResult.deletedCount}`);
    logger.debug(`   Duration: ${duration}ms`);
    logger.debug(`\n📊 To check current state, run: npx convex run memories:getMemoryStats`);

    if (needsAnotherPass) {
      logger.debug("\n⚠️  WARNING: Database still has more memories to clean!");
      logger.debug("   Run this migration again to continue cleanup:");
      logger.debug("   npx convex run migrations:aggressiveMemoryCleanup");
    } else {
      logger.debug("\n🎉 All cleanup complete! Database is optimized.");
    }

    return {
      success: true,
      needsAnotherPass,
      totalDeleted,
      conversationsDeleted: conversationResult.deletedCount,
      duration,
      breakdown: {
        distortedGossip: gossipResult.deletedCount,
        lowImportance: lowImportanceResult.deletedCount,
        moderateImportance: moderateResult.deletedCount,
        oldMemories: oldMemoriesResult.deletedCount,
        trimmedForLimits: trimResult.totalDeleted,
      },
    };
  },
});

/**
 * GENTLE MEMORY CLEANUP - Less aggressive, for fine-tuning
 * Only deletes very old (3+ hours) and unimportant data
 */
export const gentleMemoryCleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    logger.debug("🧹 Starting gentle memory cleanup...");

    // Only delete very old (3+ hours) and low importance
    const result1 = await ctx.runMutation(internal.memories.deleteLowImportanceMemories, {
      maxImportance: 0.3,
      maxAgeMs: 3 * 60 * 60 * 1000, // 3 hours
    });

    // Delete gossip with extreme distortion only
    const result2 = await ctx.runMutation(internal.memories.deleteDistortedGossip, {
      minDistortion: 0.9,
    });

    // Trim to 200 per entity (more generous)
    const result3 = await ctx.runMutation(internal.memories.trimAllMemories, {
      maxMemoriesPerEntity: 200,
    });

    logger.debug(
      `✅ Gentle cleanup complete: ${result1.deletedCount + result2.deletedCount + result3.totalDeleted} memories deleted`
    );

    return {
      lowImportance: result1.deletedCount,
      distortedGossip: result2.deletedCount,
      trimmed: result3.totalDeleted,
      total: result1.deletedCount + result2.deletedCount + result3.totalDeleted,
    };
  },
});
