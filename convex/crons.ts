// Scheduled tasks that run automatically to keep the world alive
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// WORLD TICK - The heartbeat of the simulation
// Runs every 3 seconds to update NPCs, advance time, and drive the world
crons.interval(
  "world tick",
  { seconds: 3 },  // Every 3 seconds
  internal.tick.worldTick,
);

// GOD AGENT - Creator and event master
// Runs every 2 minutes to spawn new NPCs and trigger world events
crons.interval(
  "god agent",
  { minutes: 2 },  // Every 2 minutes
  internal.tick.godAgentTick,
);

// REAPER - Death and lifecycle management
// Runs every 30 seconds to calculate mortality and remove dead NPCs
crons.interval(
  "reaper",
  { seconds: 30 },  // Every 30 seconds
  internal.tick.reaperTick,
);

// AI THINKER - NPCs think and make decisions
// Runs every 10 seconds to give 3-5 NPCs new AI-generated thoughts
// (Increased from 8s to prevent overlapping when using thinking model for God events)
crons.interval(
  "ai thinker",
  { seconds: 10 },  // Every 10 seconds (was 8s)
  internal.tick.aiThinkTick,
);

// CONVERSATION MANAGER - Proximity-based NPC dialogues
// Runs every 10 seconds to detect nearby NPCs and create conversations
// (Increased from 5s to prevent overlapping LLM calls)
crons.interval(
  "conversation manager",
  { seconds: 10 },  // Every 10 seconds (was 5s)
  internal.tick.conversationTick,
);

// PROTAGONIST LIFE SUMMARY - Generate AI narrative of protagonist's journey
// Runs every 5 minutes to create an evolving story
crons.interval(
  "protagonist summary",
  { seconds: 300 },  // Every 5 minutes
  internal.protagonist.generateLifeSummary,
);

// MEMORY MAINTENANCE - Automatic cleanup to prevent database bloat
// Runs every 10 minutes to trim old/low-importance memories and conversations
crons.interval(
  "memory maintenance",
  { minutes: 10 },  // Every 10 minutes
  internal.memoryMaintenance.memoryMaintenanceTick,
);

// FIELD UPDATE - Spatial memory grid (heat, food, trauma fields)
// Runs every 5 seconds to diffuse, evaporate, and regrow fields
crons.interval(
  "field update",
  { seconds: 5 },  // Every 5 seconds
  internal.fields.fieldUpdateTick,
);

export default crons;
