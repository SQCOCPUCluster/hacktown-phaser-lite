import { logger } from "./logger";
import { ollamaLoadBalancer, getLoadBalancer } from "./ollamaLoadBalancer";

// AI integration - Unified Load Balancer supporting Ollama + Groq
// Using fetch instead of SDK for Convex compatibility

// Configuration: Unified load balancer automatically handles both Groq and Ollama
// If GROQ_API_KEY is set, it will use 70% Groq / 30% Ollama
// If GROQ_API_KEY is not set, it will use 100% Ollama
const USE_LOAD_BALANCER = true; // Use unified load balancing (Ollama + Groq)

// Legacy configuration (kept for backward compatibility)
const USE_GROQ = false; // Deprecated: Use unified load balancer instead
const OLLAMA_NGROK_URL = "http://100.97.106.7:11434";
// Fallback: Windows desktop GPU over Tailscale (used when load balancer disabled)

/**
 * Call Groq to generate a thought/action for an NPC
 * @param apiKey - The Groq API key from Convex environment
 * @param personality - The NPC's personality traits (0-1 for each)
 * @param context - Contextual information (location, nearby NPCs, events)
 * @returns A short thought/action string
 */
export async function generateThought(
  apiKey: string,
  personality: {
    curiosity: number;
    empathy: number;
    boldness: number;
    order: number;
    mood: number;
    weirdness: number;
  },
  context: {
    name: string;
    location: { x: number; y: number };
    target: { x: number; y: number };
    nearbyNPCs: Array<{ name: string; distance: number }>;
    activeEvents: Array<{ type: string; description: string }>;
    health: number;
    stress: number;
    age: number;
    memories?: string[];
    // Dark psychology fields
    despair?: number;
    aggression?: number;
    traumaMemories?: Array<{ type: string; severity: number }>;
    mentalBreakpoint?: number;
  }
): Promise<string> {
  // Check if we should use Groq or fallback to Ollama
  if (!USE_GROQ) {
    logger.debug("🔧 Using Ollama via ngrok (Groq disabled)");
    return generateFallbackThought(personality, context);
  }

  // GROQ API CALL - ENABLED WHEN USE_GROQ=true
  try {
    // Build the prompt
    const prompt = buildPrompt(personality, context);

    // Call Groq API directly using fetch (Convex compatible)
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content:
              "You are modeling a warm slice-of-life simulation in a hopeful maker town. Default to gentle, optimistic thoughts (max 10-15 words). When the prompt lists despairLevel >= 0.60, allow the character to voice heavier feelings honestly while still sounding human. Otherwise keep the tone constructive or curious. Return only the sentence, no quotes.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        model: "llama-3.3-70b-versatile", // Fast, high-quality model
        temperature: 0.9, // High creativity for varied responses
        max_tokens: 30, // Keep responses short
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const thought = data.choices?.[0]?.message?.content?.trim() || "...";

    // Clean up any quotes if the model added them
    return thought.replace(/^["'](.*)["']$/, "$1");
  } catch (error) {
    logger.error("Groq API error:", error);
    // Fallback to personality-based defaults if API fails
    return generateFallbackThought(personality, context);
  }
}

/**
 * Build a contextual prompt for the LLM
 */
function buildPrompt(
  personality: any,
  context: any
): string {
  const { name, location, target, nearbyNPCs, activeEvents, health, stress, age, memories, despair, aggression, traumaMemories, mentalBreakpoint } = context;

  // Describe personality
  const traits = [];
  if (personality.curiosity > 0.7) traits.push("very curious");
  else if (personality.curiosity > 0.4) traits.push("somewhat curious");

  if (personality.empathy > 0.7) traits.push("highly empathetic");
  else if (personality.empathy < 0.3) traits.push("self-focused");

  if (personality.boldness > 0.7) traits.push("bold and daring");
  else if (personality.boldness < 0.3) traits.push("cautious");

  if (personality.order > 0.7) traits.push("orderly");
  else if (personality.order < 0.3) traits.push("spontaneous");

  if (personality.weirdness > 0.7) traits.push("quirky");

  const personalityDesc = traits.length > 0 ? traits.join(", ") : "balanced";

  // Mood and state
  let moodDesc = "neutral";
  if (personality.mood > 0.7) moodDesc = "happy";
  else if (personality.mood < 0.3) moodDesc = "down";

  let stressDesc = "";
  if (stress > 0.5) stressDesc = " They're feeling stressed.";
  if (health < 0.5) stressDesc += " They're not feeling well.";

  const despairLevel = despair !== undefined ? despair.toFixed(2) : "n/a";
  const aggressionLevel = aggression !== undefined ? aggression.toFixed(2) : "n/a";
  const traumaCount = traumaMemories?.length ?? 0;
  const mentalBreakpointLevel = mentalBreakpoint !== undefined ? mentalBreakpoint.toFixed(2) : "n/a";

  // Emotional tone - highlight cues for the model, only one descriptor per dimension
  const emotionalHighlights: string[] = [];
  if (despair !== undefined) {
    if (despair >= 0.75) emotionalHighlights.push("wrestling with very heavy thoughts");
    else if (despair >= 0.6) emotionalHighlights.push("feeling overwhelmed and craving support");
    else if (despair >= 0.4) emotionalHighlights.push("processing worries yet staying hopeful");
    else if (despair >= 0.2) emotionalHighlights.push("calm and steady");
    else emotionalHighlights.push("feeling upbeat and confident");
  }

  if (aggression !== undefined) {
    if (aggression >= 0.75) emotionalHighlights.push("holding a lot of pent-up energy");
    else if (aggression >= 0.6) emotionalHighlights.push("restless and intense");
    else if (aggression >= 0.4) emotionalHighlights.push("motivated to act");
    else if (aggression >= 0.2) emotionalHighlights.push("relaxed and patient");
    else emotionalHighlights.push("unhurried");
  }

  if (traumaMemories !== undefined && traumaMemories.length > 0) {
    emotionalHighlights.push("carrying meaningful memories but building resilience");
  }

  if (mentalBreakpoint !== undefined && mentalBreakpoint > 0.6) {
    emotionalHighlights.push("needing extra encouragement from friends");
  }

  const emotionalSummary =
    emotionalHighlights.length > 0 ? emotionalHighlights.join(", ") : "steady and balanced";

  // Nearby NPCs
  const nearbyDesc =
    nearbyNPCs.length > 0
      ? `Nearby: ${nearbyNPCs.map((n) => n.name).join(", ")}.`
      : "They're alone.";

  // Events
  const eventsDesc =
    activeEvents.length > 0
      ? `Current events: ${activeEvents.map((e) => e.description).join(", ")}.`
      : "";

  // Movement
  const dx = target.x - location.x;
  const dy = target.y - location.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const movingDesc = distance > 10 ? "walking to a destination" : "standing around";

  // Memories (if available)
  let memoriesDesc = "";
  if (memories && memories.length > 0) {
    memoriesDesc = `\nRecent memories:\n${memories.map((m: string) => `- ${m}`).join('\n')}`;
  }

  const traumaSummary =
    traumaMemories && traumaMemories.length > 0
      ? traumaMemories
          .slice(0, 3)
          .map((t: any) => t.type)
          .join(", ")
      : "none";

  return `
Character: ${name}
Personality: ${personalityDesc}
Mood: ${moodDesc}${stressDesc}
Mental markers: despairLevel=${despairLevel}, aggressionLevel=${aggressionLevel}, mentalBreakpoint=${mentalBreakpointLevel}, traumaCount=${traumaCount}
Emotional notes: ${emotionalSummary}.
Trauma themes: ${traumaSummary}
Currently: ${movingDesc}
${nearbyDesc}
${eventsDesc}${memoriesDesc}

What is ${name} thinking or doing right now? (one short sentence)
`.trim();
}

/**
 * Generate a thought using local Ollama when Groq API is disabled/fails
 */
async function generateFallbackThought(personality: any, context: any): Promise<string> {
  try {
    const prompt = buildPrompt(personality, context);

    // Use load balancer if enabled, otherwise direct connection
    if (USE_LOAD_BALANCER) {
      logger.debug("🔄 Using load balancer for thought generation");

      const result = await ollamaLoadBalancer.generate({
        model: "qwen2.5:3b", // Fast non-thinking model (was qwen3:8b thinking model)
        prompt: `You are shaping a cozy slice-of-life simulation in a hopeful maker town. Default to gentle, optimistic thoughts (max 10-15 words). When the prompt lists despairLevel >= 0.60, let the character acknowledge heavier feelings honestly; otherwise keep the tone curious or encouraging. Return one sentence.

${prompt}

Generate ONE natural thought:`,
        stream: false,
        options: {
          temperature: 0.9,
          num_predict: 30,
        },
      });

      if (result && result.response) {
        const thought = result.response.trim();
        logger.debug(`✅ Generated thought via ${result.server}`);
        return thought.replace(/^["'](.*)["']$/, "$1").split('\n')[0];
      }
    } else {
      // Direct connection fallback (single server)
      logger.debug("🔧 Using direct connection to Ollama");

      const response = await fetch(`${OLLAMA_NGROK_URL}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "qwen2.5:3b", // Fast non-thinking model
          prompt: `You are shaping a cozy slice-of-life simulation in a hopeful maker town. Default to gentle, optimistic thoughts (max 10-15 words). When the prompt lists despairLevel >= 0.60, let the character acknowledge heavier feelings honestly; otherwise keep the tone curious or encouraging. Return one sentence.

${prompt}

Generate ONE natural thought:`,
          stream: false,
          options: {
            temperature: 0.9,
            num_predict: 30,
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const thought = data.response?.trim() || "";
        if (thought) {
          return thought.replace(/^["'](.*)["']$/, "$1").split('\n')[0];
        }
      }
    }
  } catch (error) {
    logger.debug("Ollama not available, using rule-based fallback");
  }

  // Final fallback: Simple rule-based generation
  const { name, nearbyNPCs, activeEvents, despair: despairLevel = 0, aggression: aggressionLevel = 0 } = context;

  if (despairLevel >= 0.75) {
    return `${name} admits the darkness feels heavy and hopes someone will notice.`;
  }

  if (despairLevel >= 0.6) {
    return `${name} confides that today feels rough but they want to reach out.`;
  }

  if (aggressionLevel >= 0.7) {
    return `${name} takes a deep breath to let the frustration pass without snapping.`;
  }

  if (activeEvents.length > 0) {
    const event = activeEvents[0];
    if (event.type === "storm") return `${name} seeks shelter from the storm`;
    if (event.type === "festival") return `${name} enjoys the festival atmosphere`;
    if (event.type === "market") return `${name} browses the market stalls`;
    if (event.type === "villain") return `${name} nervously watches the hooded figure`;
    if (event.type === "hero") return `${name} feels inspired by the hero's kindness`;
    if (event.type === "celebration") return `${name} joins in the celebration`;
    if (event.type === "accident") return `${name} rushes over to help`;
  }

  if (nearbyNPCs.length > 0 && personality.empathy > 0.5) {
    return `${name} notices ${nearbyNPCs[0].name} nearby`;
  }

  if (personality.curiosity > 0.6) {
    return `${name} wonders what's around the corner`;
  }

  if (personality.boldness > 0.6) {
    return `${name} decides to explore somewhere new`;
  }

  return `${name} takes a moment to breathe`;
}

/**
 * Generate a contextual dialogue exchange between two NPCs
 * @param npc1 - First NPC with personality and context
 * @param npc2 - Second NPC with personality and context
 * @param context - Shared context (events, location, etc.)
 * @returns Array of dialogue lines alternating between NPCs
 */
export async function generateDialogue(
  npc1: { name: string; personality: any; memories?: any[]; despair?: number; aggression?: number; traumaMemories?: any[] },
  npc2: { name: string; personality: any; memories?: any[]; despair?: number; aggression?: number; traumaMemories?: any[] },
  context: {
    activeEvents: Array<{ type: string; description: string }>;
    location: { x: number; y: number };
    worldTime: number;
  }
): Promise<Array<{ speaker: string; text: string }>> {
  logger.debug(`🎭 Generating dialogue for ${npc1.name} ↔ ${npc2.name}...`);
  logger.debug(`   Context: ${context.activeEvents.length} events, time: ${context.worldTime}`);
  logger.debug(`   ${npc1.name} memories:`, npc1.memories?.slice(0, 2));
  logger.debug(`   ${npc2.name} memories:`, npc2.memories?.slice(0, 2));

  // Try LLM generation first (Ollama), fall back to templates if fails
  try {
    logger.debug(`🔄 Attempting LLM dialogue generation via Ollama...`);
    const llmDialogue = await generateLLMDialogue(npc1, npc2, context);
    if (llmDialogue && llmDialogue.length > 0) {
      logger.debug(`🤖 ✅ Generated LLM dialogue for ${npc1.name} ↔ ${npc2.name} (${llmDialogue.length} lines)`);
      logger.debug(`   Sample: "${llmDialogue[0].text}"`);
      return llmDialogue;
    } else {
      logger.debug(`⚠️ LLM returned empty dialogue, using fallback templates`);
    }
  } catch (error) {
    logger.debug(`⚠️ LLM dialogue generation failed:`, error);
    logger.debug(`   Falling back to template-based dialogue`);
  }

  // Fallback to template-based dialogue
  logger.debug(`📝 Using template-based dialogue for ${npc1.name} ↔ ${npc2.name}`);
  const fallbackDialogue = generateFallbackDialogue(npc1, npc2, context);
  logger.debug(`   Generated ${fallbackDialogue.length} template lines`);
  return fallbackDialogue;
}

/**
 * Generate dialogue using LLM (Ollama)
 */
async function generateLLMDialogue(
  npc1: { name: string; personality: any; memories?: any[] },
  npc2: { name: string; personality: any; memories?: any[] },
  context: {
    activeEvents: Array<{ type: string; description: string }>;
    location: { x: number; y: number };
    worldTime: number;
  }
): Promise<Array<{ speaker: string; text: string }> | null> {
  try {
    // Build contextual prompt for dialogue generation
    const prompt = buildDialoguePrompt(npc1, npc2, context);
    logger.debug(`📝 Built prompt for LLM (${prompt.length} chars)`);

    const dialoguePrompt = `You are crafting a grounded yet uplifting conversation between two townspeople in a collaborative, optimistic community.

${prompt}

Guidelines:
- Keep the tone supportive, hopeful, and authentic to small-town life.
- Only speakers whose despairLevel >= 0.60 may voice heavy or dark thoughts; everyone else should stay encouraging or practical.
- Avoid violent or hopeless language unless the same speaker has despairLevel >= 0.75 or aggressionLevel >= 0.60, and even then keep it grounded and human.
- End on an optimistic, proactive, or gently humorous note that shows connection.

Generate a SHORT conversation (4-6 lines total, alternating speakers). Format as:
${npc1.name}: [their line]
${npc2.name}: [their line]
${npc1.name}: [their line]
${npc2.name}: [their line]

Each line should be 10-25 words max. PRIORITIZE EMOTIONAL AUTHENTICITY OVER COMFORT.

Conversation:`;

    let rawDialogue: string | undefined;

    // Use load balancer if enabled, otherwise direct connection
    if (USE_LOAD_BALANCER) {
      logger.debug("🔄 Using load balancer for dialogue generation");

      const result = await ollamaLoadBalancer.generate({
        model: "qwen2.5:3b", // Fast non-thinking model (was qwen3:8b)
        prompt: dialoguePrompt,
        stream: false,
        options: {
          temperature: 0.9,
          num_predict: 150,
        },
        timeout: 20000, // 20s timeout (faster with non-thinking model)
      });

      if (result && result.response) {
        rawDialogue = result.response.trim();
        logger.debug(`✅ Generated dialogue via ${result.server}`);
      } else {
        logger.debug(`❌ Load balancer returned no response`);
        return null;
      }
    } else {
      // Direct connection fallback (single server)
      logger.debug(`🌐 Calling Ollama directly at ${OLLAMA_NGROK_URL}/api/generate...`);

      const response = await fetch(`${OLLAMA_NGROK_URL}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "qwen2.5:3b", // Fast non-thinking model
          prompt: dialoguePrompt,
          stream: false,
          options: {
            temperature: 0.9,
            num_predict: 150,
          },
        }),
      });

      if (!response.ok) {
        logger.debug(`❌ Ollama response not OK: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json();
      rawDialogue = data.response?.trim();
    }

    logger.debug(`📥 Received LLM response (${rawDialogue?.length || 0} chars)`);

    if (!rawDialogue) {
      logger.debug(`❌ Empty response from LLM`);
      return null;
    }

    logger.debug(`🔍 Raw LLM output (${rawDialogue.length} chars):`);
    logger.debug(rawDialogue);

    // Parse the LLM output into structured dialogue
    const lines = rawDialogue.split('\n').filter((line: string) => line.trim());
    logger.debug(`📋 Split into ${lines.length} lines`);
    const dialogue: Array<{ speaker: string; text: string }> = [];

    for (const line of lines) {
      // Match format "Name: text" or "Name - text"
      const match = line.match(/^(.+?)[:|-]\s*(.+)$/);
      if (match) {
        const speaker = match[1].trim();
        const text = match[2].trim();

        logger.debug(`🔍 Checking speaker "${speaker}" against ${npc1.name} / ${npc2.name}`);

        // Match by first name (more flexible than full name)
        const npc1FirstName = npc1.name.split(' ')[0];
        const npc2FirstName = npc2.name.split(' ')[0];

        // Check if speaker matches either NPC (by first name or full name)
        if (speaker === npc1.name || speaker === npc1FirstName || speaker.includes(npc1FirstName)) {
          dialogue.push({ speaker: npc1.name, text });
          logger.debug(`✅ Parsed line for ${npc1.name}: "${text}"`);
        } else if (speaker === npc2.name || speaker === npc2FirstName || speaker.includes(npc2FirstName)) {
          dialogue.push({ speaker: npc2.name, text });
          logger.debug(`✅ Parsed line for ${npc2.name}: "${text}"`);
        } else {
          logger.debug(`⚠️ Skipping unmatched speaker: "${speaker}" (doesn't match ${npc1FirstName} or ${npc2FirstName})`);
        }
      } else {
        logger.debug(`⚠️ Line doesn't match format: "${line}"`);
      }
    }

    // Validate we got reasonable dialogue (at least 2 lines)
    if (dialogue.length >= 2) {
      logger.debug(`✅ Parsed ${dialogue.length} valid dialogue lines`);
      return dialogue;
    }

    logger.debug(`❌ Not enough dialogue lines (got ${dialogue.length}, need 2+)`);
    return null;
  } catch (error) {
    logger.error("❌ LLM dialogue generation error:", error);
    return null;
  }
}

/**
 * Build a contextual prompt for dialogue generation
 */
function buildDialoguePrompt(
  npc1: { name: string; personality: any; memories?: any[]; despair?: number; aggression?: number; traumaMemories?: any[] },
  npc2: { name: string; personality: any; memories?: any[]; despair?: number; aggression?: number; traumaMemories?: any[] },
  context: {
    activeEvents: Array<{ type: string; description: string }>;
    location: { x: number; y: number };
    worldTime: number;
  }
): string {
  // Describe personalities
  const describePersonality = (npc: any) => {
    const p = npc.personality;
    const traits: string[] = [];
    if (p.curiosity > 0.6) traits.push("curious");
    if (p.empathy > 0.6) traits.push("empathetic");
    if (p.boldness > 0.6) traits.push("bold");
    if (p.order > 0.6) traits.push("orderly");
    if (p.weirdness > 0.6) traits.push("quirky");

    let mood = "steady";
    if (p.mood > 0.7) mood = "cheerful";
    else if (p.mood < 0.3) mood = "feeling low but open to encouragement";
    else if (p.mood < 0.4) mood = "thoughtful";

    const emotionalNotes: string[] = [];
    const despairLevel = npc.despair !== undefined ? npc.despair.toFixed(2) : "n/a";
    const aggressionLevel = npc.aggression !== undefined ? npc.aggression.toFixed(2) : "n/a";
    if (npc.despair !== undefined) {
      if (npc.despair >= 0.75) emotionalNotes.push("wrestling with heavy emotions");
      else if (npc.despair >= 0.6) emotionalNotes.push("feeling overwhelmed and seeking support");
      else if (npc.despair >= 0.4) emotionalNotes.push("looking for reassurance");
      else if (npc.despair >= 0.2) emotionalNotes.push("keeping a balanced outlook");
      else emotionalNotes.push("enjoying the moment");
    }

    if (npc.aggression !== undefined) {
      if (npc.aggression >= 0.75) emotionalNotes.push("carrying intense energy");
      else if (npc.aggression >= 0.6) emotionalNotes.push("restless but mindful");
      else if (npc.aggression >= 0.4) emotionalNotes.push("motivated to act");
      else if (npc.aggression >= 0.2) emotionalNotes.push("relaxed");
      else emotionalNotes.push("at ease");
    }

    if (npc.traumaMemories && npc.traumaMemories.length > 0) {
      emotionalNotes.push("processing old memories with resilience");
    }

    const note =
      emotionalNotes.length > 0 ? ` | emotional notes: ${emotionalNotes.join(", ")}` : "";

    return `${traits.join(", ") || "balanced"} (mood: ${mood}${note} | markers: despair=${despairLevel}, aggression=${aggressionLevel})`;
  };

  // Recent memories
  const npc1Memories = npc1.memories?.slice(0, 3).map((m: any) => m.text || m).join("; ") || "none";
  const npc2Memories = npc2.memories?.slice(0, 3).map((m: any) => m.text || m).join("; ") || "none";

  // Active events
  const eventsDesc = context.activeEvents.length > 0
    ? context.activeEvents.map(e => e.description).join("; ")
    : "no major events";

  return `
**${npc1.name}**: ${describePersonality(npc1)}
Recent memories: ${npc1Memories}

**${npc2.name}**: ${describePersonality(npc2)}
Recent memories: ${npc2Memories}

**Context**: ${eventsDesc}
**Time**: ${Math.floor(context.worldTime / 60)} hours into simulation

They just ran into each other. Generate a natural conversation based on their personalities, mental states, memories, and current events. If someone is in crisis or traumatized, this MUST show in their dialogue.
`.trim();
}

/**
 * Distort gossip based on personality (misinformation emerges!)
 */
function distortGossip(originalText: string, personality: any): string {
  // High weirdness = more distortion
  // Low empathy = more negative spin
  const weirdness = personality.weirdness;
  const empathy = personality.empathy;

  // Simple distortion rules
  if (weirdness > 0.8) {
    // Very weird NPCs add wild exaggerations
    return originalText.replace("Witnessed:", "Heard something CRAZY:").replace("at", "RIGHT NEAR");
  } else if (weirdness > 0.5) {
    // Moderately weird NPCs add "apparently"
    return originalText.replace("Witnessed:", "Apparently,");
  }

  // Low empathy adds negative spin
  if (empathy < 0.3) {
    return originalText.replace("Witnessed:", "Something bad happened:");
  }

  return originalText.replace("Witnessed:", "I heard that");
}

/**
 * Generate dialogue using personality-based templates with gossip system
 */
function generateFallbackDialogue(
  npc1: any,
  npc2: any,
  context: any
): Array<{ speaker: string; text: string }> {
  const { activeEvents } = context;
  const dialogue: Array<{ speaker: string; text: string }> = [];
  const npc1Despair = npc1.despair ?? 0;
  const npc2Despair = npc2.despair ?? 0;

  if (npc1Despair >= 0.6 || npc2Despair >= 0.6) {
    const primary = npc1Despair >= npc2Despair ? npc1 : npc2;
    const secondary = primary === npc1 ? npc2 : npc1;
    const primaryLevel = primary === npc1 ? npc1Despair : npc2Despair;
    const secondaryLevel = secondary === npc1 ? npc1Despair : npc2Despair;

    const primaryOpening =
      primaryLevel >= 0.75
        ? `I can't shake how heavy everything feels today.`
        : `I've been feeling really weighed down lately.`;

    dialogue.push({
      speaker: primary.name,
      text: primaryOpening,
    });

    const secondaryReply =
      secondaryLevel >= 0.6
        ? `Same here. Maybe we should lean on each other a little more.`
        : `Thanks for telling me. Want to take a walk or grab tea later?`;

    dialogue.push({
      speaker: secondary.name,
      text: secondaryReply,
    });

    dialogue.push({
      speaker: primary.name,
      text:
        primaryLevel >= 0.75
          ? `Yeah... even a small plan would help. Maybe we can sketch ideas together tomorrow?`
          : `That sounds good. Doing something together might shake this off.`,
    });

    dialogue.push({
      speaker: secondary.name,
      text:
        secondaryLevel >= 0.6
          ? `Let's check in tomorrow morning and make sure we follow through.`
          : `Absolutely. I'll message you tonight with a time.`,
    });

    return dialogue;
  }

  // Expanded greeting variety
  const greetings = [
    { text: `Hey ${npc2.name}, how are you doing?`, condition: () => npc1.personality.empathy > 0.6 },
    { text: `${npc2.name}! What a coincidence running into you.`, condition: () => npc1.personality.curiosity > 0.5 },
    { text: `Oh hey, ${npc2.name}. Been a while.`, condition: () => npc1.personality.mood < 0.4 },
    { text: `${npc2.name}! Perfect timing, I was just thinking about clouds.`, condition: () => npc1.personality.weirdness > 0.7 },
    { text: `${npc2.name}! Just the person I wanted to see.`, condition: () => npc1.personality.boldness > 0.6 },
    { text: `Morning, ${npc2.name}.`, condition: () => npc1.personality.order > 0.7 },
    { text: `Oh, hi ${npc2.name}.`, condition: () => true }, // Default fallback
  ];

  // Check if either NPC has event memories to gossip about
  const npc1HasEventMemory = npc1.memories?.some((m: any) => m.eventId);
  const npc2HasEventMemory = npc2.memories?.some((m: any) => m.eventId);
  const shouldGossip = (npc1HasEventMemory || npc2HasEventMemory) &&
                       (npc1.personality.curiosity > 0.5 || npc2.personality.curiosity > 0.5);

  // Greeting based on personalities
  if (shouldGossip && npc1HasEventMemory && npc1.personality.curiosity > 0.6) {
    // Start with gossip!
    const eventMemory = npc1.memories.find((m: any) => m.eventId);
    const distortion = npc1.personality.weirdness * 0.3; // Weirdness adds misinformation

    let gossipText = eventMemory.text;
    if (distortion > 0.2) {
      gossipText = distortGossip(gossipText, npc1.personality);
    }

    dialogue.push({
      speaker: npc1.name,
      text: `${npc2.name}! Did you hear about what happened? ${gossipText}`
    });
  } else {
    // Find first matching greeting based on personality
    const greeting = greetings.find(g => g.condition()) || greetings[greetings.length - 1];
    dialogue.push({
      speaker: npc1.name,
      text: greeting.text
    });
  }

  // Response based on mood and personality (with variety)
  const responses = [
    { text: `I'm doing great! Beautiful day, isn't it?`, condition: () => npc2.personality.mood > 0.7 },
    { text: `Pretty good! Just enjoying the day.`, condition: () => npc2.personality.mood > 0.6 },
    { text: `Not bad, just walking around.`, condition: () => npc2.personality.mood > 0.4 },
    { text: `Could be better, honestly.`, condition: () => npc2.personality.mood < 0.3 },
    { text: `Alright, I suppose.`, condition: () => true }, // Default
  ];

  const response = responses.find(r => r.condition()) || responses[responses.length - 1];
  dialogue.push({
    speaker: npc2.name,
    text: response.text
  });

  // Event-based topic if events are active
  if (activeEvents.length > 0) {
    const event = activeEvents[0];

    // === CHURCH-SPECIFIC EVENTS ===
    if (event.type === "cult") {
      dialogue.push({
        speaker: npc1.name,
        text: `There's strange preaching at the church... should we be worried?`
      });
      dialogue.push({
        speaker: npc2.name,
        text: npc2.personality.boldness > 0.6
          ? `They sound fanatical. I'm staying away.`
          : `I don't know... they seem so sure of themselves.`
      });
    } else if (event.type === "miracle") {
      dialogue.push({
        speaker: npc1.name,
        text: `People are claiming miracles at the church!`
      });
      dialogue.push({
        speaker: npc2.name,
        text: npc2.personality.curiosity > 0.5
          ? `I'm skeptical, but... what if it's real?`
          : `I believe. Something divine is happening.`
      });
    } else if (event.type === "prophecy") {
      dialogue.push({
        speaker: npc1.name,
        text: `A prophet appeared at the church with visions...`
      });
      dialogue.push({
        speaker: npc2.name,
        text: npc2.personality.order > 0.6
          ? `Sounds like nonsense to me.`
          : `What did they see? I'm curious.`
      });
    } else if (event.type === "scandal") {
      dialogue.push({
        speaker: npc1.name,
        text: `Did you hear about the church scandal?`
      });
      dialogue.push({
        speaker: npc2.name,
        text: `I knew something was off. Trust is shattered now.`
      });
    } else if (event.type === "confession") {
      dialogue.push({
        speaker: npc1.name,
        text: `I went to confession today... it helped.`
      });
      dialogue.push({
        speaker: npc2.name,
        text: npc2.personality.empathy > 0.6
          ? `I'm glad you found some peace.`
          : `Good for you, I guess.`
      });
    } else if (event.type === "pilgrimage") {
      dialogue.push({
        speaker: npc1.name,
        text: `Pilgrims are arriving at the church seeking guidance.`
      });
      dialogue.push({
        speaker: npc2.name,
        text: `The town is changing... I don't know how to feel about it.`
      });
    } else if (event.type === "fanaticism") {
      dialogue.push({
        speaker: npc1.name,
        text: `Those zealots at the church are recruiting people.`
      });
      dialogue.push({
        speaker: npc2.name,
        text: npc2.personality.boldness < 0.4
          ? `They scare me. I'm avoiding that area.`
          : `Let them try recruiting me. I'm not interested.`
      });
    } else if (event.type === "inquisition") {
      dialogue.push({
        speaker: npc1.name,
        text: `They're accusing people of heresy at the church!`
      });
      dialogue.push({
        speaker: npc2.name,
        text: `This is getting dangerous. We should be careful what we say.`
      });
    } else if (event.type === "salvation") {
      dialogue.push({
        speaker: npc1.name,
        text: `I found redemption at the church... I feel lighter.`
      });
      dialogue.push({
        speaker: npc2.name,
        text: npc2.personality.empathy > 0.5
          ? `That's wonderful. Everyone deserves peace.`
          : `If it works for you, that's good.`
      });
    } else if (event.type === "festival") {
      dialogue.push({
        speaker: npc1.name,
        text: `Are you going to the festival later?`
      });
      dialogue.push({
        speaker: npc2.name,
        text: npc2.personality.curiosity > 0.5
          ? `Definitely! Should be fun.`
          : `Maybe, we'll see.`
      });
    } else if (event.type === "storm") {
      dialogue.push({
        speaker: npc1.name,
        text: `This weather is getting wild.`
      });
      dialogue.push({
        speaker: npc2.name,
        text: npc2.personality.boldness < 0.4
          ? `I know, I should probably head inside.`
          : `Eh, I've seen worse.`
      });
    } else if (event.type === "villain") {
      dialogue.push({
        speaker: npc1.name,
        text: `Did you see that hooded figure?`
      });
      dialogue.push({
        speaker: npc2.name,
        text: npc2.personality.boldness > 0.6
          ? `Yeah, looks suspicious. Someone should check it out.`
          : `Yeah... let's keep our distance.`
      });
    } else if (event.type === "hero") {
      dialogue.push({
        speaker: npc1.name,
        text: `That hero is so inspiring!`
      });
      dialogue.push({
        speaker: npc2.name,
        text: `Right? We need more people like that.`
      });
    } else if (event.type === "market") {
      dialogue.push({
        speaker: npc1.name,
        text: `The market's open, want to check it out?`
      });
      dialogue.push({
        speaker: npc2.name,
        text: npc2.personality.order > 0.6
          ? `Sure, I need to pick up a few things anyway.`
          : `Why not? Let's see what they have.`
      });
    }
  } else {
    // General conversation topics based on personality
    if (npc1.personality.curiosity > 0.6 && npc2.personality.curiosity > 0.6) {
      dialogue.push({
        speaker: npc1.name,
        text: `Ever wonder what's beyond the edge of town?`
      });
      dialogue.push({
        speaker: npc2.name,
        text: `All the time! We should explore someday.`
      });
    } else if (npc1.personality.order > 0.7) {
      dialogue.push({
        speaker: npc1.name,
        text: `Have you been to the café lately? They reorganized everything.`
      });
      dialogue.push({
        speaker: npc2.name,
        text: npc2.personality.order > 0.5
          ? `I noticed! It's much more efficient now.`
          : `Really? I hadn't noticed.`
      });
    } else {
      dialogue.push({
        speaker: npc1.name,
        text: `Well, I should keep moving.`
      });
      dialogue.push({
        speaker: npc2.name,
        text: `Yeah, me too. See you around!`
      });
    }
  }

  return dialogue;
}
