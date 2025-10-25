// The heartbeat functions that make the world alive
// These are called by cron jobs to update NPCs, spawn new ones, and handle death
import { v } from "convex/values";
import { internalMutation, internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { generateThought, generateDialogue } from "./ai";
import { LOCATIONS, findLocationAtPoint } from "./locations";
import { generateGodEvent, calculateEventProbability } from "./godEvents";
import {
  calculateDespair,
  calculateAggression,
  processTrauma,
  checkMentalBreakdown,
  shouldAttemptSuicide,
  shouldAttemptMurder,
  addTraumaMemory,
} from "./darkDrives";
import {
  decideAction,
  generateTargetFromAction,
  applyEmotionalContagion,
  checkFoodCompetition,
  type UtilityAction,
} from "./drives";
import { logger } from "./logger";

// WORLD TICK - Main simulation loop
// Updates NPC positions, advances time, and makes the world feel alive
export const worldTick = internalMutation({
  handler: async (ctx) => {
    logger.tick("World tick running");

    // Advance simulation time by 1 minute
    let worldState = await ctx.db.query("worldState").first();
    const now = Date.now();

    // Initialize world state if it doesn't exist
    if (!worldState) {
      logger.info("Initializing world state");
      const worldStateId = await ctx.db.insert("worldState", {
        currentTime: 0,
        population: 0,
        totalBirths: 0,
        totalDeaths: 0,
        totalThoughts: 0,
        lastTickTime: now,
        socioEconomic: {
          prosperity: 0.5,
          stability: 0.7,
          happiness: 0.6,
          tension: 0.2,
          scarcity: 0.3,
        },
      });
      worldState = await ctx.db.get(worldStateId);
      logger.info("World state initialized");
    }

    // Initialize fields grid if it doesn't exist (one-time setup)
    const fieldsExist = await ctx.db.query("fields").first();
    if (!fieldsExist) {
      logger.info("Initializing spatial memory grid");
      await ctx.scheduler.runAfter(0, internal.fields.initializeFields);
      logger.debug("Fields initialization scheduled");
    }

    const previousTick = worldState?.lastTickTime;
    const dtSeconds = previousTick
      ? Math.min(15, Math.max(0.1, (now - previousTick) / 1000))
      : 3; // Fallback to cron interval if no history
    const currentTime = worldState ? worldState.currentTime + 1 : 0;

    if (worldState) {
      await ctx.db.patch(worldState._id, {
        currentTime,
        lastTickTime: now,
      });
    }

    // Calculate socio-economic metrics after updating entities
    await ctx.scheduler.runAfter(0, internal.worldState.calculateSocioEconomics);

    // Clean up expired events
    const activeEvents = await ctx.db
      .query("events")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
    for (const event of activeEvents) {
      if (event.endTime <= currentTime) {
        await ctx.db.patch(event._id, { active: false });
        logger.event(`Event ended: ${event.description}`);
      }
    }

    // Get all living NPCs
    const entities = await ctx.db
      .query("entities")
      .withIndex("by_alive", (q) => q.eq("alive", true))
      .collect();

    logger.debug(`Updating ${entities.length} living NPCs`);

    // Get active conversations to prevent NPCs from moving while talking
    const activeConversations = await ctx.db
      .query("conversations")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();

    const npcsInConversation = new Set();
    for (const conv of activeConversations) {
      npcsInConversation.add(conv.participant1Id);
      npcsInConversation.add(conv.participant2Id);
    }

    // ============================================================
    // FETCH PHYSICS CONFIG - Load runtime-tunable parameters
    // ============================================================
    const physicsParams = await ctx.runQuery(internal.physicsConfig.getPhysicsParamsWithCache);
    logger.debug(`Loaded physics config:`, {
      energyDecayMoving: physicsParams["energy-decay-moving"],
      socialDecay: physicsParams["social-decay"],
      heatDiffusion: physicsParams["heat-diffusion"]
    });

    // ============================================================
    // FETCH FIELD CACHE - For utility-based decision making
    // ============================================================
    const fieldCache = await ctx.db.query("fields").collect();
    logger.debug(`Loaded ${fieldCache.length} field cells for utility calculations`);

    // Update each NPC's movement (UTILITY-DRIVEN)
    for (const entity of entities) {
      const updates: Record<string, any> = {
        age: entity.age + 1,
      };

      // Skip movement updates for NPCs in active conversations
      if (npcsInConversation.has(entity._id)) {
        logger.conversation(`${entity.name} is in conversation - pausing movement`);
        await ctx.db.patch(entity._id, updates);
        continue;
      }

      // Assign new targets every 10-30 simulation minutes (time-based, not distance-based)
      const lastTargetChange = entity.lastTargetChange ?? 0;
      const timeSinceLastChange = currentTime - lastTargetChange;
      const changeInterval = 10 + Math.random() * 20; // Random interval between 10-30 minutes

      let targetX = entity.targetX;
      let targetY = entity.targetY;
      let chosenAction: UtilityAction | null = null;

      if (timeSinceLastChange >= changeInterval) {
        // ============================================================
        // UTILITY-BASED DECISION MAKING (Replaces pickNewTarget)
        // ============================================================
        // NPCs now choose actions based on internal drives + environment
        chosenAction = decideAction(entity, entities, fieldCache, currentTime);
        const newTarget = generateTargetFromAction(chosenAction, entity, entities, fieldCache);

        targetX = newTarget.x;
        targetY = newTarget.y;
        updates.targetX = targetX;
        updates.targetY = targetY;
        updates.lastTargetChange = currentTime;
        updates.lastAction = chosenAction; // Store action for debugging/visualization

        // Check for food competition and raise local heat if crowded
        const competitionHeat = checkFoodCompetition(entity, entities, chosenAction);
        if (competitionHeat > 0) {
          // Schedule heat field update (async, non-blocking)
          await ctx.scheduler.runAfter(0, internal.fields.modifyField, {
            x: entity.x,
            y: entity.y,
            type: "heat",
            delta: competitionHeat,
            radius: 50,
          });
          logger.debug(
            `Food competition at (${entity.x.toFixed(0)}, ${entity.y.toFixed(0)}) - heat +${competitionHeat.toFixed(3)}`
          );
        }

        logger.debug(`${entity.name} chose ${chosenAction} (target: ${targetX.toFixed(0)}, ${targetY.toFixed(0)})`);
      }

      // Move toward target while respecting speed and tick delta
      const dx = targetX - entity.x;
      const dy = targetY - entity.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance >= 1) {
        const maxStep = entity.speed * dtSeconds;
        if (maxStep > 0) {
          const step = Math.min(distance, maxStep);
          const ratio = step / distance;
          updates.x = entity.x + dx * ratio;
          updates.y = entity.y + dy * ratio;
        }
      }

      // Food consumption when at high-food location
      if (chosenAction === "SEEK_FOOD" && distance < 30) {
        // NPC is near food source, restore energy
        const currentEnergy = entity.energy ?? 0.7;
        const energyRestored = 0.15; // Restore 15% energy per tick when eating
        updates.energy = Math.min(1.0, currentEnergy + energyRestored);

        // Consume food from field (reduce food density)
        await ctx.scheduler.runAfter(0, internal.fields.modifyField, {
          x: entity.x,
          y: entity.y,
          type: "food",
          delta: -0.05, // Reduce food density by 5%
          radius: 30,
        });

        logger.debug(`${entity.name} is eating (energy: ${currentEnergy.toFixed(2)} → ${updates.energy.toFixed(2)})`);
      }

      // Church visit rewards - spiritual healing when at church
      if (chosenAction === "SEEK_FAITH" && distance < 40) {
        // NPC is at church, provide spiritual comfort
        const currentStress = entity.stress ?? 0;
        const currentDespair = entity.despair ?? 0;
        const currentMood = entity.personality?.mood ?? 0.5;

        // Reduce stress and despair, increase mood
        updates.stress = Math.max(0, currentStress - 0.1);
        updates.despair = Math.max(0, currentDespair - 0.15);
        if (entity.personality) {
          updates.personality = {
            ...entity.personality,
            mood: Math.min(1.0, currentMood + 0.1),
          };
        }

        logger.debug(`${entity.name} found peace at church (stress: ${currentStress.toFixed(2)} → ${updates.stress.toFixed(2)}, despair: ${currentDespair.toFixed(2)} → ${updates.despair.toFixed(2)})`);
      }

      await ctx.db.patch(entity._id, updates);
    }

    // ============================================================
    // DARK PSYCHOLOGY PROCESSING - Despair, aggression, trauma
    // ============================================================
    logger.debug("Processing dark psychology for NPCs");

    // Re-fetch entities to get updated positions
    const updatedEntities = await ctx.db
      .query("entities")
      .withIndex("by_alive", (q) => q.eq("alive", true))
      .collect();

    for (const entity of updatedEntities) {
      // Initialize new fields if they don't exist (migration)
      let energy = entity.energy ?? 0.7;
      let social = entity.social ?? 0.5;
      let safety = entity.safety ?? 0.6;

      // ============================================================
      // METABOLIC DECAY - Drives drain over time
      // ============================================================
      // Energy drains faster when moving, slower when stationary
      const distanceMoved = Math.sqrt(
        Math.pow(entity.x - (entity.targetX || entity.x), 2) +
        Math.pow(entity.y - (entity.targetY || entity.y), 2)
      );
      const isMoving = distanceMoved > 5;
      const energyDecay = isMoving
        ? physicsParams["energy-decay-moving"]
        : physicsParams["energy-decay-still"] || 0.005;
      energy = Math.max(0, energy - energyDecay);

      // Social drains naturally (loneliness creeps in)
      const socialDecay = physicsParams["social-decay"] || 0.003;
      social = Math.max(0, social - socialDecay);

      // Safety decays in high-heat areas (danger reduces sense of security)
      // We'll read heat field after this loop when we have field cache

      // Mood updates based on needs satisfaction
      const currentMood = entity.personality.mood ?? 0.5;
      const moodFromEnergy = energy > 0.4 ? 0.05 : -0.05; // Well-fed = happy
      const moodFromSocial = social > 0.3 ? 0.03 : -0.03; // Connected = happy
      const moodFromStress = entity.stress > 0.6 ? -0.04 : 0.02; // Stressed = sad
      const newMood = Math.max(0, Math.min(1, currentMood + moodFromEnergy + moodFromSocial + moodFromStress));

      // Update entity with new drive values
      await ctx.db.patch(entity._id, {
        energy,
        social,
        safety, // Will be updated later based on heat
        personality: {
          ...entity.personality,
          mood: newMood,
        },
      });

      // Process trauma and calculate mental breakpoint
      const mentalBreakpoint = processTrauma(entity, currentTime);

      // Calculate psychological states (with runtime physics params)
      const despair = calculateDespair(entity, currentTime, physicsParams);
      const aggression = calculateAggression(entity, currentTime, physicsParams);

      // Check for mental breakdown (personality shifts)
      const breakdown = checkMentalBreakdown({ ...entity, mentalBreakpoint });
      if (breakdown && Math.random() < 0.02) {
        // 2% chance per tick when above threshold
        await ctx.db.patch(entity._id, {
          personality: {
            ...entity.personality,
            ...breakdown,
          },
          mentalBreakpoint,
        });
        logger.debug(
          `🧠 ${entity.name} mental breakdown - empathy: ${breakdown.empathy.toFixed(2)}, weirdness: ${breakdown.weirdness.toFixed(2)}`
        );
      }

      // SUICIDE CHECK (very rare but emergent)
      if (shouldAttemptSuicide(despair, physicsParams)) {
        // NPC takes their own life
        await ctx.db.patch(entity._id, {
          alive: false,
          causeOfDeath: "suicide",
          hasSuicideAttempt: true,
        });

        // Update world stats
        if (worldState) {
          await ctx.db.patch(worldState._id, {
            population: worldState.population - 1,
            totalDeaths: worldState.totalDeaths + 1,
          });
        }

        // Find witnesses (NPCs within 100px)
        const witnesses = updatedEntities.filter((other) => {
          if (other._id === entity._id) return false;
          const dist = Math.sqrt(
            Math.pow(other.x - entity.x, 2) + Math.pow(other.y - entity.y, 2)
          );
          return dist < 100;
        });

        // Traumatize witnesses
        for (const witness of witnesses) {
          const traumaMemories = addTraumaMemory(witness, {
            type: "witnessed_suicide",
            timestamp: currentTime,
            severity: 0.9,
          });
          await ctx.db.patch(witness._id, { traumaMemories });
        }

        logger.debug(
          `💀 ${entity.name} died by suicide (despair: ${despair.toFixed(2)}, ${witnesses.length} witnesses traumatized)`
        );
        continue; // Skip rest of processing for this entity
      }

      // VIOLENCE CHECK (even rarer, requires target)
      const nearbyVictims = updatedEntities.filter((other) => {
        if (other._id === entity._id) return false;
        if (!other.alive) return false;
        const dist = Math.sqrt(
          Math.pow(other.x - entity.x, 2) + Math.pow(other.y - entity.y, 2)
        );
        return dist < 50;
      });

      if (shouldAttemptMurder(aggression, nearbyVictims.length > 0, physicsParams)) {
        // Target weakest nearby NPC
        const victim = nearbyVictims.sort((a, b) => a.health - b.health)[0];

        if (victim) {
          // Murder occurs
          await ctx.db.patch(victim._id, {
            alive: false,
            causeOfDeath: "murder",
            killedBy: entity._id,
          });

          await ctx.db.patch(entity._id, {
            hasKilled: true,
            stress: Math.min(1.0, entity.stress + 0.4), // Guilt/adrenaline spike
          });

          // Update world stats
          if (worldState) {
            await ctx.db.patch(worldState._id, {
              population: worldState.population - 1,
              totalDeaths: worldState.totalDeaths + 1,
            });
          }

          // Find all witnesses (including killer)
          const witnesses = updatedEntities.filter((other) => {
            const dist = Math.sqrt(
              Math.pow(other.x - entity.x, 2) + Math.pow(other.y - entity.y, 2)
            );
            return dist < 100;
          });

          // Traumatize all witnesses
          for (const witness of witnesses) {
            const severity = witness._id === entity._id ? 0.7 : 0.95; // Killer traumatized too
            const traumaMemories = addTraumaMemory(witness, {
              type: witness._id === entity._id ? "committed_murder" : "witnessed_murder",
              timestamp: currentTime,
              severity,
            });
            await ctx.db.patch(witness._id, { traumaMemories });
          }

          logger.debug(
            `🔪 ${entity.name} killed ${victim.name} (aggression: ${aggression.toFixed(2)}, ${witnesses.length} witnesses traumatized)`
          );
        }
      }

      // Update psychological state (always update even if no dark action)
      await ctx.db.patch(entity._id, {
        energy,
        social,
        safety,
        despair,
        aggression,
        mentalBreakpoint,
      });
    }
  },
});

// GOD AGENT - Creates new NPCs and world events
export const godAgentTick = internalMutation({
  handler: async (ctx) => {
    logger.tick("God Agent tick running...");

    const worldState = await ctx.db.query("worldState").first();
    const currentPop = worldState?.population || 0;
    const maxPop = 15; // Keep population reasonable

    // Spawn new NPC if population is low
    if (currentPop < maxPop) {
      const shouldSpawn = Math.random() < 0.6; // 60% chance

      if (shouldSpawn) {
        // Get existing NPC names to ensure uniqueness
        const existingNPCs = await ctx.db
          .query("entities")
          .filter((q) => q.eq(q.field("alive"), true))
          .collect();
        const existingNames = new Set(existingNPCs.map(npc => npc.name));

        const newNPC = generateRandomNPC(existingNames);

        const id = await ctx.db.insert("entities", newNPC);

        // Update world stats
        if (worldState) {
          await ctx.db.patch(worldState._id, {
            population: worldState.population + 1,
            totalBirths: worldState.totalBirths + 1,
          });
        }

        logger.spawn(`Spawned new NPC: ${newNPC.name} at (${newNPC.x}, ${newNPC.y})`);

        // PROTAGONIST: Auto-designate when population reaches 5
        if (currentPop + 1 >= 5) {
          await ctx.runMutation(internal.protagonist.autoDesignateProtagonist);
        }
      }
    }

    // Check if there's already a villain or hero
    const specialNPCs = await ctx.db
      .query("entities")
      .filter((q) =>
        q.and(
          q.eq(q.field("alive"), true),
          q.or(
            q.eq(q.field("type"), "villain"),
            q.eq(q.field("type"), "hero")
          )
        )
      )
      .collect();

    const hasVillain = specialNPCs.some((npc) => npc.type === "villain");
    const hasHero = specialNPCs.some((npc) => npc.type === "hero");

    // 15% chance to spawn a villain (if none exists)
    if (!hasVillain && Math.random() < 0.15) {
      const villain = spawnVillain();
      await ctx.db.insert("entities", villain);

      if (worldState) {
        await ctx.db.patch(worldState._id, {
          population: worldState.population + 1,
          totalBirths: worldState.totalBirths + 1,
        });
      }

      // Add trauma field where villain appears (dark presence)
      await ctx.scheduler.runAfter(0, internal.fields.modifyField, {
        x: villain.x,
        y: villain.y,
        type: "trauma",
        delta: 0.8,
        radius: 100,
      });

      logger.spawn(`Villain spawned: ${villain.name} at (${villain.x.toFixed(0)}, ${villain.y.toFixed(0)})`);
    }

    // 20% chance to spawn a hero (especially if villain exists)
    const heroChance = hasVillain ? 0.4 : 0.1; // Higher chance if villain present
    if (!hasHero && Math.random() < heroChance) {
      const hero = spawnHero();
      await ctx.db.insert("entities", hero);

      if (worldState) {
        await ctx.db.patch(worldState._id, {
          population: worldState.population + 1,
          totalBirths: worldState.totalBirths + 1,
        });
      }

      logger.spawn(`Hero spawned: ${hero.name} at (${hero.x.toFixed(0)}, ${hero.y.toFixed(0)})`);
    }

    // NEW: LLM-driven emergent events at locations
    // Check each location for potential events using natural algorithm
    await ctx.scheduler.runAfter(0, internal.tick.checkForGodEvents);

    // PROTAGONIST SUCCESSION: Check if we need a new protagonist
    const protagonist = await ctx.db.query("protagonist").first();
    const currentTime = worldState?.currentTime || 0;

    if (protagonist) {
      if (!protagonist.isAlive) {
        // Protagonist is dead, check if enough time has passed (give 2 seconds for UI)
        const timeSinceDeath = currentTime - (protagonist.deathTime || 0);
        logger.debug(`⏱️ Dead protagonist: ${protagonist.entityName}, time since death: ${timeSinceDeath}s (need 2s)`);

        if (timeSinceDeath >= 2) {
          logger.debug("⭐ Dead protagonist detected, designating new one...");

          // Inline successor designation logic to avoid API regeneration issues
          const livingNPCs = await ctx.db
            .query("entities")
            .withIndex("by_alive", (q) => q.eq("alive", true))
            .collect();

          if (livingNPCs.length > 0) {
            // Pick NPC with most extreme personality
            const scored = livingNPCs.map((e) => {
              const p = e.personality;
              const extremeness = Math.abs(p.boldness - 0.5) + Math.abs(p.curiosity - 0.5) +
                                Math.abs(p.empathy - 0.5) + Math.abs(p.weirdness - 0.5);
              return { entity: e, score: extremeness };
            });
            scored.sort((a, b) => b.score - a.score);
            const chosen = scored[Math.floor(Math.random() * Math.min(3, scored.length))].entity;

            // Delete old protagonist and create new one
            await ctx.db.delete(protagonist._id);
            const newProtagonistId = await ctx.db.insert("protagonist", {
              entityId: chosen._id,
              entityName: chosen.name,
              designatedAt: currentTime,
              birthTime: currentTime - chosen.age,
              isAlive: true,
              initialPersonality: { ...chosen.personality },
              personalityChanges: [],
              relationships: [],
              totalConversations: 0,
              totalThoughts: 0,
              eventsWitnessed: [],
              locationsVisited: [],
            });

            await ctx.db.insert("lifeEvents", {
              protagonistId: newProtagonistId,
              entityId: chosen._id,
              timestamp: currentTime,
              eventType: "designation",
              description: `${chosen.name} became the new protagonist after the previous one died`,
              importance: 0.9,
            });

            logger.debug(`⭐ NEW PROTAGONIST: ${chosen.name} (boldness: ${chosen.personality.boldness.toFixed(2)})`);
          }
        }
      }
    } else if (currentPop >= 5) {
      // No protagonist at all but enough NPCs - create one (fallback)
      logger.debug("⭐ No protagonist found with sufficient population, creating one...");
      await ctx.runMutation(internal.protagonist.autoDesignateProtagonist);
    }
  },
});

// REAPER - Handles NPC death based on various factors
export const reaperTick = internalMutation({
  handler: async (ctx) => {
    logger.tick("Reaper tick running...");

    const entities = await ctx.db
      .query("entities")
      .filter((q) => q.eq(q.field("alive"), true))
      .collect();

    // Get current active events
    const activeEvents = await ctx.db
      .query("events")
      .filter((q) => q.eq(q.field("active"), true))
      .collect();

    const dangerLevel = activeEvents.reduce((sum, evt) => sum + evt.dangerModifier, 0);
    const populationPressure = entities.length > 12 ? 0.1 : 0;

    // Check each NPC for death or despawn
    for (const entity of entities) {
      // Special NPCs (villains/heroes) despawn after a certain age instead of dying
      if (entity.type === "villain" || entity.type === "hero") {
        const despawnAge = entity.type === "villain" ? 300 : 400; // Villains leave after ~15 min, heroes after ~20 min

        if (entity.age > despawnAge) {
          await ctx.db.patch(entity._id, { alive: false });

          const worldState = await ctx.db.query("worldState").first();
          if (worldState) {
            await ctx.db.patch(worldState._id, {
              population: worldState.population - 1,
            });
          }

          const emoji = entity.type === "villain" ? "🌑" : "✨";
          logger.debug(`${emoji} ${entity.name} has vanished (age: ${entity.age})`);
          continue; // Skip normal death check
        }
      }

      // Calculate death probability for normal NPCs
      const baselineRisk = 0.001; // 0.1% base chance
      const ageRisk = entity.age > 1000 ? (entity.age - 1000) * 0.0001 : 0;
      const healthRisk = (1 - entity.health) * 0.01;
      const stressRisk = entity.stress * 0.005;

      const totalRisk = baselineRisk + ageRisk + healthRisk + stressRisk + dangerLevel + populationPressure;

      // Roll the dice
      if (Math.random() < totalRisk) {
        // NPC dies
        await ctx.db.patch(entity._id, { alive: false });

        // Update world stats
        const worldState = await ctx.db.query("worldState").first();
        if (worldState) {
          await ctx.db.patch(worldState._id, {
            population: worldState.population - 1,
            totalDeaths: worldState.totalDeaths + 1,
          });
        }

        // PROTAGONIST: Mark as dead if this is the protagonist
        await ctx.runMutation(internal.protagonist.markProtagonistDead, {
          entityId: entity._id,
        });

        logger.death(`${entity.name} has died (age: ${entity.age}, health: ${entity.health.toFixed(2)})`);
      }
    }
  },
});

// AI THINKER - Makes NPCs think and decide actions
// Runs every few seconds to give 3-5 NPCs new thoughts via Groq LLM
export const aiThinkTick = internalAction({
  handler: async (ctx) => {
    logger.tick("AI Thinker tick running (database-driven load balancer)...");

    // Get Groq API key from environment (will fallback to Ollama if USE_GROQ=false in ai.ts)
    const apiKey = process.env.GROQ_API_KEY || "ollama-mode";

    // Load GPU/model configurations from database
    const serverConfigs = await ctx.runQuery(internal.tick.getLoadBalancerConfig);

    // Get all living NPCs via query
    const entities = await ctx.runQuery(internal.tick.getEntitiesForAI);

    if (entities.length === 0) {
      logger.debug("No living NPCs to think");
      return;
    }

    // Pick 3-5 random NPCs to think (cost control)
    const thinkCount = Math.min(entities.length, 3 + Math.floor(Math.random() * 3));
    const shuffled = [...entities].sort(() => Math.random() - 0.5);
    const thinking = shuffled.slice(0, thinkCount);

    logger.debug(`🎯 ${thinkCount} NPCs thinking this tick...`);

    // Get active events via query
    const activeEvents = await ctx.runQuery(internal.tick.getActiveEventsForAI);

    // Make each selected NPC think
    for (const entity of thinking) {
      try {
        // Find nearby NPCs (within 100px)
        const nearbyNPCs = entities
          .filter((other: any) => {
            if (other._id === entity._id) return false;
            const dx = other.x - entity.x;
            const dy = other.y - entity.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            return distance < 100;
          })
          .map((other: any) => {
            const dx = other.x - entity.x;
            const dy = other.y - entity.y;
            return {
              name: other.name,
              distance: Math.sqrt(dx * dx + dy * dy),
            };
          })
          .sort((a: any, b: any) => a.distance - b.distance)
          .slice(0, 3); // Top 3 nearest

        // Retrieve recent meaningful memories
        const memories = await ctx.runQuery(internal.tick.getRecentMemoriesForAI, {
          entityId: entity._id,
          limit: 5,
        });

        // Build context (including dark psychology!)
        const context = {
          name: entity.name,
          location: { x: entity.x, y: entity.y },
          target: { x: entity.targetX, y: entity.targetY },
          nearbyNPCs,
          activeEvents: activeEvents.map((e: any) => ({
            type: e.type,
            description: e.description,
          })),
          health: entity.health,
          stress: entity.stress,
          age: entity.age,
          memories: memories.map((m: any) => m.text),
          // Dark psychology fields
          despair: entity.despair,
          aggression: entity.aggression,
          traumaMemories: entity.traumaMemories,
          mentalBreakpoint: entity.mentalBreakpoint,
        };

        // Generate thought using database-driven load balancer
        const thought = await generateThought(apiKey, entity.personality, context, serverConfigs);

        // Update entity with new thought via mutation
        await ctx.runMutation(internal.tick.updateEntityAction, {
          id: entity._id,
          action: thought,
          thought: thought,
        });

        // Calculate importance and save as memory
        const importance = calculateMemoryImportance(thought, {
          nearbyNPCs,
          activeEvents: activeEvents.map((e: any) => ({
            type: e.type,
            description: e.description,
          })),
          personality: entity.personality,
        });

        // Save memory
        const worldState = await ctx.runQuery(internal.tick.getWorldStateForAI);
        await ctx.runMutation(internal.tick.addMemoryForAI, {
          entityId: entity._id,
          entityName: entity.name,
          text: thought,
          timestamp: worldState?.currentTime || 0,
          importance,
        });

        logger.debug(`💭 ${entity.name}: "${thought}" (importance: ${importance.toFixed(2)})`);
      } catch (error) {
        logger.error(`Failed to generate thought for ${entity.name}:`, error);
      }
    }

    // Update world stats via mutation
    await ctx.runMutation(internal.tick.incrementThoughtsCounter, { count: thinkCount });
  },
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

// Pick a new target location based on personality
function pickNewTarget(entity: any): { x: number; y: number } {
  const worldWidth = 900;
  const worldHeight = 520;

  // Landmarks
  const cafe = { x: 640, y: 305 };
  const park = { x: 250, y: 180 };
  const school = { x: 730, y: 115 };

  const landmarks = [cafe, park, school];

  // High curiosity = more likely to wander randomly
  // High order = more likely to visit landmarks
  if (entity.personality.curiosity > entity.personality.order) {
    // Random wandering
    return {
      x: Math.random() * worldWidth,
      y: Math.random() * worldHeight,
    };
  } else {
    // Visit a landmark
    const target = landmarks[Math.floor(Math.random() * landmarks.length)];
    // Add some randomness around the landmark
    return {
      x: target.x + (Math.random() - 0.5) * 60,
      y: target.y + (Math.random() - 0.5) * 60,
    };
  }
}

// Generate a random NPC with personality
function generateRandomNPC(existingNames: Set<string>) {
  const firstNames = ["Alex", "Sam", "Jordan", "Morgan", "Casey", "Riley", "Avery", "Quinn", "Dakota", "Sage", "River", "Phoenix", "Rowan", "Sky", "Ocean"];
  const lastName = ["Smith", "Chen", "Garcia", "Kim", "Singh", "Johnson", "Lee", "Martinez", "Taylor", "Brown"];

  // Generate unique name (try up to 50 times)
  let name = "";
  let attempts = 0;
  do {
    name = `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastName[Math.floor(Math.random() * lastName.length)]}`;
    attempts++;
  } while (existingNames.has(name) && attempts < 50);

  // If we couldn't find a unique name, append a number
  if (existingNames.has(name)) {
    let counter = 2;
    const baseName = name;
    while (existingNames.has(name)) {
      name = `${baseName} ${counter}`;
      counter++;
    }
  }

  // 30% chance to spawn religious NPC
  const isReligious = Math.random() < 0.3;
  const npcType = isReligious ? "religious" : undefined;

  // Random spawn location (religious NPCs have 50% chance to spawn near church)
  let x, y;
  if (isReligious && Math.random() < 0.5) {
    // Spawn near church (x: 100-200, y: 330-430)
    x = 100 + Math.random() * 100;
    y = 330 + Math.random() * 100;
  } else {
    // Normal spawn location
    x = 100 + Math.random() * 700;
    y = 100 + Math.random() * 320;
  }

  // Random color (pastel tones)
  const hue = Math.floor(Math.random() * 360);
  const color = `0x${hslToHex(hue, 60, 70)}`;

  // Random personality (0-1 for each trait)
  // Religious NPCs have biased personality traits
  const personality = isReligious ? {
    curiosity: 0.3 + Math.random() * 0.2,    // 0.3-0.5 (not explorers, prefer routine)
    empathy: Math.random(),                   // Random empathy
    boldness: 0.2 + Math.random() * 0.2,     // 0.2-0.4 (timid, seek comfort)
    order: 0.7 + Math.random() * 0.2,        // 0.7-0.9 (structured, ritualistic)
    mood: 0.4 + Math.random() * 0.2,         // 0.4-0.6 (mild dissatisfaction drives seeking)
    weirdness: Math.random(),                 // Random weirdness
  } : {
    curiosity: Math.random(),
    empathy: Math.random(),
    boldness: Math.random(),
    order: Math.random(),
    mood: 0.5 + Math.random() * 0.3,         // Start with decent mood
    weirdness: Math.random(),
  };

  return {
    name,
    color,
    type: npcType,
    x,
    y,
    targetX: x,
    targetY: y,
    speed: 42,
    personality,
    alive: true,
    health: 1.0,
    stress: 0.0,
    age: 0,
    // Dark psychology fields (initialized)
    energy: 0.6 + Math.random() * 0.3, // Start 60-90% full
    social: 0.4 + Math.random() * 0.3, // Start 40-70% connected
    safety: 0.6 + Math.random() * 0.2, // Start 60-80% safe
    despair: 0.0,
    aggression: 0.0,
    mentalBreakpoint: 0.0,
    traumaMemories: [],
  };
}

// Spawn a villain NPC at the edge of the map
function spawnVillain() {
  const villainNames = ["The Shadow", "The Phantom", "The Reaper", "The Wraith", "Dark Hood"];
  const name = villainNames[Math.floor(Math.random() * villainNames.length)];

  // Spawn at random edge
  const edge = Math.floor(Math.random() * 4);
  let x, y;
  if (edge === 0) { x = 50; y = Math.random() * 520; }      // Left edge
  else if (edge === 1) { x = 850; y = Math.random() * 520; } // Right edge
  else if (edge === 2) { x = Math.random() * 900; y = 50; }  // Top edge
  else { x = Math.random() * 900; y = 470; }                 // Bottom edge

  return {
    name,
    type: "villain",
    color: "0x000000", // Black
    x,
    y,
    targetX: 450 + (Math.random() - 0.5) * 200, // Move toward center
    targetY: 260 + (Math.random() - 0.5) * 100,
    speed: 30, // Slower, menacing pace
    personality: {
      curiosity: 0.9,
      empathy: 0.1,    // Low empathy
      boldness: 0.95,  // Very bold/aggressive
      order: 0.2,      // Chaotic
      mood: 0.2,       // Dark mood
      weirdness: 0.9,  // Very unsettling
    },
    alive: true,
    health: 1.0,
    stress: 0.0,
    age: 0,
  };
}

// Spawn a hero NPC at a landmark
function spawnHero() {
  const heroNames = ["The Guardian", "The Protector", "The Sentinel", "The Champion", "Bright Knight"];
  const name = heroNames[Math.floor(Math.random() * heroNames.length)];

  // Spawn at café (central, safe location)
  const x = 640 + (Math.random() - 0.5) * 40;
  const y = 305 + (Math.random() - 0.5) * 30;

  return {
    name,
    type: "hero",
    color: "0xFFFFFF", // White
    x,
    y,
    targetX: x,
    targetY: y,
    speed: 50, // Faster, purposeful movement
    personality: {
      curiosity: 0.6,
      empathy: 0.95,   // Very empathetic
      boldness: 0.9,   // Brave
      order: 0.85,     // Lawful/orderly
      mood: 0.85,      // Positive
      weirdness: 0.2,  // Conventional hero
    },
    alive: true,
    health: 1.0,
    stress: 0.0,
    age: 0,
  };
}

// Trigger a random world event
async function triggerRandomEvent(ctx: any, currentTime: number) {
  const eventTypes = [
    { type: "festival", desc: "A music festival begins in the park!", stress: -0.2, danger: 0 },
    { type: "storm", desc: "A thunderstorm rolls in", stress: 0.15, danger: 0.05 },
    { type: "market", desc: "The weekly market opens", stress: -0.1, danger: 0 },
    { type: "siren", desc: "Emergency sirens wail in the distance", stress: 0.3, danger: 0.1 },
    { type: "villain", desc: "A mysterious hooded figure appears in the shadows!", stress: 0.4, danger: 0.15 },
    { type: "hero", desc: "A local hero helps someone in need at the café!", stress: -0.3, danger: -0.05 },
    { type: "celebration", desc: "Someone announces good news - celebration breaks out!", stress: -0.25, danger: 0 },
    { type: "accident", desc: "A small accident happens - people rush to help", stress: 0.2, danger: 0.05 },
  ];

  const event = eventTypes[Math.floor(Math.random() * eventTypes.length)];
  const duration = 10 + Math.floor(Math.random() * 20); // 10-30 minutes

  await ctx.db.insert("events", {
    type: event.type,
    description: event.desc,
    startTime: currentTime,
    endTime: currentTime + duration,
    active: true,
    stressModifier: event.stress,
    dangerModifier: event.danger,
  });

  logger.debug(`🎭 Event triggered: ${event.desc}`);
}

// Convert HSL to hex color
function hslToHex(h: number, s: number, l: number): string {
  l /= 100;
  const a = s * Math.min(l, 1 - l) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `${f(0)}${f(8)}${f(4)}`;
}

// Calculate importance score for a memory (0-1)
function calculateMemoryImportance(
  thought: string,
  context: {
    nearbyNPCs: Array<{ name: string; distance: number }>;
    activeEvents: Array<{ type: string; description: string }>;
    personality: any;
  }
): number {
  let importance = 0.3; // Base importance

  // Penalize mundane micro-actions (reduce importance)
  const boringActions = ["adjust", "shift", "smooth", "tug", "straighten", "readjust", "pause", "breathe"];
  const isMundane = boringActions.some(action => thought.toLowerCase().includes(action));
  if (isMundane) {
    importance = 0.2; // Below threshold, won't be used for LLM context
  }

  // Social interaction - mentions another NPC
  if (context.nearbyNPCs.length > 0) {
    const mentionsNPC = context.nearbyNPCs.some(npc =>
      thought.toLowerCase().includes(npc.name.toLowerCase().split(' ')[0])
    );
    if (mentionsNPC) importance += 0.3;
  }

  // World events are more memorable
  if (context.activeEvents.length > 0) {
    importance += 0.4;
  }

  // Empathetic NPCs remember social moments more
  if (context.personality.empathy > 0.7 && context.nearbyNPCs.length > 0) {
    importance += 0.1;
  }

  // Curious NPCs remember discoveries more
  if (context.personality.curiosity > 0.7 && (thought.includes("notice") || thought.includes("discover") || thought.includes("find"))) {
    importance += 0.1;
  }

  // Cap at 1.0
  return Math.min(importance, 1.0);
}

// Track recently conversed pairs to add variety (prevent same pair spamming)
const recentConversationPairs = new Map<string, number>(); // "id1-id2" -> timestamp
const CONVERSATION_COOLDOWN = 30; // 30 simulation minutes before same pair can talk again

// CONVERSATION MANAGER - Detects proximity and creates NPC-to-NPC dialogues
// Runs periodically to check for NPCs close enough to start conversations
export const conversationTick = internalAction({
  handler: async (ctx) => {
    logger.tick("Conversation tick running...");

    // Get all living NPCs
    const entities = await ctx.runQuery(internal.tick.getEntitiesForAI);

    if (entities.length < 2) {
      logger.debug("Not enough NPCs for conversations");
      return;
    }

    // Get active events for context
    const activeEvents = await ctx.runQuery(internal.tick.getActiveEventsForAI);
    const worldState = await ctx.runQuery(internal.tick.getWorldStateForAI);
    const currentTime = worldState?.currentTime || 0;

    // Track which NPCs are already in conversations
    const activeConversations = await ctx.runQuery(internal.tick.getActiveConversations);
    const npcInConversation = new Set();
    for (const conv of activeConversations) {
      npcInConversation.add(conv.participant1Id);
      npcInConversation.add(conv.participant2Id);
    }

    // Clean up old cooldowns
    for (const [pair, timestamp] of recentConversationPairs.entries()) {
      if (currentTime - timestamp > CONVERSATION_COOLDOWN) {
        recentConversationPairs.delete(pair);
      }
    }

    // Find pairs of NPCs within conversation distance
    // Increased from 50 to 80 to account for movement between checks
    const CONVERSATION_DISTANCE = 80;
    const potentialPairs: any[] = [];

    logger.debug(`🔍 Checking ${entities.length} NPCs for potential conversations...`);
    logger.debug(`📍 NPC positions:`, entities.map(e => `${e.name} (${e.x.toFixed(0)}, ${e.y.toFixed(0)})`).join(', '));

    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const npc1 = entities[i];
        const npc2 = entities[j];

        // Skip if either is already in a conversation
        if (npcInConversation.has(npc1._id) || npcInConversation.has(npc2._id)) {
          logger.debug(`⏭️ Skipping ${npc1.name} & ${npc2.name} - already in conversation`);
          continue;
        }

        // Check cooldown - prevent same pair from talking too soon
        const pairKey = [npc1._id, npc2._id].sort().join('-');
        if (recentConversationPairs.has(pairKey)) {
          const lastConversation = recentConversationPairs.get(pairKey)!;
          const timeSince = currentTime - lastConversation;
          logger.debug(`⏳ Skipping ${npc1.name} & ${npc2.name} - on cooldown (${timeSince}/${CONVERSATION_COOLDOWN} min)`);
          continue;
        }

        // Calculate distance
        const dx = npc2.x - npc1.x;
        const dy = npc2.y - npc1.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        logger.debug(`📏 ${npc1.name} (${npc1.x.toFixed(0)}, ${npc1.y.toFixed(0)}) ↔ ${npc2.name} (${npc2.x.toFixed(0)}, ${npc2.y.toFixed(0)}): ${distance.toFixed(0)}px apart`);

        if (distance < CONVERSATION_DISTANCE) {
          // Check personality compatibility (empathetic NPCs more likely to talk)
          const empathyFactor = (npc1.personality.empathy + npc2.personality.empathy) / 2;
          const curiosityFactor = (npc1.personality.curiosity + npc2.personality.curiosity) / 2;

          // Combined social factor (empathy + curiosity)
          const socialFactor = (empathyFactor * 0.6 + curiosityFactor * 0.4);

          // Apply multiplier - balanced threshold for natural conversation frequency
          // Higher threshold = more likely to pass the roll
          const threshold = Math.max(0.5, socialFactor * 0.9); // Min 50%, max 90% chance

          const roll = Math.random();

          logger.debug(`🎲 ${npc1.name} & ${npc2.name} social roll: ${roll.toFixed(2)} vs ${threshold.toFixed(2)} (empathy: ${empathyFactor.toFixed(2)}, curiosity: ${curiosityFactor.toFixed(2)}, socialFactor: ${socialFactor.toFixed(2)})`);

          // Random chance based on social compatibility
          if (roll < threshold) {
            potentialPairs.push({ npc1, npc2, distance });
            logger.debug(`✅ Added ${npc1.name} & ${npc2.name} to potential pairs`);
          } else {
            logger.debug(`❌ Failed social roll (${roll.toFixed(2)} >= ${threshold.toFixed(2)})`);
          }
        }
      }
    }

    logger.debug(`💬 Found ${potentialPairs.length} potential conversation pairs`);


    // Start conversations for potential pairs (limit to 2 new conversations per tick)
    const maxNewConversations = 2;
    const selectedPairs = potentialPairs
      .sort((a, b) => a.distance - b.distance) // Closer pairs first
      .slice(0, maxNewConversations);

    for (const { npc1, npc2 } of selectedPairs) {
      // First, generate dialogue using action (can use fetch)
      const dialogue = await ctx.runAction(internal.tick.generateDialogueForConversation, {
        npc1Id: npc1._id,
        npc2Id: npc2._id,
        npc1,
        npc2,
        activeEvents: activeEvents.map((e: any) => ({
          type: e.type,
          description: e.description,
        })),
        currentTime,
      });

      // Then save the conversation to DB using mutation
      const midX = (npc1.x + npc2.x) / 2;
      const midY = (npc1.y + npc2.y) / 2;

      await ctx.runMutation(internal.tick.startConversation, {
        npc1Id: npc1._id,
        npc2Id: npc2._id,
        npc1Name: npc1.name,
        npc2Name: npc2.name,
        dialogue,
        currentTime,
        midX,
        midY,
      });

      // Add to cooldown tracker to prevent immediate re-conversation
      const pairKey = [npc1._id, npc2._id].sort().join('-');
      recentConversationPairs.set(pairKey, currentTime);
      logger.debug(`⏳ Added cooldown for ${npc1.name} & ${npc2.name} (30 min)`);
    }

    // Progress existing conversations (add new dialogue lines)
    await ctx.runMutation(internal.tick.progressConversations, {
      activeEvents: activeEvents.map((e: any) => ({
        type: e.type,
        description: e.description,
      })),
      currentTime,
    });
  },
});

// Query to get active conversations
export const getActiveConversations = internalQuery({
  handler: async (ctx) => {
    return await ctx.db
      .query("conversations")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
  },
});

// Helper queries for internal actions
export const getEntitiesForAI = internalQuery({
  handler: async (ctx) => {
    return await ctx.db
      .query("entities")
      .filter((q) => q.eq(q.field("alive"), true))
      .collect();
  },
});

export const getActiveEventsForAI = internalQuery({
  handler: async (ctx) => {
    return await ctx.db
      .query("events")
      .filter((q) => q.eq(q.field("active"), true))
      .collect();
  },
});

export const getLoadBalancerConfig = internalQuery({
  handler: async (ctx) => {
    // Get enabled configurations sorted by priority
    const configs = await ctx.db
      .query("ollamaConfig")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect();

    // Sort by priority and convert to ServerConfig format
    return configs
      .sort((a, b) => a.priority - b.priority)
      .map(config => ({
        url: config.url,
        name: config.name,
        type: config.type,
        weight: config.weight,
        model: config.model,
      }));
  },
});

export const getWorldStateForAI = internalQuery({
  handler: async (ctx) => {
    return await ctx.db.query("worldState").first();
  },
});

export const getRecentMemoriesForAI = internalQuery({
  args: { entityId: v.id("entities"), limit: v.number() },
  handler: async (ctx, { entityId, limit }) => {
    // Get last 20 memories
    const recentMemories = await ctx.db
      .query("memories")
      .withIndex("by_entity", (q) => q.eq("entityId", entityId))
      .order("desc")
      .take(20);

    // Filter for meaningful memories (importance > 0.5), sort by recency, take top N
    return recentMemories
      .filter((m) => m.importance > 0.5)
      .slice(0, limit);
  },
});

export const addMemoryForAI = internalMutation({
  args: {
    entityId: v.id("entities"),
    entityName: v.string(),
    text: v.string(),
    timestamp: v.number(),
    importance: v.number(),
    eventId: v.optional(v.id("events")),
    heardFrom: v.optional(v.string()),
    distortionLevel: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("memories", args);
  },
});

export const updateEntityAction = internalMutation({
  args: {
    id: v.id("entities"),
    action: v.string(),
    thought: v.string(),
  },
  handler: async (ctx, { id, action, thought }) => {
    await ctx.db.patch(id, {
      lastAction: action,
      lastThought: thought,
    });
  },
});

export const incrementThoughtsCounter = internalMutation({
  args: { count: v.number() },
  handler: async (ctx, { count }) => {
    const state = await ctx.db.query("worldState").first();
    if (!state) return;
    await ctx.db.patch(state._id, {
      totalThoughts: state.totalThoughts + count,
    });
  },
});

// HELPER: Generate dialogue (action - can use fetch)
export const generateDialogueForConversation = internalAction({
  args: {
    npc1Id: v.id("entities"),
    npc2Id: v.id("entities"),
    npc1: v.any(),
    npc2: v.any(),
    activeEvents: v.array(v.object({
      type: v.string(),
      description: v.string(),
    })),
    currentTime: v.number(),
  },
  handler: async (ctx, { npc1Id, npc2Id, npc1, npc2, activeEvents, currentTime }) => {
    // Load GPU/model configurations from database
    const serverConfigs = await ctx.runQuery(internal.tick.getLoadBalancerConfig);
    const apiKey = process.env.GROQ_API_KEY || "ollama-mode";

    // Get recent memories for both NPCs
    const npc1Memories = await ctx.runQuery(internal.tick.getRecentMemoriesForAI, {
      entityId: npc1Id,
      limit: 5,
    });

    const npc2Memories = await ctx.runQuery(internal.tick.getRecentMemoriesForAI, {
      entityId: npc2Id,
      limit: 5,
    });

    // Generate dialogue using database-driven load balancer
    const dialogue = await generateDialogue(
      {
        name: npc1.name,
        personality: npc1.personality,
        memories: npc1Memories as any,
        despair: npc1.despair,
        aggression: npc1.aggression,
        traumaMemories: npc1.traumaMemories,
        energy: npc1.energy,
        social: npc1.social,
      },
      {
        name: npc2.name,
        personality: npc2.personality,
        memories: npc2Memories as any,
        despair: npc2.despair,
        aggression: npc2.aggression,
        traumaMemories: npc2.traumaMemories,
        energy: npc2.energy,
        social: npc2.social,
      },
      {
        activeEvents,
        location: { x: (npc1.x + npc2.x) / 2, y: (npc1.y + npc2.y) / 2 },
        worldTime: currentTime,
      },
      serverConfigs,
      apiKey
    );

    return dialogue;
  },
});

// Save a conversation to the database (called after dialogue generation)
export const startConversation = internalMutation({
  args: {
    npc1Id: v.id("entities"),
    npc2Id: v.id("entities"),
    npc1Name: v.string(),
    npc2Name: v.string(),
    dialogue: v.array(v.object({
      speaker: v.string(),
      text: v.string(),
    })),
    currentTime: v.number(),
    midX: v.number(),
    midY: v.number(),
  },
  handler: async (ctx, { npc1Id, npc2Id, npc1Name, npc2Name, dialogue, currentTime, midX, midY }) => {

    logger.debug(`💬 Saving conversation between ${npc1Name} and ${npc2Name} with ${dialogue.length} lines`);

    // Add timestamps to dialogue
    const timestampedDialogue = dialogue.map((line: any, index: number) => ({
      ...line,
      timestamp: currentTime + index,
    }));

    // Create conversation entry
    await ctx.db.insert("conversations", {
      participant1Id: npc1Id,
      participant2Id: npc2Id,
      participant1Name: npc1Name,
      participant2Name: npc2Name,
      dialogue: timestampedDialogue,
      startTime: currentTime,
      active: true,
      x: midX,
      y: midY,
    });

    // ============================================================
    // EMOTIONAL CONTAGION - Moods spread during conversations
    // ============================================================
    const npc1 = await ctx.db.get(npc1Id);
    const npc2 = await ctx.db.get(npc2Id);

    if (npc1 && npc2) {
      const contagion = applyEmotionalContagion(npc1, npc2);

      // Update both NPCs' moods
      await ctx.db.patch(npc1Id, {
        personality: {
          ...npc1.personality,
          mood: contagion.mood1,
        },
      });

      await ctx.db.patch(npc2Id, {
        personality: {
          ...npc2.personality,
          mood: contagion.mood2,
        },
      });

      // Increase social stat for both (conversation satisfies loneliness)
      const social1 = npc1.social ?? 0.5;
      const social2 = npc2.social ?? 0.5;
      await ctx.db.patch(npc1Id, { social: Math.min(1.0, social1 + 0.15) });
      await ctx.db.patch(npc2Id, { social: Math.min(1.0, social2 + 0.15) });

      logger.debug(
        `💞 Emotional contagion: ${npc1Name} mood ${npc1.personality.mood.toFixed(2)} → ${contagion.mood1.toFixed(2)}, ` +
        `${npc2Name} mood ${npc2.personality.mood.toFixed(2)} → ${contagion.mood2.toFixed(2)}`
      );
    }

    // Create memories for both NPCs about this conversation
    await ctx.db.insert("memories", {
      entityId: npc1Id,
      entityName: npc1Name,
      text: `Had a conversation with ${npc2Name}`,
      timestamp: currentTime,
      importance: 0.6, // Conversations are fairly important
    });

    await ctx.db.insert("memories", {
      entityId: npc2Id,
      entityName: npc2Name,
      text: `Had a conversation with ${npc1Name}`,
      timestamp: currentTime,
      importance: 0.6,
    });

    // PROTAGONIST: Track relationships
    await ctx.runMutation(internal.protagonist.trackRelationship, {
      otherNpcId: npc2Id,
      otherNpcName: npc2Name,
    });
    await ctx.runMutation(internal.protagonist.trackRelationship, {
      otherNpcId: npc1Id,
      otherNpcName: npc1Name,
    });

    logger.debug(`✅ Conversation saved with ${dialogue.length} lines`);
  },
});

// Progress conversations (add new lines over time, end when complete)
export const progressConversations = internalMutation({
  args: {
    currentTime: v.number(),
    activeEvents: v.array(v.object({
      type: v.string(),
      description: v.string(),
    })),
  },
  handler: async (ctx, { currentTime, activeEvents }) => {

    const activeConversations = await ctx.db
      .query("conversations")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();

    const CONVERSATION_DURATION = 10; // Conversations last 10 simulation minutes (~30 seconds real-time)
    const MAX_CONVERSATION_DISTANCE = 100; // NPCs must stay within 100px to continue talking

    for (const conv of activeConversations) {
      const conversationAge = currentTime - conv.startTime;

      // Get both participants
      const npc1 = await ctx.db.get(conv.participant1Id);
      const npc2 = await ctx.db.get(conv.participant2Id);

      // Check if NPCs are still alive and nearby
      if (!npc1 || !npc2 || !npc1.alive || !npc2.alive) {
        // End conversation if either NPC died
        await ctx.db.patch(conv._id, {
          active: false,
          endTime: currentTime,
        });
        logger.debug(`💬 Ended conversation (NPC died): ${conv.participant1Name} and ${conv.participant2Name}`);
        continue;
      }

      // Check distance between NPCs
      const dx = npc2.x - npc1.x;
      const dy = npc2.y - npc1.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > MAX_CONVERSATION_DISTANCE) {
        // End conversation if NPCs moved too far apart
        await ctx.db.patch(conv._id, {
          active: false,
          endTime: currentTime,
        });
        logger.debug(`💬 Ended conversation (too far apart: ${distance.toFixed(0)}px): ${conv.participant1Name} and ${conv.participant2Name}`);
        continue;
      }

      // End conversation if it's been too long
      if (conversationAge >= CONVERSATION_DURATION) {
        await ctx.db.patch(conv._id, {
          active: false,
          endTime: currentTime,
        });
        logger.debug(`💬 Ended conversation (time limit): ${conv.participant1Name} and ${conv.participant2Name}`);
      }
    }
  },
});

// ============================================================
// GOD EVENTS - Emergent, localized, LLM-driven events
// ============================================================

// Check each location for potential god events (natural algorithm)
export const checkForGodEvents = internalAction({
  handler: async (ctx) => {
    logger.debug("✨ Checking for god events...");

    // Get world state
    const worldState = await ctx.runQuery(internal.tick.getWorldStateForAI);
    if (!worldState || !worldState.socioEconomic) {
      logger.debug("No world state available");
      return;
    }

    // Get all living NPCs
    const entities = await ctx.runQuery(internal.tick.getEntitiesForAI);

    // Get recent events for context
    const recentEvents = await ctx.runQuery(internal.tick.getActiveEventsForAI);

    // Check each location for event generation
    for (const location of LOCATIONS) {
      // Find NPCs at this location
      const npcsAtLocation = entities.filter((npc: any) => {
        const distance = Math.sqrt(
          (npc.x - location.x) ** 2 + (npc.y - location.y) ** 2
        );
        return distance <= location.radius;
      });

      // Calculate event probability using natural algorithm
      const probability = calculateEventProbability(
        location,
        {
          socioEconomic: worldState.socioEconomic!,
          currentTime: worldState.currentTime,
          population: worldState.population,
        },
        npcsAtLocation.length
      );

      // Roll the dice
      if (Math.random() < probability) {
        logger.debug(`🎲 Event triggered at ${location.name} (probability: ${(probability * 100).toFixed(1)}%)`);

        // Generate event using LLM
        const eventData = await generateGodEvent({
          location,
          worldState: {
            socioEconomic: worldState.socioEconomic!,
            currentTime: worldState.currentTime,
            population: worldState.population,
          },
          recentEvents: recentEvents.map((e: any) => ({
            type: e.type,
            description: e.description,
          })),
          npcsAtLocation: npcsAtLocation.map((npc: any) => ({
            name: npc.name,
            personality: npc.personality,
          })),
        });

        if (eventData) {
          // Create the event with witnesses
          await ctx.runMutation(internal.tick.createGodEvent, {
            eventData,
            location,
            currentTime: worldState.currentTime,
            witnessIds: npcsAtLocation.map((npc: any) => npc._id),
          });
        }
      }
    }
  },
});

// Create a god event and assign initial witnesses
export const createGodEvent = internalMutation({
  args: {
    eventData: v.object({
      category: v.string(),
      description: v.string(),
      scope: v.string(),
      severity: v.number(),
      duration: v.number(),
      stressModifier: v.number(),
      dangerModifier: v.number(),
      affectedRadius: v.number(),
    }),
    location: v.object({
      name: v.string(),
      type: v.string(),
      x: v.number(),
      y: v.number(),
      radius: v.number(),
      description: v.optional(v.string()),
      eventModifiers: v.optional(v.any()),
    }),
    currentTime: v.number(),
    witnessIds: v.array(v.id("entities")),
  },
  handler: async (ctx, { eventData, location, currentTime, witnessIds }) => {

    // Insert event (all new fields are now present)
    const eventId = await ctx.db.insert("events", {
      type: eventData.category,
      description: eventData.description,
      startTime: currentTime,
      endTime: currentTime + eventData.duration,
      active: true,
      stressModifier: eventData.stressModifier,
      dangerModifier: eventData.dangerModifier,
      locationX: location.x,
      locationY: location.y,
      locationName: location.name,
      scope: eventData.scope,
      severity: eventData.severity,
      affectedRadius: eventData.affectedRadius,
      witnessIds: witnessIds,
    });

    logger.debug(`🎭 God event created: ${eventData.description} at ${location.name}`);
    logger.debug(`   Scope: ${eventData.scope}, Severity: ${eventData.severity.toFixed(2)}, Witnesses: ${witnessIds.length}`);

    // Create memories for witnesses (they directly experienced it!)
    for (const witnessId of witnessIds) {
      const witness: any = await ctx.db.get(witnessId);
      if (!witness || !witness.name) continue;

      await ctx.db.insert("memories", {
        entityId: witnessId,
        entityName: witness.name,
        text: `Witnessed: ${eventData.description}`,
        timestamp: currentTime,
        importance: 0.7 + eventData.severity * 0.3, // Important events are more memorable
        eventId: eventId,
        heardFrom: undefined, // Witnessed directly
        distortionLevel: 0.0, // No distortion - they saw it themselves!
      });
    }
  },
});
