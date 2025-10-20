// Location system - landmarks with event modifiers for emergent behavior
// Each location type influences what kinds of events are more likely to occur there

export interface Location {
  name: string;
  type: string;  // "cafe", "church", "park", "school", etc.
  x: number;
  y: number;
  radius: number;  // Area of influence
  eventModifiers: {
    [category: string]: number;  // Multiplier for event probability (e.g., "cult": 3.0)
  };
  description: string;  // Context for LLM
}

// Define all landmarks in HackTown
export const LOCATIONS: Location[] = [
  {
    name: "Café",
    type: "cafe",
    x: 640,
    y: 305,
    radius: 60,
    eventModifiers: {
      "social_gathering": 2.0,
      "gossip": 3.0,
      "celebration": 1.5,
      "accident": 1.2,
      "romance": 2.5,
      "argument": 1.8,
    },
    description: "A cozy café where people meet, chat, and socialize. Hub of gossip and social events.",
  },
  {
    name: "Park",
    type: "park",
    x: 250,
    y: 180,
    radius: 90,
    eventModifiers: {
      "festival": 2.5,
      "gathering": 2.0,
      "crime": 0.8,
      "nature_event": 2.0,
      "exercise": 1.5,
      "meditation": 1.5,
    },
    description: "An open green space for recreation, festivals, and outdoor activities.",
  },
  {
    name: "School",
    type: "school",
    x: 730,
    y: 115,
    radius: 80,
    eventModifiers: {
      "education": 3.0,
      "gathering": 1.5,
      "protest": 1.8,
      "achievement": 2.0,
      "bullying": 1.5,
      "innovation": 1.8,
    },
    description: "An educational institution where learning, gatherings, and youth culture happen.",
  },
  {
    name: "Church",
    type: "church",
    x: 150,
    y: 380,
    radius: 70,
    eventModifiers: {
      // === SPIRITUAL EMERGENT BEHAVIORS ===
      "cult": 3.5,              // Cult formation (highest probability)
      "religious": 3.0,         // Religious ceremonies
      "miracle": 2.5,           // Miracle claims
      "prophecy": 2.8,          // Prophetic visions
      "devotion": 3.2,          // Devotional gatherings

      // === DARK EMERGENT BEHAVIORS ===
      "scandal": 2.0,           // Church scandals
      "conspiracy": 2.2,        // Religious conspiracies
      "fanaticism": 2.7,        // Extreme devotion
      "heresy": 2.3,            // Heretical movements
      "inquisition": 2.0,       // Witch hunts/purges

      // === SOCIAL EMERGENT BEHAVIORS ===
      "gathering": 2.0,         // Congregation meetings
      "confession": 2.5,        // Confession/therapy sessions
      "charity": 2.2,           // Charitable events
      "pilgrimage": 1.8,        // Pilgrim arrivals
      "conversion": 2.4,        // Religious conversions

      // === PSYCHOLOGICAL EFFECTS ===
      "salvation": 2.6,         // Redemption stories
      "guilt": 2.3,             // Guilt manifestation
      "enlightenment": 2.0,     // Spiritual awakening
      "possession": 1.5,        // Demonic possession claims
    },
    description: "A sacred place of worship where faith, devotion, and spirituality converge. NPCs seeking meaning, redemption, or community gather here. Can inspire profound transformation, healing, fanaticism, or cult formation. Stressed NPCs may find solace or spiral into religious extremism.",
  },
];

// Utility: Find which location (if any) a point is within
export function findLocationAtPoint(x: number, y: number): Location | null {
  for (const loc of LOCATIONS) {
    const distance = Math.sqrt((x - loc.x) ** 2 + (y - loc.y) ** 2);
    if (distance <= loc.radius) {
      return loc;
    }
  }
  return null;
}

// Utility: Get all locations sorted by distance from a point
export function getNearbyLocations(x: number, y: number, maxDistance: number = 200): Location[] {
  return LOCATIONS
    .map((loc) => ({
      location: loc,
      distance: Math.sqrt((x - loc.x) ** 2 + (y - loc.y) ** 2),
    }))
    .filter(({ distance }) => distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance)
    .map(({ location }) => location);
}

// Utility: Get event probability modifier for a category at a location
export function getEventModifier(location: Location | null, category: string): number {
  if (!location) return 1.0;  // No modifier for events outside landmarks
  return location.eventModifiers[category] || 1.0;
}

// Utility: Pick a random location (weighted by size/importance)
export function getRandomLocation(): Location {
  return LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
}
