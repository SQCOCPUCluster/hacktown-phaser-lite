import { logger } from "./logger";
import { ollamaLoadBalancer } from "./ollamaLoadBalancer";
// God Event Generator - LLM-driven emergent events
// Events are NOT hard-coded - they emerge from location context and world state
// Uses THINKING MODEL (qwen3:8b) for deep creative reasoning about emergent narratives

import { findLocationAtPoint, getRandomLocation, getEventModifier, Location } from "./locations";

/**
 * Generate a new god event using LLM
 * This function calls Ollama/Groq to create emergent, contextual events
 */
export async function generateGodEvent(context: {
  location: Location;
  worldState: {
    socioEconomic: {
      prosperity: number;
      stability: number;
      happiness: number;
      tension: number;
      scarcity: number;
    };
    currentTime: number;
    population: number;
  };
  recentEvents: Array<{ type: string; description: string }>;
  npcsAtLocation: Array<{ name: string; personality: any }>;
}): Promise<{
  category: string;
  description: string;
  scope: "localized" | "district" | "citywide";
  severity: number;
  duration: number;
  stressModifier: number;
  dangerModifier: number;
  affectedRadius: number;
} | null> {
  try {
    const prompt = buildEventPrompt(context);

    logger.debug("🎭 God is thinking about an emergent event...");

    // Use THINKING MODEL (qwen3:8b) via load balancer for deep creative reasoning
    // God events benefit from the thinking model's reasoning chains
    const result = await ollamaLoadBalancer.generate({
      model: "qwen3:8b", // Thinking model for complex narrative generation
      prompt: prompt + "\n\nReturn ONLY valid JSON with no additional text.",
      stream: false,
      options: {
        temperature: 0.95,  // High creativity for varied emergent events
        num_predict: 300,   // Allow longer responses for thinking + JSON
      },
      timeout: 60000, // 60s timeout - God can take time to think
    });

    if (result && result.response) {
      logger.debug(`✨ God event generated via ${result.server}`);

      // Extract JSON from response (thinking model may include reasoning)
      let jsonText = result.response.trim();

      // Try to find JSON block if wrapped in markdown
      const jsonMatch = jsonText.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      } else {
        // Try to extract just the JSON object
        const objMatch = jsonText.match(/\{[\s\S]*\}/);
        if (objMatch) {
          jsonText = objMatch[0];
        }
      }

      const eventData = JSON.parse(jsonText);

      // Validate and return
      if (validateEventData(eventData)) {
        logger.debug(`✅ God created: ${eventData.category} - ${eventData.description}`);
        return eventData;
      } else {
        logger.warn("⚠️ God event validation failed");
      }
    }
  } catch (error) {
    logger.error("❌ God event generation error:", error);
  }

  // Fallback: Generate a simple rule-based event
  return generateFallbackEvent(context);
}

/**
 * Build a detailed prompt for the LLM to generate an event
 */
function buildEventPrompt(context: any): string {
  const { location, worldState, recentEvents, npcsAtLocation } = context;
  const socio = worldState.socioEconomic;

  // Recent events context
  const recentEventsDesc = recentEvents.length > 0
    ? `Recent events:\n${recentEvents.map((e: any) => `- ${e.type}: ${e.description}`).join('\n')}`
    : "No recent events.";

  // NPCs at location
  const npcsDesc = npcsAtLocation.length > 0
    ? `${npcsAtLocation.length} NPCs currently at this location`
    : "No NPCs currently at this location";

  // Time of day context
  const hour = 8 + Math.floor(context.worldState.currentTime / 60);
  const timeOfDay = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";

  return `You are a god-like event generator for a living simulation world. Your role is to create EMERGENT, REALISTIC events that feel natural and contextual.

LOCATION CONTEXT:
- Name: ${location.name}
- Type: ${location.type}
- Description: ${location.description}
- Time: ${timeOfDay} (hour ${hour})
- ${npcsDesc}

WORLD STATE:
- Prosperity: ${Math.round(socio.prosperity * 100)}%
- Stability: ${Math.round(socio.stability * 100)}%
- Happiness: ${Math.round(socio.happiness * 100)}%
- Tension: ${Math.round(socio.tension * 100)}%
- Scarcity: ${Math.round(socio.scarcity * 100)}%
- Population: ${worldState.population}

${recentEventsDesc}

THINK STEP BY STEP:
1. What type of event makes sense for "${location.type}" at this location?
2. How do the world state values (tension: ${Math.round(socio.tension * 100)}%, stability: ${Math.round(socio.stability * 100)}%) affect what could happen?
3. What would be surprising yet believable?
4. How intense should this event be given the current world state?

CONSTRAINTS:
1. Events must make sense for this location type (e.g., cults at churches, social events at cafés)
2. Event severity should reflect world tension/stability (high tension = more severe events)
3. Scope: "localized" (only this location), "district" (nearby area), or "citywide" (entire map)
4. Keep descriptions concise (1-2 sentences max)
5. Category is a freeform label (e.g., "cult", "celebration", "accident", "scandal", "miracle")

After thinking, generate ONE event as JSON:

{
  "category": "string (freeform, e.g., cult, celebration, scandal)",
  "description": "string (what's happening, 1-2 sentences)",
  "scope": "localized|district|citywide",
  "severity": 0.0-1.0 (how intense/dangerous),
  "duration": number (minutes the event lasts, 5-60),
  "stressModifier": number (-0.5 to 0.5, effect on NPC stress),
  "dangerModifier": number (0.0 to 0.3, danger level),
  "affectedRadius": number (pixels, 50-500 depending on scope)
}

Be creative but realistic. Match the location's character. Return ONLY valid JSON.`;
}

/**
 * Validate LLM-generated event data
 */
function validateEventData(data: any): boolean {
  return (
    typeof data.category === "string" &&
    typeof data.description === "string" &&
    ["localized", "district", "citywide"].includes(data.scope) &&
    typeof data.severity === "number" &&
    data.severity >= 0 &&
    data.severity <= 1 &&
    typeof data.duration === "number" &&
    data.duration > 0 &&
    typeof data.stressModifier === "number" &&
    typeof data.dangerModifier === "number" &&
    typeof data.affectedRadius === "number"
  );
}

/**
 * Fallback event generator when LLM is unavailable
 */
function generateFallbackEvent(context: any): {
  category: string;
  description: string;
  scope: "localized" | "district" | "citywide";
  severity: number;
  duration: number;
  stressModifier: number;
  dangerModifier: number;
  affectedRadius: number;
} {
  const { location, worldState } = context;
  const socio = worldState.socioEconomic;

  // Location-specific fallback events
  const eventTemplates: any = {
    cafe: [
      { cat: "gossip", desc: "An intense gossip session erupts at ${name}", scope: "localized", sev: 0.2, stress: 0.1, danger: 0, radius: 60 },
      { cat: "argument", desc: "A heated argument breaks out at ${name}", scope: "localized", sev: 0.4, stress: 0.25, danger: 0.05, radius: 60 },
      { cat: "celebration", desc: "Someone announces good news at ${name} - celebration!", scope: "localized", sev: 0.3, stress: -0.2, danger: 0, radius: 60 },
    ],
    church: [
      // === CULT & FANATICISM ===
      { cat: "cult", desc: "A charismatic figure begins preaching radical devotion at ${name}", scope: "localized", sev: 0.7, stress: 0.35, danger: 0.2, radius: 70 },
      { cat: "fanaticism", desc: "Zealots gather at ${name}, chanting and recruiting passersby", scope: "district", sev: 0.65, stress: 0.3, danger: 0.15, radius: 120 },
      { cat: "inquisition", desc: "Accusations of heresy ring out from ${name} - a witch hunt begins", scope: "district", sev: 0.8, stress: 0.4, danger: 0.25, radius: 150 },

      // === SPIRITUAL AWAKENING ===
      { cat: "miracle", desc: "Someone claims to have witnessed a miracle at ${name}", scope: "district", sev: 0.5, stress: -0.15, danger: 0, radius: 150 },
      { cat: "prophecy", desc: "A mysterious prophet appears at ${name} speaking of visions", scope: "district", sev: 0.6, stress: 0.2, danger: 0.05, radius: 140 },
      { cat: "enlightenment", desc: "A wave of spiritual awakening sweeps through ${name}", scope: "localized", sev: 0.4, stress: -0.25, danger: 0, radius: 70 },
      { cat: "salvation", desc: "Desperate souls seek redemption at ${name}", scope: "localized", sev: 0.3, stress: -0.2, danger: 0, radius: 70 },

      // === DARK EVENTS ===
      { cat: "scandal", desc: "Dark secrets are exposed at ${name} - trust shatters", scope: "district", sev: 0.7, stress: 0.35, danger: 0.1, radius: 120 },
      { cat: "possession", desc: "Someone screams of demonic possession at ${name}", scope: "localized", sev: 0.75, stress: 0.4, danger: 0.15, radius: 80 },
      { cat: "heresy", desc: "A heretical movement challenges orthodoxy at ${name}", scope: "localized", sev: 0.6, stress: 0.25, danger: 0.1, radius: 70 },
      { cat: "conspiracy", desc: "Whispers of a religious conspiracy emerge from ${name}", scope: "district", sev: 0.65, stress: 0.3, danger: 0.15, radius: 130 },

      // === COMMUNITY EVENTS ===
      { cat: "gathering", desc: "The faithful gather for a solemn ceremony at ${name}", scope: "localized", sev: 0.2, stress: -0.1, danger: 0, radius: 70 },
      { cat: "confession", desc: "People line up to confess their sins at ${name}", scope: "localized", sev: 0.3, stress: -0.15, danger: 0, radius: 70 },
      { cat: "charity", desc: "A charitable event brings the community together at ${name}", scope: "district", sev: 0.3, stress: -0.2, danger: 0, radius: 120 },
      { cat: "pilgrimage", desc: "Pilgrims arrive at ${name} seeking spiritual guidance", scope: "localized", sev: 0.35, stress: -0.1, danger: 0, radius: 80 },
      { cat: "conversion", desc: "A mass conversion ceremony takes place at ${name}", scope: "localized", sev: 0.5, stress: 0.15, danger: 0.05, radius: 70 },
    ],
    park: [
      { cat: "festival", desc: "An impromptu festival begins at ${name}", scope: "district", sev: 0.4, stress: -0.25, danger: 0, radius: 120 },
      { cat: "gathering", desc: "People gather peacefully at ${name}", scope: "localized", sev: 0.2, stress: -0.1, danger: 0, radius: 90 },
      { cat: "crime", desc: "Something suspicious happens at ${name}", scope: "localized", sev: 0.6, stress: 0.3, danger: 0.2, radius: 90 },
    ],
    school: [
      { cat: "protest", desc: "Students organize a protest at ${name}", scope: "district", sev: 0.5, stress: 0.2, danger: 0.1, radius: 150 },
      { cat: "achievement", desc: "A major achievement is celebrated at ${name}", scope: "localized", sev: 0.3, stress: -0.15, danger: 0, radius: 80 },
      { cat: "innovation", desc: "An exciting discovery is announced at ${name}", scope: "district", sev: 0.4, stress: -0.1, danger: 0, radius: 120 },
    ],
  };

  const templates = eventTemplates[location.type] || eventTemplates.cafe;
  const template = templates[Math.floor(Math.random() * templates.length)];

  // Adjust based on world state
  const tensionBonus = socio.tension * 0.3;
  const stressAdjusted = template.stress + tensionBonus;

  return {
    category: template.cat,
    description: template.desc.replace("${name}", location.name),
    scope: template.scope,
    severity: Math.min(template.sev + socio.tension * 0.2, 1.0),
    duration: 10 + Math.floor(Math.random() * 20),
    stressModifier: stressAdjusted,
    dangerModifier: template.danger,
    affectedRadius: template.radius,
  };
}

/**
 * Calculate natural event probability based on location and world state
 * This is the "natural algorithm" for event triggering
 */
export function calculateEventProbability(
  location: Location,
  worldState: {
    socioEconomic: {
      prosperity: number;
      stability: number;
      happiness: number;
      tension: number;
      scarcity: number;
    };
    currentTime: number;
    population: number;
  },
  npcsAtLocation: number
): number {
  const socio = worldState.socioEconomic;

  // Base probability (very low)
  let probability = 0.05;  // 5% base chance per tick

  // Time modulation (events more likely during peak hours)
  const hour = 8 + Math.floor(worldState.currentTime / 60);
  if (hour >= 12 && hour <= 18) {
    probability *= 1.5;  // Afternoon/evening boost
  }

  // Population density at location (more people = more events)
  const densityFactor = Math.min(npcsAtLocation / 5, 2.0);  // Cap at 2x
  probability *= (1 + densityFactor);

  // World state influences
  probability *= (1 + socio.tension * 0.5);  // Tension increases events
  probability *= (1 + socio.scarcity * 0.3); // Scarcity causes events
  probability *= (2 - socio.stability);      // Low stability = more events

  // Low population = fewer events
  if (worldState.population < 5) {
    probability *= 0.3;
  }

  return Math.min(probability, 0.4);  // Cap at 40% max
}
