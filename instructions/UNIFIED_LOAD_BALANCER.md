# Unified Load Balancer for Multiple AI Providers

The unified load balancer supports distributing AI inference requests across multiple provider types:
- **Ollama** (local GPU servers)
- **Groq** (cloud API)

## Features

### 1. Mixed Provider Support
- Route requests to both local Ollama servers and Groq cloud API
- Each provider has its own adapter handling API differences
- Transparent interface - same request format for all providers

### 2. Weighted Distribution
- Configure load distribution with weights (e.g., 70% Groq, 30% Ollama)
- Example: Use fast Groq for most requests, Ollama for overflow

### 3. Automatic Fallback
- If Groq rate limits or fails, automatically retry with Ollama
- Health monitoring for all providers
- Marks unhealthy providers and routes to healthy ones

### 4. Cost Optimization
- Use expensive cloud API (Groq) strategically
- Fall back to free local GPU (Ollama) when needed
- Configurable weights based on your cost/performance needs

### 5. Environment Agnostic
- Works with or without Groq API key
- Automatically disables Groq if no API key is set
- Pure Ollama mode when running offline

## Configuration

### Basic Setup

The load balancer is configured in [ollamaLoadBalancer.ts](convex/ollamaLoadBalancer.ts#L311-L357).

#### Default Configuration (Ollama Only)
```typescript
// When no Groq API key is provided
getLoadBalancer(); // Uses 100% Ollama
```

#### Groq + Ollama Configuration
```typescript
// Set GROQ_API_KEY environment variable in Convex:
// npx convex env set GROQ_API_KEY your_api_key_here

// In your Convex function:
const apiKey = process.env.GROQ_API_KEY;
getLoadBalancer(apiKey); // Uses 70% Groq, 30% Ollama
```

### Custom Configuration

Edit [ollamaLoadBalancer.ts](convex/ollamaLoadBalancer.ts#L324-L353) to customize:

```typescript
const servers = [];

// Option 1: Groq-heavy (70% cloud, 30% local)
if (apiKey) {
  servers.push({
    url: "groq",
    name: "Groq Cloud",
    type: "groq",
    weight: 0.7, // 70% of requests
    model: "llama-3.3-70b-versatile",
  });
}
servers.push({
  url: "http://localhost:11434",
  name: "Local Ollama",
  type: "ollama",
  weight: 0.3, // 30% of requests
});

// Option 2: Multiple Ollama servers + Groq
servers.push({
  url: "http://100.97.106.7:11434",
  name: "Mac GPU",
  type: "ollama",
  weight: 0.2, // 20% to Mac
});
servers.push({
  url: "http://localhost:11434",
  name: "Windows GPU",
  type: "ollama",
  weight: 0.3, // 30% to Windows
});
if (apiKey) {
  servers.push({
    url: "groq",
    name: "Groq Cloud",
    type: "groq",
    weight: 0.5, // 50% to Groq
  });
}

// Option 3: Groq-only (pure cloud)
if (apiKey) {
  servers.push({
    url: "groq",
    name: "Groq Cloud",
    type: "groq",
    weight: 1.0, // 100% cloud
  });
}
```

## Usage Examples

### In Convex Functions

```typescript
import { ollamaLoadBalancer } from "./ollamaLoadBalancer";

// Generate text using load balancer
const result = await ollamaLoadBalancer.generate({
  model: "qwen2.5:3b", // Model name (Ollama format)
  prompt: "Generate a short thought for an NPC...",
  stream: false,
  options: {
    temperature: 0.9,
    num_predict: 30,
  },
  timeout: 20000, // Optional: 20s timeout
});

if (result) {
  console.log(`Response: ${result.response}`);
  console.log(`Served by: ${result.server}`); // "Groq Cloud" or "Local Ollama"
}
```

### With API Key Injection

```typescript
import { getLoadBalancer } from "./ollamaLoadBalancer";

export default async function myConvexFunction(ctx) {
  // Get API key from Convex environment
  const apiKey = process.env.GROQ_API_KEY;

  // Initialize load balancer with Groq support
  const loadBalancer = getLoadBalancer(apiKey);

  const result = await loadBalancer.generate({
    model: "qwen2.5:3b",
    prompt: "Your prompt here...",
    stream: false,
    options: {
      temperature: 0.9,
      num_predict: 30,
    },
  });

  return result?.response || "Fallback response";
}
```

### Check Statistics

```typescript
import { ollamaLoadBalancer } from "./ollamaLoadBalancer";

// Get load balancer statistics
const stats = ollamaLoadBalancer.getStats();
console.log(stats);

// Example output:
// [
//   {
//     name: "Groq Cloud",
//     url: "groq",
//     healthy: true,
//     weight: 0.7,
//     totalRequests: 142,
//     successfulRequests: 138,
//     failedRequests: 4,
//     successRate: "97.2%",
//     avgResponseTime: "1250ms",
//     activeRequests: 2
//   },
//   {
//     name: "Local Ollama",
//     url: "http://localhost:11434",
//     healthy: true,
//     weight: 0.3,
//     totalRequests: 58,
//     successfulRequests: 58,
//     failedRequests: 0,
//     successRate: "100.0%",
//     avgResponseTime: "850ms",
//     activeRequests: 0
//   }
// ]

// Log statistics (human-readable)
ollamaLoadBalancer.logStats();
```

## Provider Adapters

### Architecture

The system uses a provider adapter pattern to abstract different APIs:

```
┌─────────────────────────────────────────┐
│      Unified Load Balancer              │
│  (ollamaLoadBalancer.ts)                │
└──────────────┬──────────────────────────┘
               │
       ┌───────┴───────┐
       │               │
       ▼               ▼
┌─────────────┐ ┌─────────────┐
│   Ollama    │ │    Groq     │
│  Adapter    │ │   Adapter   │
└──────┬──────┘ └──────┬──────┘
       │               │
       ▼               ▼
┌─────────────┐ ┌─────────────┐
│   Ollama    │ │  Groq API   │
│  /api/gen   │ │  OpenAI fmt │
└─────────────┘ └─────────────┘
```

### Provider Interface

All providers implement `IProviderAdapter`:

```typescript
interface IProviderAdapter {
  readonly name: string;
  readonly type: "ollama" | "groq";

  generate(request: ProviderRequest): Promise<ProviderResponse>;
  checkHealth(): Promise<ProviderHealth>;
  getEndpoint(): string;
}
```

### Adding a New Provider

To add a new provider (e.g., OpenAI, Anthropic):

1. Create adapter in [providers.ts](convex/providers.ts):

```typescript
export class OpenAIProvider implements IProviderAdapter {
  readonly type = "openai" as const;

  constructor(
    public readonly name: string,
    private readonly apiKey: string,
    private readonly model: string = "gpt-4"
  ) {}

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: request.prompt }],
        temperature: request.temperature,
        max_tokens: request.maxTokens,
      }),
    });

    const data = await response.json();
    return {
      text: data.choices[0].message.content,
      model: data.model,
      provider: `openai:${this.name}`,
    };
  }

  async checkHealth(): Promise<ProviderHealth> {
    // Implementation...
  }

  getEndpoint(): string {
    return "https://api.openai.com/v1/chat/completions";
  }
}
```

2. Update type definitions in [ollamaLoadBalancer.ts](convex/ollamaLoadBalancer.ts):

```typescript
type: "ollama" | "groq" | "openai" // Add new type
```

3. Add to configuration:

```typescript
servers.push({
  url: "openai",
  name: "OpenAI GPT-4",
  type: "openai",
  weight: 0.3,
  model: "gpt-4-turbo",
});
```

## Environment Variables

### Setting Groq API Key

```bash
# In your terminal (from project root):
npx convex env set GROQ_API_KEY your_api_key_here

# Verify it's set:
npx convex env list

# To remove (revert to Ollama-only):
npx convex env unset GROQ_API_KEY
```

### Getting a Groq API Key

1. Visit [console.groq.com](https://console.groq.com)
2. Sign up for a free account
3. Navigate to API Keys section
4. Create a new API key
5. Copy the key and set it in Convex (see above)

**Free Tier Limits:**
- Groq offers generous free tier
- Rate limits: ~30 requests/minute
- Perfect for development and small projects

## Load Balancing Algorithm

### Weighted Round-Robin

The load balancer uses probabilistic weighted selection:

```typescript
// Example: 70% Groq, 30% Ollama
// Random number: 0.0 to 1.0
const random = Math.random(); // e.g., 0.45

let cumulative = 0;
for (const server of healthyServers) {
  cumulative += server.weight; // 0.7, then 1.0
  if (random <= cumulative) {
    return server; // 0.45 <= 0.7, so returns Groq
  }
}
```

### Health Monitoring

- Health checks run every 30 seconds
- Unhealthy providers are skipped during selection
- Failed requests mark provider as unhealthy
- Automatic retry with different provider

### Retry Logic

```
Request → Select Provider (weighted random)
   ↓
Generate with Provider
   ↓
   ├─ Success → Return response
   └─ Failure → Mark unhealthy
        ↓
      Retry with different provider
        ↓
        ├─ Success → Return response
        └─ Failure (max 2 attempts) → Return null
```

## Performance Considerations

### Latency Comparison

| Provider | Avg Latency | Cost | Availability |
|----------|-------------|------|--------------|
| Groq Cloud | 500-1500ms | $$ | 99.9% |
| Local Ollama (GPU) | 300-1000ms | Free | Local only |
| Local Ollama (CPU) | 2000-5000ms | Free | Local only |

### Recommended Configurations

#### Development (Local)
```typescript
// 100% Ollama (no API key needed)
weight: 1.0 for Ollama
```

#### Production (Hybrid)
```typescript
// 70% Groq, 30% Ollama
// Fast cloud with local fallback
Groq weight: 0.7
Ollama weight: 0.3
```

#### Production (Cost-Optimized)
```typescript
// 30% Groq, 70% Ollama
// Use cloud for complex tasks only
Groq weight: 0.3
Ollama weight: 0.7
```

#### Production (High Availability)
```typescript
// Multiple Ollama + Groq
Mac GPU: 0.25
Windows GPU: 0.25
Groq: 0.5
// If Groq fails, still have 50% capacity
```

## Monitoring and Debugging

### Enable Debug Logs

Check [logger.ts](convex/logger.ts) configuration:

```typescript
// Load balancer logs:
// 🔄 Load balancer initialized with 2 servers
// 🎯 Routing request to Groq Cloud (groq) - attempt 1/2
// ✅ Groq Cloud (groq) completed in 1250ms (avg: 1100ms)
// ⚠️ Local Ollama (ollama) request failed: TimeoutError
```

### Common Issues

#### Issue: "No healthy servers available"
**Cause:** All providers are marked unhealthy
**Solution:**
1. Check Ollama is running: `curl http://localhost:11434/api/tags`
2. Verify Groq API key: `npx convex env list`
3. Check network connectivity
4. Review logs for specific errors

#### Issue: "Groq API key not set"
**Cause:** Groq provider initialized without API key
**Solution:**
```bash
npx convex env set GROQ_API_KEY your_key_here
```

#### Issue: High latency with Groq
**Cause:** Network latency to Groq API
**Solution:**
- Increase Groq weight to reduce local GPU load
- Or decrease Groq weight to use more local
- Adjust timeout: `timeout: 30000` in request

#### Issue: Model not found (Ollama)
**Cause:** Model not pulled on Ollama server
**Solution:**
```bash
# On server running Ollama:
ollama pull qwen2.5:3b
ollama list  # Verify model exists
```

## Testing

### Manual Testing

```bash
# Test Ollama connectivity
curl http://localhost:11434/api/tags

# Test Ollama inference
curl http://localhost:11434/api/generate -d '{
  "model": "qwen2.5:3b",
  "prompt": "Say hello",
  "stream": false
}'

# Test Groq API (replace YOUR_KEY)
curl https://api.groq.com/openai/v1/chat/completions \
  -H "Authorization: Bearer YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama-3.3-70b-versatile",
    "messages": [{"role": "user", "content": "Say hello"}],
    "max_tokens": 10
  }'
```

### Load Balancer Test Script

Create `test-unified-lb.ts` in convex folder:

```typescript
import { getLoadBalancer, resetLoadBalancer } from "./ollamaLoadBalancer";

async function testLoadBalancer() {
  const apiKey = process.env.GROQ_API_KEY;

  // Reset to get fresh instance
  resetLoadBalancer();
  const lb = getLoadBalancer(apiKey);

  console.log("🧪 Testing Unified Load Balancer...\n");

  // Make 10 requests
  for (let i = 0; i < 10; i++) {
    const result = await lb.generate({
      model: "qwen2.5:3b",
      prompt: `Test request ${i + 1}: Say hello briefly`,
      stream: false,
      options: {
        temperature: 0.7,
        num_predict: 10,
      },
    });

    if (result) {
      console.log(`✅ Request ${i + 1}: ${result.server} - "${result.response}"`);
    } else {
      console.log(`❌ Request ${i + 1}: Failed`);
    }
  }

  console.log("\n📊 Final Statistics:");
  lb.logStats();
}

testLoadBalancer().catch(console.error);
```

Run with: `npx tsx test-unified-lb.ts`

## Migration Guide

### From Old Groq/Ollama Toggle

**Before:**
```typescript
const USE_GROQ = false;
const USE_LOAD_BALANCER = true;

if (USE_GROQ) {
  // Call Groq API directly
} else if (USE_LOAD_BALANCER) {
  // Use Ollama load balancer
}
```

**After:**
```typescript
import { getLoadBalancer } from "./ollamaLoadBalancer";

// Automatically handles both Groq and Ollama
const apiKey = process.env.GROQ_API_KEY; // Optional
const lb = getLoadBalancer(apiKey);

const result = await lb.generate({...});
```

### Benefits of Migration

1. **Simpler Code:** One code path for all providers
2. **Automatic Fallback:** No manual error handling needed
3. **Better Performance:** Weighted distribution optimizes latency
4. **Easy to Extend:** Add new providers without changing calling code
5. **Environment-Aware:** Works in dev (local) and prod (cloud) seamlessly

## Advanced Configuration

### Dynamic Weight Adjustment

You can implement dynamic weights based on load:

```typescript
// In getLoadBalancer():
const stats = lb.getStats();
const groqServer = stats.find(s => s.name === "Groq Cloud");

if (groqServer && groqServer.activeRequests > 5) {
  // Groq is busy, shift more to Ollama
  groqServer.weight = 0.4;
  ollamaServer.weight = 0.6;
}
```

### Provider-Specific Models

Configure different models per provider:

```typescript
servers.push({
  url: "groq",
  name: "Groq Cloud",
  type: "groq",
  weight: 0.7,
  model: "llama-3.3-70b-versatile", // Groq's fast model
});

servers.push({
  url: "http://localhost:11434",
  name: "Local Ollama",
  type: "ollama",
  weight: 0.3,
  model: "qwen2.5:3b", // Local lightweight model
});
```

### Cost Tracking

Add cost tracking to provider responses:

```typescript
// In ProviderResponse interface:
export interface ProviderResponse {
  text: string;
  model: string;
  tokensUsed?: number;
  provider: string;
  cost?: number; // Add cost in USD
}

// In GroqProvider.generate():
const costPerToken = 0.00001; // Example rate
return {
  text: data.choices[0].message.content,
  model: data.model,
  tokensUsed: data.usage.total_tokens,
  provider: `groq:${this.name}`,
  cost: data.usage.total_tokens * costPerToken,
};
```

## Summary

The unified load balancer provides:

✅ **Multi-provider support** - Ollama + Groq in one system
✅ **Weighted distribution** - Control load split (70/30, etc.)
✅ **Automatic fallback** - If one fails, use another
✅ **Cost optimization** - Use cloud strategically
✅ **Environment agnostic** - Works with or without API keys
✅ **Health monitoring** - Automatic provider health checks
✅ **Easy to extend** - Add new providers with adapters
✅ **Production-ready** - Retry logic, error handling, monitoring

## Related Files

- [ollamaLoadBalancer.ts](convex/ollamaLoadBalancer.ts) - Main load balancer
- [providers.ts](convex/providers.ts) - Provider adapters
- [ai.ts](convex/ai.ts) - Usage examples
- [logger.ts](convex/logger.ts) - Logging configuration
