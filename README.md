# HackTown 🏘️

> **A living, breathing simulation where AI-powered NPCs think, remember, and interact autonomously in real-time.**

Originally built in 12 hours as an emergent AI experiment, now upgraded with an **emergent physics layer** that lets crowds respond to hunger, danger, and trauma without extra LLM calls. Each NPC has a unique personality, makes decisions with LLM reasoning for dialogue, remembers past interactions, and lives a full lifecycle from birth to death.

## 🎥 Demo

[Demo Video Coming Soon]

**Watch NPCs**:
- 🧠 Think contextually based on personality and memories
- 💬 Have organic conversations and spread gossip
- 😊😐😞 Change color based on mood (green=happy, red=stressed, blue=sad)
- 👶👴 Grow from young (small) to elder (large)
- ⚰️ Die from age, stress, or dangerous events
- 🎭 React to world events (villains, festivals, storms)
- 🌡️ Flow along simulated heat, food, and trauma fields that diffuse across town
- 🌀 Self-organize via utility-driven crowd physics and emotional contagion

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Convex
```bash
npx convex dev
```
This will prompt you to create a Convex account (free) and set up your project.

### 3. Set up Groq API Key
1. Get a free API key from [Groq Console](https://console.groq.com)
2. Add it to your Convex environment:
```bash
npx convex env set GROQ_API_KEY your_api_key_here
```

### 4. Seed the World (Optional)
```bash
npx convex run seed:seedWorld
```
This creates initial NPCs and world state.

### 5. Run the Game
```bash
npm run dev
```
Open the printed localhost URL. Arrow keys / WASD to move. Watch NPCs think, talk, and live their lives!

---

## 🎮 Keyboard Controls

| Key | Action |
|-----|--------|
| `Arrow Keys` / `WASD` | Move player character |
| `D` | Toggle conversation range debug circles |
| `V` | Stress 30% of NPCs (test red visual effect) |
| `H` | Make 40% of NPCs happy (test green visual effect) |
| `R` | Reset all NPCs to neutral colors |
| `F` | Toggle scalar field overlay (heat / food / trauma) |
| `T` | Inject a trauma plume for visualization (debug) |
| `K` | Force a crisis event on a random NPC (stress test) |
| `L` | Print NPC psychology table to the console |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                  PHASER (Frontend)                  │
│   - Rendering NPCs, landmarks, speech bubbles      │
│   - Smooth interpolation & visual effects          │
│   - Dashboard UI & thought panel                   │
└─────────────────┬───────────────────────────────────┘
                  │ Real-time WebSocket sync
┌─────────────────▼───────────────────────────────────┐
│               CONVEX (Backend)                      │
│   - Real-time database (entities, events, etc.)    │
│   - Cron jobs: worldTick, aiThinkTick, godTick     │
│   - Mutations: spawn NPCs, start conversations     │
└─────────────────┬───────────────────────────────────┘
                  │
         ┌────────┴────────┐
         │                 │
┌────────▼─────┐  ┌────────▼────────┐
│  GROQ LLM    │  │   MEM0 CLOUD    │
│ (Reasoning)  │  │   (Memory)      │
│ llama-3.3    │  │ Gossip chains   │
└──────────────┘  └─────────────────┘
```

### Data Flow

1. **World Tick** (every 3 seconds): Move NPCs, age them, update positions
2. **AI Think Tick** (every 8 seconds): 3-5 random NPCs generate thoughts with Groq LLM
3. **God Tick** (every 2 minutes): Spawn new NPCs or trigger events (villains, festivals)
4. **Reaper Tick** (every 30 seconds): Check for deaths based on age/health/stress
5. **Conversation Tick** (every 5 seconds): Check for nearby NPCs and start conversations

---

## ✨ Emergent Physics Layer

- **Scalar fields (heat / food / trauma)**: `convex/fields.ts` maintains a 30x17 grid that diffuses danger, decays heat, regrows food, and lets trauma linger where bad things happened. NPCs sample these fields every tick to decide where to go.
- **Utility-driven agents**: `convex/drives.ts` replaces LLM movement with hunger, loneliness, curiosity, fear, and faith drives. The best-scoring drive sets a new target while still leaving dialogue to Groq/Mem0.
- **Crowd dynamics**: Separation penalties, herd alarms, and emotional contagion translate local crowd density into organic flocking and clustering. Heat spikes from overcrowded cafés push people outward instead of stacking.
- **Trauma ecology**: Violent or despair events raise trauma fields that decay slowly, feeding back into the dark psychology system in `convex/darkDrives.ts`. Churches become natural refuges as despair climbs.
- **Maintenance loops**: Scheduled jobs diffuse fields, evaporate heat, and rebuild food density so the town breathes over time. Press `F` in-game to visualize the fields, or `T` to paint a trauma cloud instantly.

---

## 🧠 How It Works
### Personality System (6 Traits)

Each NPC is born with randomized personality traits (0-1 scale):

| Trait | Low | High |
|-------|-----|------|
| **Curiosity** | Stays in comfort zone | Explores actively |
| **Empathy** | Self-focused | Helps others |
| **Boldness** | Cautious, risk-averse | Daring, seeks thrills |
| **Order** | Spontaneous | Likes routine |
| **Mood** | Pessimistic | Optimistic |
| **Weirdness** | Conventional | Eccentric |

Personality influences:
- **Movement decisions**: Curious NPCs explore edges, social NPCs cluster at café
- **Conversation style**: Empathetic NPCs ask about feelings, bold NPCs make jokes
- **Stress response**: High-order NPCs panic during chaos, bold NPCs thrive on it

### AI Decision-Making

NPCs use **Groq's Llama 3.3 70B** model for contextual reasoning:

1. **Context gathering**: Retrieve recent memories from Mem0, check nearby NPCs/events
2. **Prompt construction**: Include personality traits, location, time of day, mood, stress
3. **LLM inference**: Generate thought + action (e.g., "I should check on the café meetup")
4. **Action execution**: Move toward target, start conversation, or idle
5. **Memory storage**: Save thought and action to Mem0 for future recall

Movement now flows through the physics layer—utility scores turn those thoughts into concrete destinations that respect danger, hunger, and social pressure.

**Fallback mode**: If Groq API fails, NPCs still generate movements through drives and can fall back to rule-based chatter.

### Utility Drives & Crowd Physics

- Hunger, loneliness, curiosity, fear, safety, and faith compete each tick; the winner picks a new target (café, park, friends, church, or a safe random spot).
- Heat and trauma fields actively repel NPCs while food gradients pull them in, producing simmering hotspots around crises or long lines at the café.
- Crowding reduces the desire to socialize (boids-style separation) and raises local heat, forcing self-regulating queues and stampedes during panic.
- Emotional contagion averages nearby mood, so one meltdown can drag an entire square toward despair until relief arrives.

### Memory & Gossip

- **Mem0 Cloud** stores semantic memories for each NPC
- When NPCs converse, they **distort gossip** (90% accuracy) to simulate telephone game
- Memories include: conversations, events witnessed, location visits, emotional reactions
- LLM retrieves top 3-5 relevant memories when making decisions

### Socio-Economic World State

The dashboard tracks global metrics calculated from all NPCs:

- **Prosperity**: Average health + inverse population pressure
- **Stability**: Inverse of active events + inverse average stress
- **Happiness**: Average mood + health
- **Tension**: Average stress + active dangerous events
- **Scarcity**: Population pressure + danger level

These metrics create "emotional weather" that affects the whole world's vibe.

### Mortality System

Death probability calculated per tick using:
- **Age risk**: Sigmoid curve (young safe, old risky)
- **Starvation risk**: Health below 30% increases risk
- **Stress risk**: Chronic stress shortens lifespan
- **Danger risk**: Active villain events increase local mortality

NPCs live 10-30 minutes on average (configurable).

---

## 📊 Dashboard Guide

**Top-Left HUD**:
- Current time (simulation minutes)
- Agent count (alive NPCs)

**Top-Right Dashboard**:
- **Population**: Alive / Births / Deaths
- **Activity**: Time elapsed / Total AI thoughts generated
- **Metrics**: ASCII progress bars for prosperity, stability, happiness, tension, scarcity

**Bottom Panel**:
- **Nearby Thoughts**: Shows thoughts from NPCs within 200px of player (closest first)

---

## 🎨 Visual Language

| Color | Meaning |
|-------|---------|
| 🟢 Green | Happy (mood > 0.65) |
| 🔵 Blue | Sad (mood < 0.35) |
| 🔴 Red | Stressed (stress > 0.5) |
| ⚫ Black triangle | Villain (with red pulsing glow) |
| ⚪ White triangle | Hero (with gold pulsing glow) |

| Size | Meaning |
|------|---------|
| Small | Young (age < 3000 ticks) |
| Normal | Adult |
| Large | Elder (age > 12000 ticks) |

---

## 🛠️ Tech Stack

- **[Phaser 3](https://phaser.io/)**: Game engine for rendering and animation
- **[Vite](https://vitejs.dev/)**: Fast dev server and build tool
- **[Convex](https://www.convex.dev/)**: Real-time backend with automatic sync
- **[Groq](https://groq.com/)**: Fast LLM inference (llama-3.3-70b-versatile)
- **[Mem0](https://mem0.ai/)**: Semantic memory and context management
- **TypeScript**: Backend type safety
- **JavaScript**: Frontend game logic

---

## 📁 Project Structure

```
hacktown-phaser-lite/
├── convex/                      # Backend (Convex functions)
│   ├── schema.ts                # Database schema (entities, events, memories, etc.)
│   ├── tick.ts                  # Cron jobs (worldTick, aiThinkTick, reaperTick)
│   ├── godEvents.ts             # God agent (spawns NPCs, triggers events)
│   ├── conversations.ts         # NPC conversation system
│   ├── ai.ts                    # AI integration (uses load balancer)
│   ├── ollamaLoadBalancer.ts    # Unified load balancer (Ollama + Groq)
│   ├── providers.ts             # Provider adapters (Ollama, Groq)
│   ├── memories.ts              # Mem0 memory storage
│   └── worldState.ts            # Global stats and metrics
├── instructions/                # Documentation
│   ├── UNIFIED_LOAD_BALANCER.md # Load balancer guide
│   └── QUICK_START_UNIFIED_LB.md# Quick start guide
├── research&plans/              # Planning docs
│   └── Build plan.md            # Architecture & roadmap
├── test/                        # Test scripts
│   ├── test-unified-load-balancer.js  # Test load balancer
│   ├── test-load-balancer.sh          # Test Ollama GPU setup
│   └── test-gpu-routing.js            # Test GPU routing
├── main.js                      # Frontend (Phaser game logic)
├── index.html                   # HTML + dashboard UI
├── DEMO_SCRIPT.md               # 90-second demo walkthrough
└── README.md                    # This file
```

---

## ☄️ Emergent Physics Status

**Live now**:
- Scalar field grid with diffusion, evaporation, and regrowth (`convex/fields.ts`)
- Utility-score movement that slashes LLM token usage while improving crowd believability (`convex/drives.ts`)
- Trauma feedback loops that bleed into despair/aggression calculations (`convex/darkDrives.ts`)
- Field maintenance and visualization hooks wired into the main tick and client overlay

**In exploration**:
1. Weather-front fields (wind / rain) that push NPCs indoors during storms
2. Cooperative work zones that build temporary prosperity hotspots
3. Persistent memorials that slowly heal trauma fields after major tragedies

---

## 🐛 Troubleshooting

**NPCs not moving**:
- Check Convex dashboard - is `worldTick` cron running?
- Run `npx convex dev` to ensure backend is connected

**No AI thoughts**:
- Verify `GROQ_API_KEY` is set: `npx convex env get GROQ_API_KEY`
- Check Groq API quota at [console.groq.com](https://console.groq.com)
- Fallback mode should still show rule-based behavior

**Dashboard shows zeros**:
- Run `npx convex run worldState:initializeWorld` to initialize world state
- Spawn NPCs: `npx convex run godEvents:spawnNPC` (repeat 5-10 times)

**Speech bubbles not showing**:
- Open browser console - look for conversation logs
- Ensure NPCs are within 80px of each other (press `D` to see debug circles)

**Field overlay is empty**:
- Let `worldTick` run at least once (start Convex + refresh client)
- Confirm `convex/fields` table exists via Convex dashboard or rerun `npx convex run godEvents:spawnNPC` to kick the scheduler
- Check the browser console for field fetch logs (`F` toggles the overlay)

---

## 📝 License

MIT License - feel free to fork, modify, and build upon this!

---

## ⚙️ Configuration Notes

### Unified Load Balancer (NEW!)

The project now features a **unified load balancer** that automatically distributes AI requests across multiple providers:

- **Ollama** (local GPU servers) + **Groq** (cloud API)
- **Weighted distribution** (e.g., 70% Groq, 30% Ollama)
- **Automatic fallback** if one provider fails
- **Zero configuration** - works out of the box!

**Default Behavior:**
- Without Groq API key: Uses 100% Ollama (local)
- With Groq API key: Uses 70% Groq, 30% Ollama (hybrid)

**Quick Start:**
```bash
# Option 1: Local only (no setup needed)
# Uses 100% Ollama

# Option 2: Hybrid (Groq + Ollama)
npx convex env set GROQ_API_KEY your_key_here
# Automatically uses 70% Groq, 30% Ollama
```

**Documentation:**
- 📖 [Full Guide](instructions/UNIFIED_LOAD_BALANCER.md) - Complete documentation
- ⚡ [Quick Start](instructions/QUICK_START_UNIFIED_LB.md) - Get started in 5 minutes
- 🧪 [Testing](test/README.md) - Test scripts and examples

### Current Setup (Legacy)

**Ollama** (local LLM) via **ngrok tunnel** for maximum privacy and cost control:

- **Model**: `llama3.2:3b` (2GB, fast inference)
- **Cost**: $0 (runs on your machine)
- **Speed**: ~2-3 seconds per thought

**Note:** The unified load balancer is now the recommended approach. The legacy setup is still supported for backward compatibility.

### ngrok Setup

Ollama runs locally (port 11434), but Convex backend needs cloud access. ngrok creates a secure tunnel:

```bash
# Start Ollama (if not running)
ollama serve

# Start ngrok tunnel
ngrok http 11434

# Copy the HTTPS URL (e.g., https://xxxx.ngrok.app)
# Update OLLAMA_NGROK_URL in convex/ai.ts
```

**Note**: Free ngrok accounts allow 1 simultaneous tunnel. Paid accounts support multiple.

---

## 🙏 Credits

Built as a 12-hour exploration of emergent AI behavior.

**Inspiration**:
- Westworld's emergent narratives
- The Sims' personality-driven autonomy
- Dwarf Fortress's emergent storytelling

**Tech Stack**:
- [Phaser 3](https://phaser.io/) - Game engine
- [Convex](https://www.convex.dev/) - Real-time backend
- [Ollama](https://ollama.ai/) - Local LLM runtime (llama3.2:3b)
- [ngrok](https://ngrok.com/) - Secure tunneling
- [Groq](https://groq.com/) - Cloud LLM option (llama-3.3-70b)
- [Mem0](https://mem0.ai/) - Semantic memory
