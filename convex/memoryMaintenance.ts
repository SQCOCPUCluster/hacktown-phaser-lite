import { logger } from "./logger";
// Automated memory maintenance - runs periodically to prevent database bloat
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

// Main memory maintenance cron job - runs every 10 minutes
// Implements aggressive cleanup strategy for short-session simulations
export const memoryMaintenanceTick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const startTime = Date.now();
    logger.debug("🧹 Starting memory maintenance...");

    // STEP 1: Delete highly distorted gossip (>0.7 distortion)
    const gossipResult = await ctx.runMutation(internal.memories.deleteDistortedGossip, {
      minDistortion: 0.7,
    });
    logger.debug(`  ✓ Deleted ${gossipResult.deletedCount} distorted gossip memories`);

    // STEP 2: Delete low-importance memories older than 30 minutes
    const lowImportanceResult = await ctx.runMutation(
      internal.memories.deleteLowImportanceMemories,
      {
        maxImportance: 0.3,
        maxAgeMs: 30 * 60 * 1000, // 30 minutes
      }
    );
    logger.debug(
      `  ✓ Deleted ${lowImportanceResult.deletedCount} low-importance old memories`
    );

    // STEP 3: Delete ALL memories older than 2 hours (except critical importance >0.8)
    const oldMemoriesResult = await ctx.runMutation(internal.memories.deleteOldMemories, {
      maxAgeMs: 2 * 60 * 60 * 1000, // 2 hours
      minImportanceToKeep: 0.8, // Keep critical memories forever
    });
    logger.debug(
      `  ✓ Deleted ${oldMemoriesResult.deletedCount} memories older than 2 hours`
    );

    // STEP 4: Enforce per-NPC memory cap (100 memories per entity)
    const trimResult = await ctx.runMutation(internal.memories.trimAllMemories, {
      maxMemoriesPerEntity: 100,
    });
    logger.debug(
      `  ✓ Trimmed ${trimResult.totalDeleted} memories to enforce per-NPC limits`
    );

    // STEP 5: Archive ended conversations older than 1 hour
    const conversationArchiveResult = await ctx.runMutation(
      internal.conversations.archiveOldConversations,
      {
        maxAgeMs: 1 * 60 * 60 * 1000, // 1 hour
      }
    );
    logger.debug(
      `  ✓ Archived ${conversationArchiveResult.archivedCount} old conversations`
    );

    // STEP 6: Delete archived conversations older than 3 hours
    const conversationDeleteResult = await ctx.runMutation(
      internal.conversations.deleteArchivedConversations,
      {
        maxAgeMs: 3 * 60 * 60 * 1000, // 3 hours
      }
    );
    logger.debug(
      `  ✓ Deleted ${conversationDeleteResult.deletedCount} archived conversations`
    );

    // Calculate total cleanup
    const totalDeleted =
      gossipResult.deletedCount +
      lowImportanceResult.deletedCount +
      oldMemoriesResult.deletedCount +
      trimResult.totalDeleted +
      conversationDeleteResult.deletedCount;

    const duration = Date.now() - startTime;
    logger.debug(
      `🧹 Memory maintenance complete! Deleted ${totalDeleted} records in ${duration}ms`
    );

    return {
      totalDeleted,
      duration,
      breakdown: {
        distortedGossip: gossipResult.deletedCount,
        lowImportance: lowImportanceResult.deletedCount,
        oldMemories: oldMemoriesResult.deletedCount,
        trimmedForLimits: trimResult.totalDeleted,
        archivedConversations: conversationArchiveResult.archivedCount,
        deletedConversations: conversationDeleteResult.deletedCount,
      },
    };
  },
});
