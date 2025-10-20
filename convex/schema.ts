// Database blueprint - defines what tables exist and what data they hold
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // NPCs table - all the characters in your world
  entities: defineTable({
    name: v.string(),                        // Character's name
    color: v.string(),                       // Display color (hex code)
    type: v.optional(v.string()),            // NPC type: "normal", "villain", "hero", "religious"
    x: v.number(),                           // Current X position
    y: v.number(),                           // Current Y position
    targetX: v.number(),                     // Where walking to (X)
    targetY: v.number(),                     // Where walking to (Y)
    speed: v.number(),                       // Movement speed
    personality: v.object({                  // Six traits defining behavior
      curiosity: v.number(),                 // Interest in new things (0-1)
      empathy: v.number(),                   // Care for others (0-1)
      boldness: v.number(),                  // Willingness to take risks (0-1)
      order: v.number(),                     // Organization level (0-1)
      mood: v.number(),                      // Current happiness (0-1)
      weirdness: v.number(),                 // Quirkiness (0-1)
    }),
    alive: v.boolean(),                      // Is character alive?
    health: v.number(),                      // Health (0-1)
    stress: v.number(),                      // Stress level (0-1)
    age: v.number(),                         // Age in simulation time
    lastAction: v.optional(v.string()),      // Current action
    lastThought: v.optional(v.string()),     // Current thought
    lastTargetChange: v.optional(v.number()), // Simulation minute when target last changed

    // SURVIVAL DRIVES (new emergent behavior system)
    energy: v.optional(v.number()),          // Hunger level (0-1, 1=full, 0=starving)
    social: v.optional(v.number()),          // Loneliness (0-1, 1=connected, 0=isolated)
    safety: v.optional(v.number()),          // Perceived safety (0-1, 1=safe, 0=danger)

    // DARK PSYCHOLOGICAL STATES
    despair: v.optional(v.number()),         // Suicidal ideation level (0-1)
    aggression: v.optional(v.number()),      // Homicidal tendency (0-1)
    mentalBreakpoint: v.optional(v.number()), // Cumulative trauma load (0-1)
    traumaMemories: v.optional(v.array(v.object({
      type: v.string(),                      // "witnessed_suicide", "witnessed_murder", "was_attacked", "attacked_someone"
      timestamp: v.number(),                 // When it happened
      severity: v.number(),                  // How traumatic (0-1)
    }))),

    // DARK ACTION TRACKING
    hasKilled: v.optional(v.boolean()),      // Has committed murder
    hasSuicideAttempt: v.optional(v.boolean()), // Has attempted suicide
    causeOfDeath: v.optional(v.string()),    // "suicide", "murder", "natural", "starvation"
    killedBy: v.optional(v.id("entities")),  // If murdered, who did it
  }).index("by_alive", ["alive"])            // Index to quickly find living NPCs
    .index("by_type", ["type"])              // Index to find special NPCs
    .index("by_despair", ["despair"])        // Index to find NPCs in crisis
    .index("by_aggression", ["aggression"]), // Index to find dangerous NPCs

  // Memories table - what NPCs remember (now tracks gossip chains!)
  memories: defineTable({
    entityId: v.id("entities"),              // Which NPC owns this memory
    entityName: v.string(),                  // NPC name for convenience
    text: v.string(),                        // The memory content
    timestamp: v.number(),                   // When it happened
    importance: v.number(),                  // How significant (0-1)
    eventId: v.optional(v.id("events")),     // If this memory is about an event
    heardFrom: v.optional(v.string()),       // Who told them (for gossip chains)
    distortionLevel: v.optional(v.number()), // How distorted (0=accurate, 1=completely wrong)
  }).index("by_entity", ["entityId"])        // Find all memories for one NPC
    .index("by_entity_time", ["entityId", "timestamp"]) // Find memories by NPC + time
    .index("by_event", ["eventId"]),         // Find all memories about a specific event

  // Events table - things happening in the world (now with localized awareness!)
  events: defineTable({
    type: v.string(),                        // Event category (LLM-generated, freeform)
    description: v.string(),                 // What's happening
    startTime: v.number(),                   // When it starts
    endTime: v.number(),                     // When it ends
    active: v.boolean(),                     // Currently happening?
    stressModifier: v.number(),              // Effect on NPC stress
    dangerModifier: v.number(),              // Danger level
    locationX: v.optional(v.number()),       // Where the event originated (X) - optional for migration
    locationY: v.optional(v.number()),       // Where the event originated (Y) - optional for migration
    locationName: v.optional(v.string()),    // Name of location (e.g., "Café", "Church")
    scope: v.optional(v.string()),           // "localized", "district", "citywide" - optional for migration
    severity: v.optional(v.number()),        // Event severity (0-1 scale) - optional for migration
    affectedRadius: v.optional(v.number()),  // Radius for initial awareness (pixels) - optional for migration
    witnessIds: v.optional(v.array(v.id("entities"))), // NPCs who directly witnessed it - optional for migration
  }).index("by_active", ["active"]),         // Find active events quickly

  // Scalar fields table - spatial memory grid (heat, food, trauma)
  // Grid size: 30x17 cells (900px / 30px = 30, 520px / 30px = 17)
  fields: defineTable({
    gridX: v.number(),                       // Grid cell X coordinate (0-29)
    gridY: v.number(),                       // Grid cell Y coordinate (0-16)
    type: v.string(),                        // "heat", "food", "trauma"
    value: v.number(),                       // Intensity (0-1)
  }).index("by_type", ["type"])              // Find all cells of a type
    .index("by_grid", ["gridX", "gridY"])    // Find cell by coordinates
    .index("by_type_grid", ["type", "gridX", "gridY"]), // Find specific cell+type

  // World state table - global simulation stats
  worldState: defineTable({
    currentTime: v.number(),                 // Current simulation time
    population: v.number(),                  // Living NPCs count
    totalBirths: v.number(),                 // All-time births
    totalDeaths: v.number(),                 // All-time deaths
    totalThoughts: v.number(),               // AI thoughts generated
    lastTickTime: v.number(),                // Last update timestamp
    socioEconomic: v.optional(v.object({     // Society-wide mood metrics
      prosperity: v.number(),                // Economic well-being (0-1)
      stability: v.number(),                 // Order vs chaos (0-1)
      happiness: v.number(),                 // Collective mood (0-1)
      tension: v.number(),                   // Stress/conflict level (0-1)
      scarcity: v.number(),                  // Resource pressure (0-1)
    })),
  }),

  // Conversations table - active NPC-to-NPC dialogues
  conversations: defineTable({
    participant1Id: v.id("entities"),        // First NPC in conversation
    participant2Id: v.id("entities"),        // Second NPC in conversation
    participant1Name: v.string(),            // First NPC's name
    participant2Name: v.string(),            // Second NPC's name
    dialogue: v.array(v.object({             // Dialogue exchanges
      speaker: v.string(),                   // Who's speaking (name)
      text: v.string(),                      // What they said
      timestamp: v.number(),                 // When they said it
    })),
    startTime: v.number(),                   // When conversation started
    endTime: v.optional(v.number()),         // When conversation ended
    active: v.boolean(),                     // Is conversation ongoing?
    x: v.number(),                           // Visual position X (midpoint)
    y: v.number(),                           // Visual position Y (midpoint)
  }).index("by_active", ["active"])          // Find active conversations quickly
    .index("by_participants", ["participant1Id", "participant2Id"]), // Check for existing conversations

  // Protagonist table - Designated subject character to track over time
  protagonist: defineTable({
    entityId: v.id("entities"),              // Which NPC is the protagonist
    entityName: v.string(),                  // Protagonist's name
    designatedAt: v.number(),                // When they became protagonist
    birthTime: v.number(),                   // When they spawned
    deathTime: v.optional(v.number()),       // When they died (if dead)
    isAlive: v.boolean(),                    // Current alive status
    // Snapshot stats at designation
    initialPersonality: v.object({
      curiosity: v.number(),
      empathy: v.number(),
      boldness: v.number(),
      order: v.number(),
      mood: v.number(),
      weirdness: v.number(),
    }),
    // Tracking changes over time
    personalityChanges: v.array(v.object({
      timestamp: v.number(),                 // When the change occurred
      trait: v.string(),                     // Which trait changed
      oldValue: v.number(),                  // Previous value
      newValue: v.number(),                  // New value
      trigger: v.optional(v.string()),       // What caused it (event, conversation, etc.)
    })),
    // Relationship tracking
    relationships: v.array(v.object({
      npcId: v.id("entities"),               // Other NPC
      npcName: v.string(),                   // Other NPC's name
      firstMet: v.number(),                  // When they first met
      conversationCount: v.number(),         // How many times they've talked
      lastInteraction: v.number(),           // Last time they interacted
      affinity: v.number(),                  // Relationship strength (-1 to 1)
    })),
    // Major life moments
    totalConversations: v.number(),          // Lifetime conversation count
    totalThoughts: v.number(),               // Lifetime thought count
    eventsWitnessed: v.array(v.id("events")), // Events they've seen
    locationsVisited: v.array(v.string()),   // Unique locations
    lifeSummary: v.optional(v.string()),     // LLM-generated narrative summary
  }),

  // Life events table - Major moments in protagonist's story
  lifeEvents: defineTable({
    protagonistId: v.id("protagonist"),      // Which protagonist this belongs to
    entityId: v.id("entities"),              // The protagonist NPC
    timestamp: v.number(),                   // When it happened
    eventType: v.string(),                   // Category: "birth", "conversation", "witness", "personality_shift", "death", "relationship", "achievement"
    description: v.string(),                 // Human-readable summary
    importance: v.number(),                  // How significant (0-1)
    // Optional context
    relatedNpcId: v.optional(v.id("entities")), // If involves another NPC
    relatedNpcName: v.optional(v.string()),  // Other NPC's name
    relatedEventId: v.optional(v.id("events")), // If about a world event
    emotionalImpact: v.optional(v.object({   // How it affected them
      moodChange: v.number(),                // Mood delta
      stressChange: v.number(),              // Stress delta
    })),
  }).index("by_protagonist", ["protagonistId"])
    .index("by_timestamp", ["protagonistId", "timestamp"])
    .index("by_importance", ["protagonistId", "importance"]),
});
