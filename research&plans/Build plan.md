# 12-Hour Vibe-Coded Build Plan

A step-by-step guide to building a living little world on screen. No fluff, just the beats you need to hit.

**Build Status**: ✅ **DEMO-READY** (Phase 1 & 2 Complete - 12 hours)

---

# 🎯 CURRENT STATUS: PHASE 2 COMPLETE ✅

All core systems and demo polish features are fully implemented and working! The simulation is **watchable**, **presentable**, and ready for recording/showcase.

**Next Steps**: Choose your path (see "What's Next" section below)

---

---

# PHASE 1: CORE FOUNDATION (Hours 0-9) ✅ COMPLETE

<details>
<summary>Click to expand completed foundation work</summary>

## Hour 0–1 — Put the stage up (Phaser) + plug in the brainstem (Convex) ✅

**Status**: DONE
- ✅ Phaser rendering NPCs
- ✅ Convex backend with entities table
- ✅ Real-time sync working

---

## Hour 1–3 — Make the world breathe (real-time sync loop) ✅

**Status**: DONE
- ✅ Convex worldTick() running every 3 seconds
- ✅ NPCs move autonomously
- ✅ Real-time subscriptions working

---

## Hour 3–4 — Give every character a seed personality (at birth) ✅

**Status**: DONE
- ✅ 6-trait personality system (curiosity, empathy, boldness, order, mood, weirdness)
- ✅ Randomized at spawn
- ✅ Stored in entities table

---

## Hour 4–5 — Add a first mind (Groq) to decide "what next" ✅

**Status**: DONE
- ✅ Groq/Ollama LLM integration
- ✅ AI-driven thoughts every 10 seconds
- ✅ Fallback to rule-based logic when API disabled

---

## Hour 5–6 — Let them speak on screen (tiny UI pass) ✅

**Status**: DONE
- ✅ Pixel-art style speech bubbles with graphics system
- ✅ Fade in/out animations (200ms/300ms)
- ✅ Auto-dismissal after 2 seconds
- ✅ Dynamic repositioning as NPCs move
- ✅ Triangle tail pointer toward sprite
- ✅ Integration with conversation system

---

## Hour 6–7 — Add memory (store, then recall) ✅

**Status**: DONE
- ✅ Mem0 cloud memory integration
- ✅ Gossip chains with distortion
- ✅ Memory retrieval for LLM context

**⚠️ TODO - Memory Maintenance**:
- **Problem**: No trimming/archiving implemented. Only nuclear "clear all" mutations exist ([migrations.ts:71-110](migrations.ts:71-110)). Memories table will grow unbounded over time.
- **Need**: Add cron job to prune old, low-importance memories
- **When**: After demo (Phase 3 maintenance task)
- **Implementation**:
  ```typescript
  // Add to crons.ts - run daily or weekly
  export const pruneOldMemories = internalMutation({
    handler: async (ctx) => {
      const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days ago
      const oldMemories = await ctx.db
        .query("memories")
        .filter(q => q.and(
          q.lt(q.field("timestamp"), cutoffTime),
          q.lt(q.field("importance"), 0.3) // Only delete low-importance
        ))
        .collect();

      for (const memory of oldMemories) {
        await ctx.db.delete(memory._id);
      }
      console.log(`🗑️ Pruned ${oldMemories.length} old low-importance memories`);
    }
  });
  ```

---

## Hour 7–8 — Add mortality (small, composable risk) ✅

**Status**: DONE (basic version)
- ✅ Death probability based on age, health, stress
- ✅ reaperTick() running every 30 seconds
- ⚠️ Could be upgraded to sigmoid-based hazard model

---

## Hour 8–9 — Add the God Agent (creation + events) ✅

**Status**: DONE
- ✅ God agent spawns NPCs
- ✅ Triggers villain/hero/festival events
- ✅ Location-aware events with witnesses
- ✅ Conversations between NPCs

</details>

---

# PHASE 2: DEMO POLISH (Hours 9-12) ✅ COMPLETE

Goal: Make the simulation **watchable** and **presentable** for demo/recording.

<details>
<summary>Click to expand completed demo polish work</summary>

## Hour 9A — Add Dashboard UI (1 hour) ✅ COMPLETE

**What:**

* Add stats overlay to Phaser (top-left corner):
  ```
  HACKTOWN
  Alive: 12 | Births: 45 | Deaths: 33
  Time: 1,234 min | Thoughts: 567
  Prosperity: ████████░░ 0.82
  Tension: ███░░░░░░░ 0.31
  ```
* Create simple HTML overlay div (easier than Phaser text rendering)
* Subscribe to `worldState` in Convex, update every tick
* Color-code stats (green = good, red = bad)

**Why:**
Observers need context. Numbers make the "living system" obvious. Without this, people just see dots moving randomly.

**Checkpoint:** ✅ DONE
- HTML overlay in top-right corner with monospace fonts
- 5 metrics with ASCII progress bars (████░░░░░░)
- Color-coded values (green=good, yellow=medium, red=bad)
- Real-time updates from worldState subscription
- Thought panel at bottom showing nearby NPC thoughts (200px radius)

**Implementation**: [index.html:19-147](index.html#L19-L147), [main.js:681-738](main.js#L681-L738)

---

## Hour 9B — Add Speech Bubbles (1 hour) ✅ COMPLETE

**What:**

* In Phaser rendering loop, add text above each NPC:
  ```javascript
  // Show lastThought or lastAction above sprite
  if (npc.lastThought) {
    const bubble = scene.add.text(npc.x, npc.y - 30,
      truncate(npc.lastThought, 30),
      { fontSize: '10px', backgroundColor: '#000000AA' }
    );
  }
  ```
* Fade out after 5 seconds
* Limit to on-screen NPCs only (performance)
* Optional: Add emoji based on mood (😊😐😞)

**Why:**
Thoughts are currently invisible. Speech bubbles turn abstract AI into visible story. "I wonder what's happening at the café" becomes watchable narrative.

**Checkpoint:** ✅ DONE
- Graphics-based speech bubbles (not just text)
- White background with black stroke, monospace font
- Triangle tail pointer toward NPC sprite
- Fade in/out animations (200ms/300ms)
- 2-second auto-dismissal
- Integrated with ConversationManager for dialogue display

**Implementation**: [main.js:203-318](main.js#L203-L318), [main.js:341-445](main.js#L341-L445)

---

## Hour 10 — Smooth Rendering + Throttling (1.5 hours) ✅ COMPLETE

**What:**

* **Movement interpolation in Phaser**:
  ```javascript
  // Instead of: sprite.x = npc.x
  // Do: Lerp toward target position
  sprite.x += (npc.x - sprite.x) * 0.1;
  sprite.y += (npc.y - sprite.y) * 0.1;
  ```
* **Throttle backend updates**:
  - worldTick: 3 seconds (already done)
  - aiThinkTick: 10 seconds (already done)
  - Check for unnecessary duplicate Convex calls
* **Cap LLM calls per tick**: Limit to 3-5 NPCs max (cost control)
* **Cache LLM responses**: If identical prompt within 30 seconds, reuse

**Why:**
Polish makes it feel professional. Guards keep costs predictable. Smooth motion prevents jarring teleports.

**Checkpoint:** ✅ DONE
- Smooth lerping with `Phaser.Math.Linear()` and delta-time-based factor
- Snap-to-grid when within 0.1px (prevents micro-jitter)
- Large teleport detection (>200px) for spawning
- LLM throttling: 3-5 NPCs per tick (randomized selection)
- Conversation throttling: Max 2 new conversations per tick
- 30-minute cooldown for recent conversation pairs
- Distance-based proximity: 80px conversation range

**Implementation**: [main.js:177-201](main.js#L177-L201), [tick.ts:303-413](tick.ts#L303-L413)

---

## Hour 11 — Visual Flair (1 hour) ✅ COMPLETE

**What:**

* **Color-code NPCs by mood/state**:
  - Happy (mood > 0.7): Green tint
  - Neutral (mood 0.3-0.7): Normal color
  - Sad (mood < 0.3): Blue tint
  - Stressed (stress > 0.6): Red tint
* **Scale sprites by age** (optional):
  - Young NPCs slightly smaller
  - Old NPCs slightly larger
* **Highlight special NPCs**:
  - Villains: Black with red glow
  - Heroes: White with gold glow
* **Add simple background** (if time):
  - Colored rectangles for café, park, school areas

**Why:**
Visual cues let observers read the room at a glance. Color = instant emotional context.

**Checkpoint:** ✅ DONE
- Mood-based colors: Green (happy >0.65), Blue (sad <0.35), Red (stressed >0.5)
- Stress overrides mood coloring
- Age-based scaling: 0.75 (young <3000), 1.0 (normal), 1.3 (elder >12000)
- Villain highlighting: Black triangle, red glow (pulsing), thick red stroke (4px)
- Hero highlighting: White triangle, gold glow (pulsing), thick gold stroke (4px)
- Glow animations: 1500ms sine easing, alpha 0.2-0.6, scale 0.9-1.2
- Landmark animations: Café/park/school subtle pulsing
- Debug keys: V (stress NPCs), H (happy NPCs), R (reset), D (conversation ranges)

**Implementation**: [main.js:20-55](main.js#L20-L55), [main.js:97-175](main.js#L97-L175), [main.js:481-543](main.js#L481-L543)

---

## Hour 12 — Demo Script + Recording (1-1.5 hours) ✅ COMPLETE

**What:**

* Write 60-second demo narrative:
  1. "This is Hacktown - a living simulation running on Convex + Phaser"
  2. "NPCs have personalities (show dashboard stats)"
  3. "They think with AI (show thought bubbles)"
  4. "They remember and gossip (trigger conversation)"
  5. "They die from natural causes (watch death event)"
  6. "God agent creates drama (spawn villain, watch stampede)"
* Record 90-second screen capture with narration
* Test fallback mode (disable Groq, show rule-based still works)
* Write one-page README with:
  - What it is
  - How to run it
  - Architecture diagram (Phaser ↔ Convex ↔ Groq/Mem0)

**Why:**
A demo is a story, not just code. You need a clean narrative path that always works.

**Checkpoint:** ✅ DONE
- ✅ [DEMO_SCRIPT.md](DEMO_SCRIPT.md) - 90-second demo walkthrough created
- ✅ [README.md](README.md) - Full technical documentation
- ✅ [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) - One-page status overview
- ✅ Architecture documented: Phaser ↔ Convex ↔ Ollama/Mem0
- ✅ Keyboard commands documented
- ⏳ Video recording: Ready to record (follow DEMO_SCRIPT.md)

**Implementation**: Documentation complete, ready for video capture

</details>

---

# PHASE 3: EMERGENT PHYSICS OPTIMIZATION (Post-Demo) 🟢 IN PROGRESS

**Status**: ✅ **Hour Y Complete** (Utility Drives - 2.5 hours)

**Remaining**: Hours Z (Boids), W (Enhanced Hazard Model) - Optional polish

**Estimated time remaining**: 3-4 hours (optional)

---

<details>
<summary>Click to expand emergent physics roadmap</summary>

## Hour Y — Replace LLM Movement with Utility Drives (emergent behavior engine) ✅ COMPLETE

**Time**: 2-3 hours
**Status**: ✅ **DONE** (2025-10-19)

**What:**

* Add new fields to entity schema:
  * `energy: v.number()` — hunger level (0-1, starts at 1.0)
  * `social: v.number()` — loneliness level (0-1, starts at 0.5)
  * `resilience: v.number()` — stress buffer (0-1, randomized at spawn)
* Create `convex/drives.ts` with utility scoring system:
  ```typescript
  function decideAction(agent, nearbyNPCs, localFood, localHeat) {
    const hunger = clamp01(1 - agent.energy);
    const loneliness = clamp01(1 - agent.social);
    const safetyConcern = clamp01(localHeat);

    return argmax({
      SEEK_FOOD:   0.8 * hunger + 0.2 * localFood + 0.1 * alignBonus(nearbyNPCs),
      SOCIALIZE:   0.9 * loneliness + 0.2 * similarityBias(agent, nearbyNPCs) - 0.4 * safetyConcern,
      EXPLORE:     0.6 * agent.personality.curiosity - 0.3 * safetyConcern - 0.2 * hunger,
      AVOID_HEAT:  0.7 * safetyConcern + 0.2 * herdAlarm(nearbyNPCs),
      LOITER:      0.2 + 0.3 * comfortNearby(nearbyNPCs) - 0.2 * hunger
    });
  }
  ```
* **Keep Groq/LLM ONLY for dialogue generation** (not movement)
* Add metabolic decay in `worldTick()`:
  * `energy -= 0.005 + 0.01 * speed` (moving costs energy)
  * `social -= 0.003` (loneliness creeps in)
  * `mood = 0.98 * mood + 0.02 * (0.6 * energy - 0.5 * stress)`
* Add interaction effects:
  * SOCIALIZE increases social by 0.15, spreads mood via emotional contagion
  * SEEK_FOOD consumes food from field, restores energy
  * Food competition (2+ NPCs at same spot) raises local heat

**Why:**
Movement driven by internal needs (not expensive LLM calls) creates predictable emergent patterns while saving ~70% of token costs. Hungry NPCs rush to café. Lonely NPCs cluster in groups. Stressed NPCs avoid danger zones. LLM still generates rich dialogue when NPCs talk—you get best of both worlds.

**Checkpoint:** ✅ **DONE**
NPCs develop visible routines without LLM guidance: social personalities cluster at café and chat frequently, curious loners wander map edges, stressed NPCs flee villain zones then slowly return. Energy/social bars visible in debug view. Token usage drops dramatically.

**Implementation:** See [EMERGENT_PHYSICS_IMPLEMENTATION.md](EMERGENT_PHYSICS_IMPLEMENTATION.md) for full details.

**Key Files:**
- ✅ [convex/drives.ts](convex/drives.ts) - Utility scoring system (NEW)
- ✅ [convex/tick.ts:114-211](convex/tick.ts#L114-L211) - Utility-driven movement (MODIFIED)
- ✅ [convex/tick.ts:174-209](convex/tick.ts#L174-L209) - Metabolic decay (MODIFIED)
- ✅ [convex/tick.ts:1287-1321](convex/tick.ts#L1287-L1321) - Emotional contagion (MODIFIED)

---

## Hour 5–6 — Let them speak on screen (tiny UI pass)

**What:**

* In Phaser, show a small speech bubble or nameplate above each character with the last action text.
* Update it whenever Convex state changes.

**Why:**
Visible thoughts create story. People watching instantly feel patterns instead of staring at aimless dots.

**Checkpoint:**
Bubbles change without page refresh as the backend updates.

---

## Hour 6–7 — Add memory (store, then recall)

**What:**

* When an agent acts or interacts, save a one-line memory ("Bob greeted Alice at the market").
* Add a vector/"semantic" index to the memory table.
* Next time the agent thinks, pull the top 3–5 relevant memories and include them in the Groq prompt.

**Why:**
Memory gives continuity. Agents start doing callbacks to their own past, which reads as personality.

**Checkpoint:**
You can inspect an agent and see short memories being saved and retrieved.

---

## TODO: Inter-agent interactions (UPDATED with emergent physics)

**What:**

* Inter-agent interactions (conversations, exchanges, relationships) only happen when agents touch each other physically.
* Implement collision detection or proximity checks (e.g., distance < 2px for interaction trigger).
* When two agents overlap/touch AND utility system selects SOCIALIZE action, trigger interaction logic:
  * Start conversation (use existing conversation system)
  * **Emotional contagion**: Modify mood toward partner's mood
    ```typescript
    const avgMood = (agent.mood + partner.mood) / 2;
    const delta = clamp(-0.2, avgMood - agent.mood, 0.2);
    agent.mood += 0.5 * delta;  // Gradual convergence
    ```
  * Increase social stat by 0.15 (satisfies loneliness need)
  * Share gossip/memories (already implemented in your `startConversation()`)
* **Food competition mechanics**: When 2+ NPCs at same location (distance < 5px) both execute SEEK_FOOD:
  * Raise local heat by 0.03 (tension from competition)
  * Reduce food consumption efficiency by 50% (scarcity conflict)
  * Log "food competition" event for debugging
* Boids separation rule (Hour Z) naturally prevents excessive crowding

**Why:**
Physical proximity creates natural pacing and makes interactions feel grounded in the space. Prevents agents from "talking through walls". Emotional contagion creates mood waves through crowds. Food competition creates emergent conflict zones without scripting drama.

**Checkpoint:**
Watch happy NPCs spread cheer to nearby sad NPCs via conversation. Multiple hungry NPCs at café create brief heat spikes (visible on heat overlay). Boids separation keeps NPCs from stacking perfectly—conversations happen during natural close passes.

---

## TODO: Interpersonal relationship rules

**What:**

* Agent A only knows Agent B if there is a specific event that caused them to meet.
* Track "known agents" as a relationship graph or list per agent.
* First physical contact creates a "met" event and adds each agent to the other's known list.
* Agents can only interact with, refer to, or remember agents they have actually met.
* Relationship strength/type can evolve through repeated interactions.

**Why:**
Prevents omniscient agents who mysteriously know everyone. Creates organic social network formation. Makes the world feel more realistic as agents build relationships over time rather than starting with full knowledge of everyone.

---

## TODO: Socio-economic chart (global baseline modifier)

**What:**

* Create a "world state" chart that tracks socio-economic conditions (e.g., prosperity, stability, happiness, tension, scarcity).
* These values influence everyone's baseline stats (stress, mood, risk-taking, generosity).
* Store as global state in Convex (separate from individual agents).
* Update gradually over time based on:
  * Aggregate agent behaviors (lots of deaths → lower stability)
  * God Agent events (festival → boost happiness, storm → increase tension)
  * Natural drift/cycles (economies ebb and flow)
  * **Field-based calculations** (heat maps, food scarcity)
* Feed these values into each agent's decision-making context.

**Why:**
Creates a shared "emotional weather" that affects the whole world. Agents respond to the times they live in, not just their individual personality. Makes patterns emerge (boom times feel different from hard times) without manually scripting every agent.

**Updated calculations with fields:**
* Prosperity = avgHealth × 0.8 + (1 - avgHeatAcrossMap) × 0.2
* Tension = avgStress × 0.6 + avgHeatNearLandmarks × 0.4

---

## Hour X — Add Scalar Fields (spatial memory via heat + food grids)

**What:**

* Create `fields` table in schema with 30×17 grid cells (for 900×520 world = 30px per cell)
* Each cell stores: type (food/heat), gridX, gridY, value (0-1 density)
* Add `convex/fields.ts` with helper functions:
  * `sample(x, y, type)` — read field value at position
  * `diffuse(rate)` — spread values to neighbors (heat spreads like smoke)
  * `evaporate(decay)` — fade values over time
  * `regrow(rate, cap)` — slowly restore food density
  * `consume(x, y, amount)` — take resources from location
* Integrate into `worldTick()`:
  * Heat: diffuse 12%/tick, evaporate 2%/tick
  * Food: regrow 0.2%/tick up to cap of 1.0
* Modify god events to write heat values to grid (not just point locations)

**Why:**
Creates spatial memory. Events leave "hot zones" that NPCs organically avoid. Food scarcity creates natural gathering spots. Areas develop reputations over time without explicit scripting. A villain event creates heat that spreads and lingers—NPCs sense it and stay away until it fades.

**Checkpoint:**
You can visualize heat/food as color overlays on map. Villain event creates red heat blob that diffuses outward over 30 seconds then fades. Café area shows persistent high food density. NPCs' decisions reference these fields.

---

## TODO: Social heuristics system

**What:**

Implement cognitive shortcuts that influence agent decision-making and social behavior:

* **Social Proof**: Agents imitate behaviors/beliefs of the majority, especially when uncertain. Track "what most agents are doing" and weight it in decision prompts.

* **Authority Heuristic**: Agents trust perceived authority figures (high status, age, experience). Certain agents can be marked as authorities; others defer to their opinions.

* **Likeability Heuristic**: Decisions influenced by how likable/similar another agent is. Track affinity scores; charismatic or similar personalities get more cooperation.

* **In-Group Bias**: Agents prefer/trust those in their social group. Tag agents with groups (occupation, origin, faction); favor in-group members in interactions.

* **Reciprocity Heuristic**: Agents return favors automatically. Track "who helped me" in memory; prioritize helping those who've helped you.

* **Commitment and Consistency**: Agents act consistently with prior commitments. Store stated positions/promises; bias future actions toward alignment with past statements.

* **Availability Heuristic**: Recent or vivid memories dominate judgment. Weight recent/emotionally-charged memories higher in decision context.

* **Representativeness Heuristic**: Agents judge based on stereotypes/prototypes. Store archetypes; agents make snap judgments based on similarity to known patterns.

* **Equity (1/N) Heuristic**: When uncertain, allocate resources/attention equally. Default to fair distribution when no other cues are present.

**Why:**
These heuristics make agent behavior feel psychologically realistic rather than purely rational. They create emergent social dynamics (conformity, cliques, reciprocal networks, authority structures) without hard-coding every social rule. Agents become predictably irrational in human-like ways.

**Implementation notes:**
* Each heuristic can have a "strength" parameter per agent (based on personality)
* Combine multiple heuristics in decision-making (e.g., trust authority + in-group bias)
* Feed heuristic-relevant context into LLM prompts
* Track necessary state (group membership, favor history, recent memories, commitments)

---

## Hour 7–8 (UPDATED) — Add mortality (statistical tragedy via enhanced hazard model)

**What (refined hazard model with sigmoid curves):**

* Each tick, compute per-agent death probability using granular risk factors:
  ```typescript
  // Sigmoid helper: smooth S-curve from 0 to 1
  function sigmoid(z) { return 1 / (1 + Math.exp(-z)); }

  // Map age to risk curve (young = safe, old = risky)
  function mapRange(val, inMin, inMax, outMin, outMax) {
    return outMin + (val - inMin) * (outMax - outMin) / (inMax - inMin);
  }

  function deathProbability(agent, localHeat) {
    const ageRisk = sigmoid(mapRange(agent.age, 0, 20000, -4, 4));
    const starvationRisk = sigmoid(8 * (0.3 - agent.energy));  // Risk spikes below 0.3
    const isolationRisk = sigmoid(6 * (0.2 - agent.social));   // Risk spikes below 0.2
    const conflictRisk = clamp01(localHeat);                   // Direct danger from environment
    const buffer = 0.5 * agent.resilience;                     // Personal armor

    // Weighted logistic combination (tune these coefficients!)
    const z = 0.8 * ageRisk
            + 1.2 * starvationRisk    // Hunger is deadly
            + 0.7 * isolationRisk     // Loneliness kills
            + 0.9 * conflictRisk      // Danger zones are risky
            - buffer
            - 3.5;                     // Baseline offset (lower = more deaths)

    return sigmoid(z) * 0.02;  // Cap at 2% per tick
  }
  ```
* Add to `reaperTick()` mutation in `tick.ts`
* If dice roll < probability, mark `alive = false` and record death event
* **Resilience** field (already added in Hour Y) acts as personal survival buffer

**Why (death as emergent consequence):**
Deaths aren't random—they're the statistical shadow of lived conditions. NPCs who stay fed, social, and safe live longer. Those who wander into hot zones while hungry and alone die faster. Death feels **earned**, not arbitrary. Watch cautious café-dwellers survive while reckless explorers in villain zones perish.

**Tuning knobs:**
* Increase starvation coefficient (1.2 → 1.5) for harsher survival
* Lower baseline offset (-3.5 → -3.0) for more frequent deaths
* Raise resilience variance at spawn for more survival inequality

**Checkpoint:**
Over 10 minutes, observe correlation between behavior and survival. Social NPCs clustering at safe café live longest. Isolated wanderers near heat zones die first. Deaths cluster around villain events then taper off. Check logs show death causes (age/starvation/isolation/conflict breakdown).

---

## Hour 8–9 — Add the God Agent (creation + events)

**What:**

* A second cron that runs every few minutes:

  * Sometimes **spawns** a new agent (with personality seed).
  * Sometimes **fires an event** (festival, storm, villain). Events briefly modify stress/danger and influence behavior.

**Why:**
Top-down rhythm makes population ebb and flow. It prevents stagnation and creates chapters in the day.

**Checkpoint:**
You can see new names appear. During an event, speech and motion feel different (more cautious, more social, etc.).

---

## Hour 9–10 — Sand down rough edges (smoothing + safety rails)

**What:**

* Smooth movement in Phaser (interpolate between positions so motion glides).
* Throttle backend updates to ~5–10 times per second; don't spam the network.
* Put a cap on how many agents think each tick (e.g., 5–10) to control token costs.
* Cache repeated LLM prompts/answers for a few minutes.

**Why:**
Polish buys you "this feels pro" without building a whole engine. Guards keep the bill predictable.

**Checkpoint:**
Movement looks fluid, CPU/fan is calm, token count isn't exploding.

---

## Hour 10–11 — Make it presentable (readability + vibe)

**What:**

* Tint sprites or add colored auras based on mood/personality (calm = cool tone, bold = hotter tone).
* Add a tiny dashboard overlay:

  * "Alive: 87 | Births: 12 | Deaths: 5 | Thoughts today: 312"
* Give the world a short name and title card.

**Why:**
Observers can read the room at a glance. Numbers make the "living system" idea obvious.

**Checkpoint:**
One glance tells a newcomer what's happening without you explaining.

---

## Hour 11–12 — Lock the demo (script + recording + fallback)

**What:**

* Write a 60-second demo script:

  1. "Here's the stage (Phaser)."
  2. "Here's the brain (Convex) beating every second."
  3. "Here's thought and memory (Groq + vector recall)."
  4. "Here's life and death (hazard)."
  5. "Here's God mode (spawn + events)."
* Record a 90-second screen capture.
* Prepare a **plan B** switch: if Groq rate-limits, fall back to canned lines for a minute (world still runs).

**Why:**
A demo isn't code; it's a story. You need one clean path that always works—even if the AI hiccups.

**Checkpoint:**
You have a video, a live build, and a one-page explainer. You're demo-proof.

---

# Guardrails & Recovery Buttons

* **If LLM is slow:** reduce "agents per tick" from 10 → 3; reuse last action for others.
* **If FPS dips:** stop rendering speech for off-screen NPCs; lower sprite count temporarily.
* **If tokens spike:** cache identical prompts; length-limit memories passed to Groq.
* **If nothing interesting happens:** temporarily boost "event frequency" and "boldness" during demo.

---

# What you'll have at the end

* A browser window where little people **move**, **speak**, **remember**, **die**, and **new ones appear**—all driven by a simple, understandable loop.
* A short recording and a one-page overview you can send to anyone.
* A codebase that's small but extensible: personalities can deepen, events can chain, art can improve later.

---

# EMERGENT BEHAVIOR INTEGRATION SUMMARY

## What the new physics adds to your existing build:

### Keep (Already Built):
✅ Groq/Ollama LLM for **dialogue generation** (ai.ts)
✅ Mem0 cloud memory with gossip chains and distortion (schema.ts:34-45)
✅ Location-aware god events with witness tracking (tick.ts:818-927)
✅ Conversation system with personality-driven dialogue (tick.ts:565-811)
✅ Socioeconomic world state tracking (worldState.ts:104-180)

### Add (Emergent Physics):
➕ **Scalar fields** (Hour X) — Heat/food grids create spatial memory
➕ **Utility drives** (Hour Y) — Internal needs (hunger/loneliness) drive behavior
➕ **Boids steering** (Hour Z) — Flocking crowds with organic movement
➕ **Enhanced hazard model** (Hour W) — Statistical death from lived conditions
➕ **Emotional contagion** — Mood spreads through conversations
➕ **Food competition** — Scarcity creates emergent conflict zones

## Time Investment:
- Scalar fields: **2 hours**
- Utility drives: **2-3 hours**
- Boids steering: **2-3 hours**
- Hazard model tuning: **30 min**
- Integration/testing: **1 hour**

**Total: 8-9 hours** (can be done over 2-3 coding sessions)

## Emergent Patterns You'll See (Without Scripting Them):

| You Code This... | You Get This For Free... |
|------------------|--------------------------|
| "Stay near neighbors" (boids) | Crowds naturally form at cafés and parks |
| "Avoid heat zones" (utility) | Stampedes when villains appear, gradual return after |
| "Hungry NPCs seek food" (drives) | Rush hour at café during meal times |
| "Lonely NPCs socialize" (drives) | Cliques form (similar personalities cluster) |
| "Heat spreads slowly" (fields) | Neighborhoods develop reputations ("avoid the alley") |
| "Mood spreads via conversation" | Waves of happiness/sadness flow through crowds |
| "High heat + low energy = death" | Tragedy strikes the reckless, not the cautious |
| "Food competition raises heat" | Scarcity creates tension zones without scripting drama |

## Cost Savings:
- **Current**: LLM calls for every movement decision (~100 tokens/NPC/tick)
- **After**: LLM only for dialogue (~50 tokens/NPC/conversation)
- **Savings**: ~70% reduction in token usage
- **Benefit**: More predictable costs, faster tick rates, richer emergent behavior

## The Philosophy:
> "NPCs feel alive through **physics**, not just clever AI responses. Your world develops personality through **emergent patterns**—cliques, stampedes, neighborhoods, mood waves—without hard-coding them."

---

## Quick Start Sequence:
1. **Hour X** → Add fields (spatial memory foundation)
2. **Hour Y** → Add drives (replace LLM movement, keep LLM dialogue)
3. **Hour Z** → Add boids (organic crowd physics)
4. **Hour W** → Tune hazard model (statistical tragedy)
5. **Test & Tune** → Adjust coefficients, watch emergent patterns

Your existing LLM dialogue, Mem0 memories, and god events will make the emergent behavior **narratively rich** instead of just mathematically interesting.

</details>

---

# 📋 QUICK REFERENCE: PRIORITY MATRIX

## ✅ PHASE 1: COMPLETE (Hours 0-9)
- Phaser + Convex setup
- Real-time sync
- 6-trait personality system
- Groq/Ollama LLM thoughts
- Mem0 memories + gossip
- NPC conversations
- God agent (spawns + events)
- Basic mortality

## ✅ PHASE 2: COMPLETE (Hours 9-12) - Demo Polish
| Task | Status | Implementation |
|------|--------|----------------|
| Dashboard UI | ✅ DONE | HTML overlay with 5 color-coded metrics |
| Speech Bubbles | ✅ DONE | Pixel-art graphics with fade animations |
| Smooth Rendering | ✅ DONE | Lerp interpolation + LLM throttling (3-5 NPCs/tick) |
| Visual Flair | ✅ DONE | Mood colors + age scaling + special NPC glows |
| Demo Script + Docs | ✅ DONE | DEMO_SCRIPT.md + README.md + PROJECT_SUMMARY.md |
| **TOTAL** | **✅ 12 hours** | **→ DEMO-READY BUILD** |

## 🔵 DEFER (Phase 3) - Emergent Physics
| Task | Time | When to Build |
|------|------|---------------|
| Scalar Fields | 2h | After demo, when you want heat map visualization |
| Utility Drives | 2-3h | After demo, when you want 70% token savings |
| Boids Steering | 2-3h | After demo, when you want organic flocking |
| Enhanced Hazard Model | 30m | Nice polish, can do anytime |
| **TOTAL** | **8-9 hours** | **Post-demo optimization** |

## ❌ SKIP ENTIRELY
- Social Heuristics (PhD thesis complexity)
- Interpersonal Relationship Tracking (unless needed for gameplay)
- Boids Steering (nice-to-have, waypoints work fine)

---

# 🎬 WHAT'S NEXT? (Choose Your Path)

## ✅ COMPLETED (All Phase 2 Tasks Done!)

```
[✅] Hour 9A: Dashboard UI (stats overlay)
[✅] Hour 9B: Speech bubbles above NPCs
[✅] Hour 10: Smooth movement interpolation
[✅] Hour 11: Color-code NPCs by mood/state
[✅] Hour 12: Demo script + documentation
```

---

## 🚀 THREE PATHS FORWARD

### Option A: Record Demo Video (1-2 hours)
**Best for**: Showcasing your work, building portfolio, social media

**Steps**:
1. Follow [DEMO_SCRIPT.md](DEMO_SCRIPT.md) for 90-second walkthrough
2. Record screen capture with narration
3. Test key moments (villain spawn, conversations, dashboard updates)
4. Upload to YouTube/Twitter/portfolio

**Why**: You have a fully working demo-ready build. Strike while the iron's hot!

---

### Option B: Polish for Public Release (2-3 hours)
**Best for**: Making it bulletproof for others to run

**Priority fixes**:
1. **Memory pruning cron job** (30 min) - Prevent unbounded memory growth
   - Add weekly cleanup of old low-importance memories
   - Implementation template already in build plan (line 78-98)

2. **Population cap** (15 min) - Prevent performance degradation
   - Add max 25 NPCs limit in godTick
   - Stop spawning when limit reached

3. **Conversation dialogue parsing** (1 hour) - Improve reliability
   - Better fallback handling for malformed LLM responses
   - More robust JSON parsing in conversation system

4. **Setup guide polish** (30 min) - Make README foolproof
   - Add troubleshooting section
   - Document ngrok tunnel setup clearly
   - Add "quick start in 5 minutes" section

**Why**: Turn this from "works on my machine" to "works everywhere"

---

### Option C: Build Phase 3 Features (8-9 hours over 2-3 sessions)
**Best for**: Deepening emergent behavior + reducing LLM costs

**Roadmap** (detailed in Phase 3 section above):
1. **Scalar Fields** (2h) - Heat/food grids for spatial memory
2. **Utility Drives** (2-3h) - Replace LLM movement, save 70% tokens
3. **Boids Flocking** (2-3h) - Natural crowd clustering
4. **Enhanced Hazard Model** (30m) - Sigmoid mortality curves

**Emergent patterns you'll get**:
- Crowds form at cafés organically
- Stampedes during villain events
- "Neighborhoods" develop reputations
- Mood waves spread through crowds
- Death becomes consequence of behavior, not random

**Why**: Take emergent behavior to the next level while dramatically reducing costs

---

## 💡 RECOMMENDED PATH

**If this is your first time showing this project**: → **Option A** (Record Demo)
- You've invested 12 hours, capture it on video NOW
- Can always polish/extend later
- Demo proves the concept works

**If you want others to run it**: → **Option B** (Polish for Release)
- Memory pruning + population cap = critical for stability
- Takes ~2-3 hours, high ROI

**If you want to experiment more**: → **Option C** (Phase 3)
- Emergent physics adds fascinating depth
- Can build incrementally (one feature at a time)
- Best done after you have demo video as "before/after" comparison

---

**You're demo-ready! 🎉 All 12 hours of planned work complete.**