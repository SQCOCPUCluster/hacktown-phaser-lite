# Quick Start: Unified Load Balancer

Get started with the unified load balancer in 5 minutes.

## TL;DR

The unified load balancer automatically distributes AI requests across **Ollama (local GPU)** and **Groq (cloud API)** with configurable weights and automatic fallback.

## Setup Options

### Option 1: Ollama Only (Default)
Works out of the box - no configuration needed!

```typescript
import { ollamaLoadBalancer } from "./ollamaLoadBalancer";

const result = await ollamaLoadBalancer.generate({
  model: "qwen2.5:3b",
  prompt: "Your prompt here",
  stream: false,
  options: { temperature: 0.9, num_predict: 30 },
});
```

**Uses:** 100% Local Ollama

---

### Option 2: Groq + Ollama (Recommended)
Best of both worlds - fast cloud with local fallback.

**Step 1:** Set Groq API Key
```bash
npx convex env set GROQ_API_KEY your_api_key_here
```

**Step 2:** Use load balancer (same code!)
```typescript
import { ollamaLoadBalancer } from "./ollamaLoadBalancer";

const result = await ollamaLoadBalancer.generate({
  model: "qwen2.5:3b",
  prompt: "Your prompt here",
  stream: false,
  options: { temperature: 0.9, num_predict: 30 },
});
```

**Uses:** 70% Groq Cloud, 30% Local Ollama

---

### Option 3: Custom Configuration
Edit [ollamaLoadBalancer.ts:324-353](convex/ollamaLoadBalancer.ts#L324-L353) to customize weights.

```typescript
// Example: 50/50 split
servers.push({
  url: "groq",
  name: "Groq Cloud",
  type: "groq",
  weight: 0.5, // 50% cloud
});
servers.push({
  url: "http://localhost:11434",
  name: "Local Ollama",
  type: "ollama",
  weight: 0.5, // 50% local
});
```

## Getting a Groq API Key

1. Visit [console.groq.com](https://console.groq.com)
2. Sign up (free)
3. Create API key
4. Copy key
5. Run: `npx convex env set GROQ_API_KEY your_key`

**Free tier:** ~30 requests/minute (perfect for development)

## Testing

### Test Ollama Connectivity
```bash
curl http://localhost:11434/api/tags
```

### Test Load Balancer
```bash
node test-unified-load-balancer.js
```

### Check Statistics
```typescript
import { ollamaLoadBalancer } from "./ollamaLoadBalancer";

ollamaLoadBalancer.logStats();
// Output:
// 📊 Load Balancer Statistics:
//    Groq Cloud: 7/10 requests (70.0% success) - avg 1200ms - ✅
//    Local Ollama: 3/10 requests (100.0% success) - avg 850ms - ✅
```

## Configuration Examples

### Development (Local Only)
```typescript
// No Groq API key set
// Uses: 100% Ollama
```

### Production (Cloud-First)
```typescript
// Groq API key set
// Default: 70% Groq, 30% Ollama
// Benefit: Fast response times, automatic fallback
```

### Production (Cost-Optimized)
```typescript
// Edit ollamaLoadBalancer.ts:
weight: 0.3 for Groq  // 30% cloud
weight: 0.7 for Ollama // 70% local
// Benefit: Lower API costs, still have cloud backup
```

### Production (High Availability)
```typescript
// Add multiple Ollama servers:
servers.push({
  url: "http://localhost:11434",
  name: "Windows GPU",
  type: "ollama",
  weight: 0.3,
});
servers.push({
  url: "http://100.97.106.7:11434",
  name: "Mac GPU",
  type: "ollama",
  weight: 0.2,
});
if (apiKey) {
  servers.push({
    url: "groq",
    name: "Groq Cloud",
    type: "groq",
    weight: 0.5,
  });
}
// Total: 50% Groq, 50% local (split across 2 GPUs)
```

## How It Works

### Weighted Distribution
```
Request arrives
    ↓
Random number: 0.45 (example)
    ↓
Cumulative weights:
  • Groq: 0.0 → 0.7 (70%)  ← 0.45 falls here
  • Ollama: 0.7 → 1.0 (30%)
    ↓
Routes to Groq Cloud
```

### Automatic Fallback
```
Request → Groq Cloud
    ↓
  Groq fails (rate limit)
    ↓
  Mark Groq unhealthy
    ↓
  Retry with Local Ollama
    ↓
  Success! ✅
```

## Common Use Cases

| Use Case | Configuration | Benefit |
|----------|--------------|---------|
| **Development** | 100% Ollama | Free, works offline |
| **Production** | 70% Groq, 30% Ollama | Fast + reliable |
| **Cost-Sensitive** | 30% Groq, 70% Ollama | Lower API costs |
| **High Traffic** | Multiple Ollama + Groq | Distributed load |
| **Offline-First** | 100% Ollama (no API key) | No external dependencies |

## Monitoring

### Check Health
```typescript
await ollamaLoadBalancer.checkHealth();
// Checks all providers, marks unhealthy ones
```

### View Statistics
```typescript
const stats = ollamaLoadBalancer.getStats();
console.log(stats);
// Returns array with per-provider metrics
```

### Enable Debug Logs
Logs show which provider handles each request:
```
🎯 Routing request to Groq Cloud (groq) - attempt 1/2
✅ Groq Cloud (groq) completed in 1250ms (avg: 1100ms)
```

## Troubleshooting

### "No healthy servers available"
**Fix:** Check Ollama is running
```bash
curl http://localhost:11434/api/tags
# If fails: ollama serve
```

### "Groq API key not set"
**Fix:** Set the environment variable
```bash
npx convex env set GROQ_API_KEY your_key_here
```

### High latency
**Adjust weights** to prefer faster provider:
- If Groq is slow: Decrease Groq weight
- If Ollama is slow: Increase Groq weight

### Model not found
**Pull the model:**
```bash
ollama pull qwen2.5:3b
```

## Migration from Old Code

### Before (Manual Toggle)
```typescript
const USE_GROQ = false;
const USE_LOAD_BALANCER = true;

if (USE_GROQ) {
  // Groq API call
  const response = await fetch("https://api.groq.com/...", {...});
  // ...
} else if (USE_LOAD_BALANCER) {
  // Ollama load balancer call
  const result = await ollamaLoadBalancer.generate({...});
  // ...
}
```

### After (Unified)
```typescript
import { ollamaLoadBalancer } from "./ollamaLoadBalancer";

// Automatically handles both Groq and Ollama
const result = await ollamaLoadBalancer.generate({
  model: "qwen2.5:3b",
  prompt: "Your prompt",
  stream: false,
  options: { temperature: 0.9, num_predict: 30 },
});

if (result) {
  console.log(result.response);
  console.log(`Served by: ${result.server}`); // "Groq Cloud" or "Local Ollama"
}
```

**Benefits:**
- ✅ One code path for all providers
- ✅ Automatic fallback built-in
- ✅ No manual if/else logic
- ✅ Environment-aware (dev vs prod)

## Next Steps

1. **Read Full Documentation:** [UNIFIED_LOAD_BALANCER.md](UNIFIED_LOAD_BALANCER.md)
2. **View Implementation:** [ollamaLoadBalancer.ts](convex/ollamaLoadBalancer.ts)
3. **See Provider Adapters:** [providers.ts](convex/providers.ts)
4. **Run Tests:** `node test-unified-load-balancer.js`

## Key Files

| File | Purpose |
|------|---------|
| [providers.ts](convex/providers.ts) | Provider adapters (Ollama, Groq) |
| [ollamaLoadBalancer.ts](convex/ollamaLoadBalancer.ts) | Main load balancer logic |
| [ai.ts](convex/ai.ts) | Usage in NPC thought generation |
| [UNIFIED_LOAD_BALANCER.md](UNIFIED_LOAD_BALANCER.md) | Full documentation |
| [test-unified-load-balancer.js](test-unified-load-balancer.js) | Test script |

## Summary

🎯 **Single API** for multiple providers
⚖️ **Weighted distribution** (70/30, custom, etc.)
🔄 **Automatic fallback** on failure
📊 **Built-in monitoring** and statistics
🌍 **Environment-aware** (dev/prod)
⚡ **Production-ready** error handling
