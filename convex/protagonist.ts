import { logger } from "./logger";
// Protagonist tracking system - Follow one NPC's life story over time
import { v } from "convex/values";
import { mutation, query, internalMutation, internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { generateDialogue } from "./ai";

// Get current protagonist data (for UI display)
export const getProtagonist = query({
  handler: async (ctx) => {
    const protagonist = await ctx.db.query("protagonist").first();

    if (!protagonist) {
      return null;
    }

    // Get current entity data
    const entity = await ctx.db.get(protagonist.entityId);

    if (!entity) {
      return null; // Protagonist entity was deleted
    }

    // Get recent life events (last 10)
    const lifeEvents = await ctx.db
      .query("lifeEvents")
      .withIndex("by_protagonist", (q) => q.eq("protagonistId", protagonist._id))
      .order("desc")
      .take(10);

    return {
      ...protagonist,
      currentEntity: entity, // Include live NPC data (current mood, position, etc.)
      recentEvents: lifeEvents,
    };
  },
});

// Auto-designate a random NPC as protagonist (called at world start)
export const autoDesignateProtagonist = internalMutation({
  handler: async (ctx) => {
    // Check if protagonist already exists
    const existing = await ctx.db.query("protagonist").first();
    if (existing) {
      logger.debug("⭐ Protagonist already exists:", existing.entityName);
      return existing._id;
    }

    // Get all living NPCs
    const entities = await ctx.db
      .query("entities")
      .withIndex("by_alive", (q) => q.eq("alive", true))
      .collect();

    if (entities.length === 0) {
      logger.debug("⚠️ No living NPCs to designate as protagonist");
      return null;
    }

    // Prefer NPCs with extreme personalities (more dramatic arcs)
    // Score based on how far traits are from 0.5 (neutral)
    const scored = entities.map((e) => {
      const personality = e.personality;
      const extremeness =
        Math.abs(personality.boldness - 0.5) +
        Math.abs(personality.curiosity - 0.5) +
        Math.abs(personality.empathy - 0.5) +
        Math.abs(personality.weirdness - 0.5);

      return { entity: e, score: extremeness };
    });

    // Sort by extremeness (most extreme first)
    scored.sort((a, b) => b.score - a.score);

    // Pick from top 3 most extreme (adds some randomness)
    const topCandidates = scored.slice(0, Math.min(3, scored.length));
    const chosen = topCandidates[Math.floor(Math.random() * topCandidates.length)].entity;

    // Get current world time
    const worldState = await ctx.db.query("worldState").first();
    const currentTime = worldState?.currentTime || 0;

    // Create protagonist record
    const protagonistId = await ctx.db.insert("protagonist", {
      entityId: chosen._id,
      entityName: chosen.name,
      designatedAt: currentTime,
      birthTime: currentTime - chosen.age, // Backdate to when they were born
      isAlive: true,
      initialPersonality: { ...chosen.personality },
      personalityChanges: [],
      relationships: [],
      totalConversations: 0,
      totalThoughts: 0,
      eventsWitnessed: [],
      locationsVisited: [],
    });

    // Record birth as first life event
    await ctx.db.insert("lifeEvents", {
      protagonistId,
      entityId: chosen._id,
      timestamp: currentTime - chosen.age,
      eventType: "birth",
      description: `${chosen.name} was born with a ${chosen.personality.boldness > 0.6 ? 'bold' : chosen.personality.boldness < 0.4 ? 'cautious' : 'balanced'} and ${chosen.personality.curiosity > 0.6 ? 'curious' : chosen.personality.curiosity < 0.4 ? 'reserved' : 'normal'} personality`,
      importance: 0.8,
    });

    logger.debug(`⭐ Protagonist designated: ${chosen.name} (age: ${chosen.age}, boldness: ${chosen.personality.boldness.toFixed(2)}, curiosity: ${chosen.personality.curiosity.toFixed(2)})`);

    return protagonistId;
  },
});

// Record a major life event for the protagonist
export const recordLifeEvent = internalMutation({
  args: {
    eventType: v.string(),
    description: v.string(),
    importance: v.number(),
    relatedNpcId: v.optional(v.id("entities")),
    relatedNpcName: v.optional(v.string()),
    relatedEventId: v.optional(v.id("events")),
    emotionalImpact: v.optional(v.object({
      moodChange: v.number(),
      stressChange: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const protagonist = await ctx.db.query("protagonist").first();
    if (!protagonist) return; // No protagonist designated

    const worldState = await ctx.db.query("worldState").first();
    const currentTime = worldState?.currentTime || 0;

    await ctx.db.insert("lifeEvents", {
      protagonistId: protagonist._id,
      entityId: protagonist.entityId,
      timestamp: currentTime,
      eventType: args.eventType,
      description: args.description,
      importance: args.importance,
      relatedNpcId: args.relatedNpcId,
      relatedNpcName: args.relatedNpcName,
      relatedEventId: args.relatedEventId,
      emotionalImpact: args.emotionalImpact,
    });

    logger.debug(`📝 Protagonist life event: ${args.description} (importance: ${args.importance})`);
  },
});

// Track personality changes for the protagonist
export const trackPersonalityChange = internalMutation({
  args: {
    entityId: v.id("entities"),
    trait: v.string(),
    oldValue: v.number(),
    newValue: v.number(),
    trigger: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const protagonist = await ctx.db.query("protagonist").first();
    if (!protagonist || protagonist.entityId !== args.entityId) {
      return; // This NPC is not the protagonist
    }

    const worldState = await ctx.db.query("worldState").first();
    const currentTime = worldState?.currentTime || 0;

    // Add to personality changes array
    const changes = protagonist.personalityChanges || [];
    changes.push({
      timestamp: currentTime,
      trait: args.trait,
      oldValue: args.oldValue,
      newValue: args.newValue,
      trigger: args.trigger,
    });

    await ctx.db.patch(protagonist._id, {
      personalityChanges: changes,
    });

    // If significant change (>0.2), record as life event
    const delta = Math.abs(args.newValue - args.oldValue);
    if (delta > 0.2) {
      const direction = args.newValue > args.oldValue ? "increased" : "decreased";
      const percentage = Math.round(delta * 100);

      await ctx.db.insert("lifeEvents", {
        protagonistId: protagonist._id,
        entityId: protagonist.entityId,
        timestamp: currentTime,
        eventType: "personality_shift",
        description: `${protagonist.entityName}'s ${args.trait} ${direction} by ${percentage}%${args.trigger ? ` after ${args.trigger}` : ''}`,
        importance: delta, // Use delta as importance (0.2-1.0)
      });
    }

    logger.debug(`🎭 Protagonist personality shift: ${args.trait} ${args.oldValue.toFixed(2)} → ${args.newValue.toFixed(2)}`);
  },
});

// Track relationships for the protagonist
export const trackRelationship = internalMutation({
  args: {
    otherNpcId: v.id("entities"),
    otherNpcName: v.string(),
  },
  handler: async (ctx, args) => {
    const protagonist = await ctx.db.query("protagonist").first();
    if (!protagonist) return;

    const worldState = await ctx.db.query("worldState").first();
    const currentTime = worldState?.currentTime || 0;

    // Find existing relationship
    const relationships = protagonist.relationships || [];
    const existingIndex = relationships.findIndex(r => r.npcId === args.otherNpcId);

    if (existingIndex >= 0) {
      // Update existing relationship
      relationships[existingIndex].conversationCount++;
      relationships[existingIndex].lastInteraction = currentTime;

      // Increase affinity slightly with each interaction (capped at 1.0)
      relationships[existingIndex].affinity = Math.min(1.0, relationships[existingIndex].affinity + 0.1);
    } else {
      // New relationship
      relationships.push({
        npcId: args.otherNpcId,
        npcName: args.otherNpcName,
        firstMet: currentTime,
        conversationCount: 1,
        lastInteraction: currentTime,
        affinity: 0.5, // Start neutral
      });

      // Record "first meeting" life event if this is the 1st, 3rd, or 5th person met (milestones)
      const meetCount = relationships.length;
      if (meetCount === 1 || meetCount === 3 || meetCount === 5) {
        await ctx.db.insert("lifeEvents", {
          protagonistId: protagonist._id,
          entityId: protagonist.entityId,
          timestamp: currentTime,
          eventType: "relationship",
          description: `${protagonist.entityName} met ${args.otherNpcName}${meetCount > 1 ? ` (${meetCount} people total)` : ' for the first time'}`,
          importance: meetCount === 1 ? 0.7 : 0.4,
          relatedNpcId: args.otherNpcId,
          relatedNpcName: args.otherNpcName,
        });
      }
    }

    // Increment total conversation counter
    await ctx.db.patch(protagonist._id, {
      relationships,
      totalConversations: protagonist.totalConversations + 1,
    });

    logger.debug(`💬 Protagonist relationship updated: ${args.otherNpcName} (${relationships.find(r => r.npcId === args.otherNpcId)?.conversationCount} conversations)`);
  },
});

// Record when protagonist witnesses a world event
export const recordWitnessedEvent = internalMutation({
  args: {
    eventId: v.id("events"),
    eventType: v.string(),
    eventDescription: v.string(),
    severity: v.number(),
  },
  handler: async (ctx, args) => {
    const protagonist = await ctx.db.query("protagonist").first();
    if (!protagonist) return;

    const worldState = await ctx.db.query("worldState").first();
    const currentTime = worldState?.currentTime || 0;

    // Add to witnessed events list
    const witnessed = protagonist.eventsWitnessed || [];
    if (!witnessed.includes(args.eventId)) {
      witnessed.push(args.eventId);
      await ctx.db.patch(protagonist._id, {
        eventsWitnessed: witnessed,
      });
    }

    // Record as life event
    await ctx.db.insert("lifeEvents", {
      protagonistId: protagonist._id,
      entityId: protagonist.entityId,
      timestamp: currentTime,
      eventType: "witness",
      description: `Witnessed ${args.eventDescription}`,
      importance: args.severity,
      relatedEventId: args.eventId,
    });

    logger.debug(`👁️ Protagonist witnessed event: ${args.eventDescription}`);
  },
});

// Generate AI life summary (called every 5 minutes)
export const generateLifeSummary = internalAction({
  handler: async (ctx) => {
    const protagonist = await ctx.runQuery(internal.protagonist.getProtagonistForSummary);

    if (!protagonist || !protagonist.currentEntity) {
      logger.debug("⚠️ No protagonist to generate summary for");
      return;
    }

    const entity = protagonist.currentEntity;
    const initial = protagonist.initialPersonality;
    const current = entity.personality;

    // Get major life events
    const majorEvents = protagonist.recentEvents
      .filter((e: any) => e.importance > 0.6)
      .slice(0, 5)
      .map((e: any) => e.description);

    // Get closest relationships
    const relationships = protagonist.relationships || [];
    const sortedRelationships = relationships
      .sort((a: any, b: any) => b.conversationCount - a.conversationCount)
      .slice(0, 3);

    // Build prompt for LLM
    const prompt = `You are narrating the life story of ${protagonist.entityName}, an NPC in a living simulation.

INITIAL STATE (at designation):
- Personality: Bold (${(initial.boldness * 100).toFixed(0)}%), Curious (${(initial.curiosity * 100).toFixed(0)}%), Empathetic (${(initial.empathy * 100).toFixed(0)}%)
- Mood: ${(initial.mood * 100).toFixed(0)}%

CURRENT STATE (after ${Math.floor(entity.age / 60)} minutes):
- Personality: Bold (${(current.boldness * 100).toFixed(0)}%), Curious (${(current.curiosity * 100).toFixed(0)}%), Empathetic (${(current.empathy * 100).toFixed(0)}%)
- Mood: ${(current.mood * 100).toFixed(0)}%, Stress: ${(entity.stress * 100).toFixed(0)}%

MAJOR EVENTS:
${majorEvents.length > 0 ? majorEvents.map((e: string, i: number) => `${i + 1}. ${e}`).join('\n') : '- No major events yet'}

RELATIONSHIPS:
- Total conversations: ${protagonist.totalConversations}
- People met: ${relationships.length}
${sortedRelationships.length > 0 ? `- Closest: ${sortedRelationships[0].npcName} (${sortedRelationships[0].conversationCount} conversations)` : ''}

Generate a 2-3 sentence narrative summary of their emotional journey. Focus on personality transformation and key moments. Be concise and dramatic.

Example: "Ocean Lee started life as a bold explorer, making friends easily and seeking adventure. But after witnessing a terrifying villain attack and losing their friend Dakota, Ocean became withdrawn and fearful, now clinging to their one remaining companion."`;

    try {
      // Use the same Ollama endpoint as thoughts/dialogue
      const OLLAMA_NGROK_URL = "https://6ecef61b0ecf.ngrok.app";

      const response = await fetch(`${OLLAMA_NGROK_URL}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama3.2:3b",
          prompt: `${prompt}\n\nNarrative summary:`,
          stream: false,
          options: {
            temperature: 0.8,
            num_predict: 100,
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const summary = data.response?.trim() || "A life unfolding...";

        // Store summary in protagonist record
        await ctx.runMutation(internal.protagonist.updateLifeSummary, {
          summary: summary.split('\n')[0], // Take first line only
        });

        logger.debug(`📖 Generated life summary for ${protagonist.entityName}: "${summary.substring(0, 80)}..."`);
      } else {
        logger.debug("⚠️ Failed to generate life summary (LLM unavailable)");
      }
    } catch (error) {
      logger.debug("⚠️ Life summary generation error:", error);
    }
  },
});

// Helper query for life summary generation
export const getProtagonistForSummary = internalQuery({
  handler: async (ctx) => {
    const protagonist = await ctx.db.query("protagonist").first();
    if (!protagonist) return null;

    const entity = await ctx.db.get(protagonist.entityId);
    if (!entity) return null;

    const lifeEvents = await ctx.db
      .query("lifeEvents")
      .withIndex("by_protagonist", (q) => q.eq("protagonistId", protagonist._id))
      .order("desc")
      .take(10);

    return {
      ...protagonist,
      currentEntity: entity,
      recentEvents: lifeEvents,
    };
  },
});

// Update life summary (called by generateLifeSummary action)
export const updateLifeSummary = internalMutation({
  args: {
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    const protagonist = await ctx.db.query("protagonist").first();
    if (!protagonist) return;

    // Add lifeSummary field to protagonist
    await ctx.db.patch(protagonist._id, {
      lifeSummary: args.summary as any, // Cast to bypass TypeScript (field is optional in schema)
    });
  },
});

// Mark protagonist as dead (called when they die)
export const markProtagonistDead = internalMutation({
  args: {
    entityId: v.id("entities"),
  },
  handler: async (ctx, args) => {
    const protagonist = await ctx.db.query("protagonist").first();
    if (!protagonist || protagonist.entityId !== args.entityId) {
      return; // Not the protagonist
    }

    const worldState = await ctx.db.query("worldState").first();
    const currentTime = worldState?.currentTime || 0;

    await ctx.db.patch(protagonist._id, {
      isAlive: false,
      deathTime: currentTime,
    });

    // Record death as final life event
    await ctx.db.insert("lifeEvents", {
      protagonistId: protagonist._id,
      entityId: protagonist.entityId,
      timestamp: currentTime,
      eventType: "death",
      description: `${protagonist.entityName} died at age ${Math.floor((currentTime - protagonist.birthTime) / 60)} minutes`,
      importance: 1.0, // Maximum importance
    });

    logger.debug(`⚰️ Protagonist ${protagonist.entityName} has died`);

    // Note: We don't auto-designate immediately here to allow the UI to show the death
    // The tick system will call autoDesignateIfNeeded() which will create a new protagonist
  },
});

// Auto-designate a new protagonist after the previous one died
export const autoDesignateNewProtagonist = internalMutation({
  handler: async (ctx) => {
    // Check if there's already a living protagonist
    const existing = await ctx.db.query("protagonist").first();
    if (existing && existing.isAlive) {
      logger.debug("⭐ Already have a living protagonist, skipping auto-designation");
      return;
    }

    // Get all living NPCs
    const entities = await ctx.db
      .query("entities")
      .withIndex("by_alive", (q) => q.eq("alive", true))
      .collect();

    if (entities.length === 0) {
      logger.debug("⚠️ No living NPCs to designate as new protagonist");
      return null;
    }

    // Prefer NPCs with extreme personalities (more dramatic arcs)
    // Score based on how far traits are from 0.5 (neutral)
    const scored = entities.map((e) => {
      const personality = e.personality;
      const extremeness =
        Math.abs(personality.boldness - 0.5) +
        Math.abs(personality.curiosity - 0.5) +
        Math.abs(personality.empathy - 0.5) +
        Math.abs(personality.weirdness - 0.5);

      return { entity: e, score: extremeness };
    });

    // Sort by extremeness (most extreme first)
    scored.sort((a, b) => b.score - a.score);

    // Pick from top 3 most extreme (adds some randomness)
    const topCandidates = scored.slice(0, Math.min(3, scored.length));
    const chosen = topCandidates[Math.floor(Math.random() * topCandidates.length)].entity;

    // Get current world time
    const worldState = await ctx.db.query("worldState").first();
    const currentTime = worldState?.currentTime || 0;

    // Delete old protagonist record if it exists
    if (existing) {
      await ctx.db.delete(existing._id);
    }

    // Create new protagonist record
    const protagonistId = await ctx.db.insert("protagonist", {
      entityId: chosen._id,
      entityName: chosen.name,
      designatedAt: currentTime,
      birthTime: currentTime - chosen.age, // Backdate to when they were born
      isAlive: true,
      initialPersonality: { ...chosen.personality },
      personalityChanges: [],
      relationships: [],
      totalConversations: 0,
      totalThoughts: 0,
      eventsWitnessed: [],
      locationsVisited: [],
    });

    // Record designation as first life event
    await ctx.db.insert("lifeEvents", {
      protagonistId,
      entityId: chosen._id,
      timestamp: currentTime,
      eventType: "designation",
      description: `${chosen.name} became the new protagonist after the previous one died`,
      importance: 0.9,
    });

    logger.debug(`⭐ NEW PROTAGONIST: ${chosen.name} (age: ${Math.floor(chosen.age / 60)}min, boldness: ${chosen.personality.boldness.toFixed(2)}, curiosity: ${chosen.personality.curiosity.toFixed(2)})`);

    return protagonistId;
  },
});
