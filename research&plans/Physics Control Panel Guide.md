# Physics Control Panel

Interactive dashboard for tuning Hacktown's emergence parameters in real-time and visualizing how the physics system reveals itself through emergent behavior patterns.

## 🎯 What Is This?

The Physics Control Panel exposes the invisible mathematical rules that drive NPC behavior, allowing you to:

- **Tune emergence parameters** with live sliders (decay rates, diffusion speeds, psychology weights)
- **Watch patterns emerge** through real-time metrics (how many NPCs are seeking food, fleeing danger, etc.)
- **Experiment with presets** to create extreme world conditions (peaceful utopia, harsh survival, volatile chaos)
- **Visualize spatial fields** (heat/food/trauma overlays on the game canvas)
- **Stress test the system** by injecting events and observing behavioral responses

## 🚀 Quick Start

### 1. Launch the Game
```bash
npm run dev
```

### 2. Open the Physics Control Panel
Open `physics-controls.html` in your browser:
```
file:///C:/Users/.../hacktown-phaser-lite/physics-controls.html
```

Or serve it alongside the game:
```bash
# The panel will auto-connect to http://127.0.0.1:3210 (Convex local dev)
```

### 3. Experiment!
- Drag sliders to adjust parameters
- Click "Auto Refresh" to see live metrics update every 5 seconds
- Try preset scenarios to see dramatic behavioral shifts
- Toggle field visualizations in the game (press `F` key)

---

## 📊 Control Panels Explained

### 🎯 Drive Weights
Control how strongly each need influences NPC decision-making:

| Parameter | Default | Description |
|-----------|---------|-------------|
| **Hunger Weight** | 0.70 | How much food scarcity drives behavior |
| **Social Weight** | 0.60 | How much loneliness drives social seeking |
| **Safety Weight** | 0.80 | How much danger drives fleeing behavior |
| **Exploration Weight** | 0.30 | How much curiosity drives wandering |

**Experiment**: Set hunger to `0.1` and social to `0.9` → NPCs ignore food, cluster desperately → mass starvation but happy crowds

---

### ⏱️ Drive Decay Rates
How fast NPCs get hungry, lonely, and stressed:

| Parameter | Default | Description |
|-----------|---------|-------------|
| **Energy Decay (Moving)** | 0.010 | Hunger rate while walking |
| **Energy Decay (Still)** | 0.005 | Hunger rate while idle |
| **Social Decay** | 0.003 | Loneliness accumulation rate |
| **Safety Decay** | 0.002 | Stress recovery rate |

**Experiment**: Crank energy decay to `0.05` → NPCs starve rapidly → panic rush to café → food competition spikes

---

### 🌊 Field Diffusion Rates
How quickly spatial fields spread to neighboring grid cells:

| Parameter | Default | Description |
|-----------|---------|-------------|
| **Heat Diffusion** | 0.12 | Danger spread speed (smoke-like) |
| **Food Diffusion** | 0.05 | Resource spread (stays localized) |
| **Trauma Diffusion** | 0.08 | PTSD spread (medium) |

**Visual Feedback**: Color-coded bar graphs show spread speed relative to max

**Experiment**: Heat diffusion to `0.3` → Danger spreads like wildfire → entire map becomes red → everyone flees to corners

---

### 💨 Field Evaporation Rates
How fast fields decay/fade over time:

| Parameter | Default | Description |
|-----------|---------|-------------|
| **Heat Evaporation** | 0.020 | How long danger lingers |
| **Food Evaporation** | 0.010 | How fast food decays |
| **Trauma Evaporation** | 0.005 | How long psychological scars last (very slow) |
| **Food Regrowth** | 0.002 | Resource regeneration at cafés |

**Experiment**: Trauma evaporation to `0.05` → NPCs forget trauma quickly → reckless behavior near danger zones

---

### 🌑 Dark Psychology Weights
How isolation/starvation/trauma contribute to despair and aggression:

| Parameter | Default | Description |
|-----------|---------|-------------|
| **Isolation → Despair** | 0.35 | Loneliness contribution to suicidal ideation |
| **Starvation → Despair** | 0.30 | Hunger contribution to despair |
| **Trauma → Despair** | 0.25 | PTSD contribution to despair |
| **Max Suicide Probability** | 0.08% | Ceiling for suicide attempts (when despair = 1.0) |
| **Max Violence Probability** | 0.04% | Ceiling for murder attempts (when aggression = 1.0) |

**Experiment**: Isolation weight to `0.8` → Loneliness becomes lethal → NPCs die from solitude

---

## 📈 Live Emergence Metrics

Real-time dashboard showing **emergent patterns** from the physics simulation:

```
NPCs Seeking Food:      23 / 50 (46%)  ← How many are hunting for resources
NPCs Socializing:       12 / 50 (24%)  ← How many are seeking companionship
NPCs Fleeing Danger:     8 / 50 (16%)  ← How many are avoiding heat zones

Avg Heat (Danger):      0.34 ⚠️ HIGH    ← Overall danger level across map
Avg Food Availability:  0.62 ✓ OK      ← Overall resource abundance
Avg Trauma Load:        0.18 ⚠️ RISING  ← Psychological scarring intensity

NPCs in Despair (>0.7): 3              ← At-risk for suicide
High Aggression (>0.6): 5              ← At-risk for violence
```

**Auto-Refresh**: Click "Auto (5s)" to poll metrics every 5 seconds and watch numbers shift as you adjust sliders

---

## 🎬 Preset Scenarios

Pre-configured settings to demonstrate extreme emergence:

### 🕊️ Peaceful
- Slow decay rates
- High food regrowth
- Fast trauma evaporation
- **Result**: Utopia - NPCs thrive with minimal stress

### ⚡ Harsh World
- Fast decay rates
- Low food regrowth
- Slow trauma evaporation
- **Result**: Survival struggle - deaths cluster, despair rises

### 🌪️ Volatile
- Fast field diffusion
- Slow evaporation
- **Result**: Chaos lingers - danger spreads explosively, takes forever to dissipate

### 🏚️ Isolated
- High loneliness decay
- High isolation weight
- **Result**: Social desperation - NPCs cluster intensely, avoid being alone

### ⚙️ Default
- Resets all parameters to original balanced values

### 🧪 Experimental
- **Randomizes ALL sliders**
- **Result**: Total chaos - unpredictable emergent behavior

---

## 👁️ Field Visualization

Toggle spatial field overlays on the game canvas:

| Button | Field | Color | Shows |
|--------|-------|-------|-------|
| **🔥 Heat** | Danger/Conflict | Red gradient | Where violence/crowds/events occurred |
| **🍔 Food** | Resources | Green gradient | Where food is abundant |
| **💀 Trauma** | Psychological scars | Purple gradient | Where traumatic events happened |
| **👁️ All** | Combined | Multi-color | All three overlays at once |

**Hotkey**: Press `F` in the game to toggle field overlays

### Field Injection (Testing)

Inject test values to observe field dynamics:

- **🔥 Heat Spike**: Creates danger blob at center, watch it diffuse/evaporate, observe NPCs fleeing
- **💀 Trauma Plume**: Injects PTSD zone, NPCs avoid area for extended period
- **🍔 Food Boost**: Adds resources, NPCs converge and compete

---

## 🧪 Stress Tests

Trigger events to observe emergent behavior responses:

| Test | Effect |
|------|--------|
| **😊 Make 50% Happy** | Mood boost spreads via emotional contagion |
| **😰 Stress 50%** | NPCs become anxious, seek safety, avoid danger |
| **🍽️ Mass Starvation** | Set all energy to 0.1, panic rush to café |
| **🎉 Spawn Festival** | Positive event, NPCs gather and celebrate |
| **💥 Spawn Villain** | Heat field explodes, NPCs flee in waves |
| **🦸 Spawn Hero** | Villain neutralized, safety restored, NPCs return |

### Danger Zone

- **⚠️ Reset All NPCs**: Resets drives/personality to defaults
- **🗑️ Clear Fields**: Wipes all heat/food/trauma (blank slate)

---

## 🔬 Experimental Workflows

### Workflow 1: "Observe Crowd Panic"
1. Set heat diffusion to `0.25` (fast spread)
2. Set heat evaporation to `0.01` (lingers long)
3. Click "Spawn Villain"
4. Toggle "🔥 Heat" visualization
5. Watch: Red zone expands rapidly → NPCs scatter → danger persists for 2+ minutes

### Workflow 2: "Test Starvation Cascade"
1. Set energy decay (moving) to `0.03` (very fast)
2. Set food regrowth to `0.0005` (minimal)
3. Click "Auto Refresh" metrics
4. Watch: "NPCs Seeking Food" climbs to 80%+ → despair rises → deaths increase

### Workflow 3: "Create Utopia"
1. Click "🕊️ Peaceful" preset
2. Set all psychology weights to `0.0` (immune to despair)
3. Set food regrowth to `0.01` (abundant)
4. Watch: Zero deaths, happiness climbs, everyone socializes

### Workflow 4: "Isolation Experiment"
1. Set social decay to `0.02` (rapid loneliness)
2. Set isolation weight to `0.8` (lethal)
3. Watch: NPCs desperately cluster → "NPCs Socializing" spikes → despair still rises if alone

---

## 🛠️ Architecture

### Frontend (physics-controls.html)
- Standalone HTML page with embedded JavaScript
- Uses Convex HTTP client to communicate with backend
- Real-time slider updates → instant Convex mutations
- Metrics polling via Convex queries

### Backend (Convex)

#### New Table: `physicsConfig`
```typescript
{
  key: string,           // e.g., "heat-diffusion"
  value: number,         // e.g., 0.12
  category: string,      // e.g., "field_dynamics"
  description: string,   // Human-readable
  lastUpdated: number,   // Timestamp
}
```

#### New Mutations
- `updatePhysicsParam(key, value)` - Update single parameter
- `updateMultiplePhysicsParams(updates[])` - Batch update
- `resetPhysicsConfig()` - Reset to defaults

#### New Queries
- `getPhysicsParam(key)` - Get single parameter
- `getAllPhysicsParams()` - Get all as key-value map
- `getEmergenceMetrics()` - Calculate live NPC behavior stats

### Integration Points
**TODO (Future Work)**:
- Update `drives.ts` to read weights from `physicsConfig` table
- Update `fields.ts` to read diffusion/evaporation rates from config
- Update `darkDrives.ts` to read psychology weights from config
- Update `tick.ts` to read decay rates from config

**Currently**: Parameters are adjustable in the database, but the game still uses hardcoded constants. Full integration requires refactoring the physics files to query the config table.

---

## 🎮 Tips for Exploration

1. **Start with Presets**: Try "Peaceful" vs "Harsh World" to see dramatic contrasts
2. **Use Auto-Refresh**: Turn on 5-second metrics polling to see real-time feedback
3. **Adjust One Slider at a Time**: Isolate effects to understand each parameter
4. **Toggle Field Viz**: Press `F` in game to see spatial patterns
5. **Inject Fields**: Test diffusion/evaporation by injecting heat/trauma
6. **Watch for Cascades**: Small parameter changes can cause emergent chain reactions

---

## 🐛 Troubleshooting

### Panel shows "Disconnected"
- Check that Convex dev server is running (`npm run dev`)
- Verify URL matches: `http://127.0.0.1:3210` (or your VITE_CONVEX_URL)

### Metrics show "--"
- Click "🔄 Refresh" to manually fetch data
- Check browser console for errors
- Ensure world is initialized (NPCs spawned)

### Sliders don't affect game
- **Expected**: Currently sliders update the database, but game logic still uses hardcoded constants
- **Future**: Physics files need refactoring to read from `physicsConfig` table

### Field visualization not showing
- Press `F` key in the game window (not the control panel)
- Check that fields are initialized (wait 10+ seconds after launch)

---

## 📝 Future Enhancements

- [ ] Wire physics files to read from `physicsConfig` table (make sliders actually affect gameplay)
- [ ] Add field visualization toggle buttons in control panel (send commands to game)
- [ ] Export/import custom presets as JSON
- [ ] Add historical graphs showing parameter changes over time
- [ ] Real-time field heatmaps rendered directly in control panel
- [ ] NPC psychology table (show despair/aggression for each NPC)
- [ ] Parameter conflict warnings (e.g., "Low food + fast hunger = mass death")

---

## 🔗 Related Files

- [../convex/physicsConfig.ts](../convex/physicsConfig.ts) - Backend config management
- [../convex/schema.ts](../convex/schema.ts) - Database schema (physicsConfig table)
- [../convex/drives.ts](../convex/drives.ts) - Utility-driven decision system
- [../convex/fields.ts](../convex/fields.ts) - Spatial field dynamics
- [../convex/darkDrives.ts](../convex/darkDrives.ts) - Dark psychology calculations
- [../convex/tick.ts](../convex/tick.ts) - Main simulation loop
- [../physics-controls.html](../physics-controls.html) - Control panel interface

---

**Made with ⚙️ for exploring emergent behavior in Hacktown**
