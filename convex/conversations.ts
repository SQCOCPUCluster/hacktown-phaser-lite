// Conversation queries - Fetch active NPC dialogues for frontend display
import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Get all active conversations for display
export const listActiveConversations = query({
  handler: async (ctx) => {
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();

    return conversations;
  },
});

// Get all conversations (including ended ones)
export const listAllConversations = query({
  handler: async (ctx) => {
    return await ctx.db.query("conversations").collect();
  },
});

// Get conversation statistics for monitoring
// Uses sampling to avoid hitting read limits on large datasets
export const getConversationStats = query({
  args: {
    sampleSize: v.optional(v.number()),
  },
  handler: async (ctx, { sampleSize = 1000 }) => {
    const conversationsSample = await ctx.db.query("conversations").take(sampleSize);
    const activeConversations = conversationsSample.filter((c) => c.active);
    const endedConversations = conversationsSample.filter((c) => !c.active);

    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const threeHoursAgo = now - 3 * 60 * 60 * 1000;

    // Calculate age distribution of ended conversations
    const recentEnded = endedConversations.filter(
      (c) => c.endTime && c.endTime > oneHourAgo
    );
    const oldEnded = endedConversations.filter(
      (c) => c.endTime && c.endTime < threeHoursAgo
    );

    // Calculate total dialogue lines
    const totalDialogueLines = conversationsSample.reduce(
      (sum, c) => sum + c.dialogue.length,
      0
    );

    return {
      total: conversationsSample.length,
      isSample: conversationsSample.length >= sampleSize,
      active: activeConversations.length,
      ended: endedConversations.length,
      recentEnded: recentEnded.length,
      oldEnded: oldEnded.length,
      totalDialogueLines,
      averageDialoguePerConversation:
        totalDialogueLines / Math.max(1, conversationsSample.length),
    };
  },
});

// Archive old ended conversations (mark them for deletion but don't delete yet)
// Note: We'll use "active: false" as the "archived" state since there's no explicit archive field
// Processes a fixed number to avoid hitting read limits
export const archiveOldConversations = internalMutation({
  args: {
    maxAgeMs: v.number(), // Archive ended conversations older than this
    maxToProcess: v.optional(v.number()),
  },
  handler: async (ctx, { maxAgeMs, maxToProcess = 200 }) => {
    const now = Date.now();
    const cutoffTime = now - maxAgeMs;

    // Read up to maxToProcess conversations in a single query
    const conversations = await ctx.db.query("conversations").take(maxToProcess);

    let archivedCount = 0;

    for (const conversation of conversations) {
      // Only process ended conversations
      if (conversation.active) {
        continue;
      }

      // Check if old enough to archive (already marked as inactive, so just count)
      if (conversation.endTime && conversation.endTime < cutoffTime) {
        archivedCount++;
        // Note: Conversations are already marked inactive (active: false)
        // This function primarily serves as a counting/monitoring step
      }
    }

    return {
      archivedCount,
      cutoffTime,
      processedCount: conversations.length,
      hasMore: conversations.length === maxToProcess,
    };
  },
});

// Delete archived (ended) conversations that are very old
// Processes a fixed number to avoid hitting read limits
export const deleteArchivedConversations = internalMutation({
  args: {
    maxAgeMs: v.number(), // Delete ended conversations older than this
    maxToProcess: v.optional(v.number()),
  },
  handler: async (ctx, { maxAgeMs, maxToProcess = 200 }) => {
    const now = Date.now();
    const cutoffTime = now - maxAgeMs;

    // Read up to maxToProcess conversations in a single query
    const conversations = await ctx.db.query("conversations").take(maxToProcess);

    let deletedCount = 0;

    for (const conversation of conversations) {
      // Only delete ended conversations
      if (conversation.active) {
        continue;
      }

      // Delete if old enough
      if (conversation.endTime && conversation.endTime < cutoffTime) {
        await ctx.db.delete(conversation._id);
        deletedCount++;
      }
    }

    return {
      deletedCount,
      cutoffTime,
      processedCount: conversations.length,
      hasMore: conversations.length === maxToProcess,
    };
  },
});
