// Dark psychology system - calculates despair, aggression, and emergent dark behaviors
// NPCs can spiral into suicide or violence based on lived conditions

// PSYCHOLOGICAL MODEL CONSTANTS
const ISOLATION_WEIGHT = 0.35;        // Loneliness → despair
const STARVATION_WEIGHT = 0.30;       // Hunger → despair
const CHRONIC_STRESS_THRESHOLD = 0.6; // When stress becomes chronic
const TRAUMA_TO_DESPAIR = 0.25;       // How much trauma feeds despair
const EMPATHY_BUFFER = 0.20;          // Empathy reduces suicide risk

const CORNERED_WEIGHT = 0.35;         // Danger → aggression (fight response)
const FRUSTRATED_WEIGHT = 0.25;       // Stress → aggression
const TRAUMA_TO_AGGRESSION = 0.20;    // Traumatized people can become violent
const LOW_EMPATHY_WEIGHT = 0.25;      // Lack of empathy enables violence
const DESPERATION_THRESHOLD = 0.7;    // Starvation makes people dangerous

// ACTION PROBABILITIES (per tick)
const SUICIDE_BASE_RATE = 0.0008;     // 0.08% max per tick when despair = 1.0
const MURDER_BASE_RATE = 0.0004;      // 0.04% max per tick when aggression = 1.0

/**
 * Calculate despair level (suicidal ideation)
 * Based on: isolation, starvation, chronic stress, trauma, hopelessness
 * Buffered by: empathy (thinking of others reduces suicide)
 */
export function calculateDespair(
  npc: any,
  worldTime: number
): number {
  // Loneliness compounds exponentially
  const social = npc.social ?? 0.5;
  const isolation = Math.pow(1 - social, 2) * ISOLATION_WEIGHT;

  // Hunger desperation
  const energy = npc.energy ?? 0.7;
  const starvation = Math.pow(1 - energy, 2) * STARVATION_WEIGHT;

  // Chronic stress wears you down
  const stress = npc.stress ?? 0;
  const chronicStress = stress > CHRONIC_STRESS_THRESHOLD ? 0.3 : 0;

  // Trauma load from recent traumatic events
  const traumaLoad = (npc.mentalBreakpoint ?? 0) * TRAUMA_TO_DESPAIR;

  // Hopelessness from low mood
  const mood = npc.personality.mood ?? 0.5;
  const hopelessness = (1 - mood) * 0.25;

  // Empathy provides protection (they think about how it would hurt others)
  const empathy = npc.personality.empathy ?? 0.5;
  const empathyBuffer = empathy * EMPATHY_BUFFER;

  const despair = Math.max(
    0,
    Math.min(
      1.0,
      isolation + starvation + chronicStress + traumaLoad + hopelessness - empathyBuffer
    )
  );

  return despair;
}

/**
 * Calculate aggression level (homicidal tendency)
 * Based on: danger (cornered), frustration, trauma, dark personality, desperation
 */
export function calculateAggression(
  npc: any,
  worldTime: number
): number {
  // Fight response when cornered/unsafe
  const safety = npc.safety ?? 0.5;
  const cornered = (1 - safety) * CORNERED_WEIGHT;

  // Stress/frustration
  const stress = npc.stress ?? 0;
  const frustrated = stress * FRUSTRATED_WEIGHT;

  // Trauma can make people violent
  const traumatized = (npc.mentalBreakpoint ?? 0) * TRAUMA_TO_AGGRESSION;

  // Low empathy enables violence
  const empathy = npc.personality.empathy ?? 0.5;
  const darkPersonality = (1 - empathy) * LOW_EMPATHY_WEIGHT;

  // Boldness = willingness to act on dark impulses
  const boldness = npc.personality.boldness ?? 0.5;
  const willingToAct = boldness * 0.15;

  // Starvation makes people desperate/dangerous
  const energy = npc.energy ?? 0.7;
  const desperation = energy < DESPERATION_THRESHOLD ? 0.25 : 0;

  const aggression = Math.min(
    1.0,
    cornered + frustrated + traumatized + darkPersonality + willingToAct + desperation
  );

  return aggression;
}

/**
 * Process trauma memories and calculate mental breakpoint
 * PTSD model: trauma severity increases over time as it's processed
 */
export function processTrauma(
  npc: any,
  worldTime: number
): number {
  const traumaMemories = npc.traumaMemories ?? [];

  if (traumaMemories.length === 0) {
    // Gradual recovery if no trauma
    const currentBreakpoint = npc.mentalBreakpoint ?? 0;
    return Math.max(0, currentBreakpoint - 0.01);
  }

  let traumaLoad = 0;

  // Only count recent trauma (last 100 simulation minutes)
  const recentTraumas = traumaMemories.filter(
    (t: any) => worldTime - t.timestamp < 100
  );

  for (const trauma of recentTraumas) {
    // Trauma severity increases over time (intrusive thoughts, PTSD)
    const timeSince = worldTime - trauma.timestamp;
    const timeMultiplier = 1 + timeSince * 0.008; // Grows 0.8% per minute
    const traumaWeight = trauma.severity * timeMultiplier;
    traumaLoad += traumaWeight;
  }

  // Mental breakpoint = cumulative trauma / threshold
  // Multiple traumas compound
  const newBreakpoint = Math.min(1.0, traumaLoad / 4);

  return newBreakpoint;
}

/**
 * Check if NPC has crossed mental breakdown threshold
 * Returns personality shifts to apply (empathy drops, weirdness increases)
 */
export function checkMentalBreakdown(
  npc: any
): {
  empathy: number;
  weirdness: number;
  mood: number;
} | null {
  const breakpoint = npc.mentalBreakpoint ?? 0;

  if (breakpoint > 0.7) {
    // Permanent personality damage from trauma
    const currentEmpathy = npc.personality.empathy ?? 0.5;
    const currentWeirdness = npc.personality.weirdness ?? 0.5;
    const currentMood = npc.personality.mood ?? 0.5;

    return {
      empathy: Math.max(0, currentEmpathy - 0.12),   // Numbing/detachment
      weirdness: Math.min(1, currentWeirdness + 0.18), // Erratic behavior
      mood: Math.max(0, currentMood - 0.25),          // Depression
    };
  }

  return null;
}

/**
 * Calculate hope level (counterbalance to despair)
 * Positive experiences can pull NPCs back from the edge
 */
export function calculateHope(
  npc: any,
  recentPositiveMemories: number, // Count of recent positive interactions
  worldTime: number
): number {
  // Basic needs met provides hope
  const energy = npc.energy ?? 0.7;
  const wellFed = energy > 0.7 ? 0.2 : 0;

  const social = npc.social ?? 0.5;
  const socialSupport = social > 0.6 ? 0.3 : 0;

  const safety = npc.safety ?? 0.5;
  const safetyFeeling = safety > 0.5 ? 0.2 : 0;

  // Empathy helps (able to receive support from others)
  const empathy = npc.personality.empathy ?? 0.5;
  const empathyResilience = empathy * 0.2;

  // Recent positive interactions
  const recentPositive = recentPositiveMemories * 0.1;

  const hope =
    wellFed + socialSupport + safetyFeeling + empathyResilience + recentPositive;

  return Math.min(1.0, hope);
}

/**
 * Decide if NPC should attempt suicide this tick
 * Very rare, but emergent from despair level
 */
export function shouldAttemptSuicide(
  despair: number
): boolean {
  // Only possible if despair is very high
  if (despair < 0.75) return false;

  // Probability scales with despair
  const probability = despair * SUICIDE_BASE_RATE;

  return Math.random() < probability;
}

/**
 * Decide if NPC should attempt violence this tick
 * Even rarer than suicide, requires high aggression + opportunity
 */
export function shouldAttemptMurder(
  aggression: number,
  hasNearbyVictim: boolean
): boolean {
  // Must have someone nearby to attack
  if (!hasNearbyVictim) return false;

  // Only possible if aggression is very high
  if (aggression < 0.65) return false;

  // Probability scales with aggression
  const probability = aggression * MURDER_BASE_RATE;

  return Math.random() < probability;
}

/**
 * Add trauma memory to NPC's trauma list
 */
export function addTraumaMemory(
  npc: any,
  trauma: {
    type: string;
    timestamp: number;
    severity: number;
  }
): any[] {
  const existingTraumas = npc.traumaMemories ?? [];
  return [...existingTraumas, trauma];
}