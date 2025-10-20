# Test Scripts

Testing utilities and scripts for HackTown Phaser Lite.

## Load Balancer Tests

### [test-unified-load-balancer.js](test-unified-load-balancer.js)
Test script for the unified load balancer (Ollama + Groq).

**Usage:**
```bash
# Default: 10 requests, auto-detect Groq API key
node test/test-unified-load-balancer.js

# Custom number of requests
node test/test-unified-load-balancer.js --requests 20

# Provide Groq API key
node test/test-unified-load-balancer.js --groq-key YOUR_API_KEY
```

**Tests:**
- Provider health checks
- Weighted distribution
- Automatic fallback
- Performance metrics
- Error handling

### [test-load-balancer.sh](test-load-balancer.sh)
Original Bash script for testing Ollama multi-GPU setup.

**Usage:**
```bash
# Test both Mac and Windows GPUs
bash test/test-load-balancer.sh

# Custom hosts
bash test/test-load-balancer.sh --mac-host localhost --win-host 100.97.106.7

# Custom model
bash test/test-load-balancer.sh --model qwen3:8b

# Custom timeout
bash test/test-load-balancer.sh --timeout 60
```

**Tests:**
- GPU connectivity
- Model availability
- Inference performance
- Network latency

### [test-gpu-routing.js](test-gpu-routing.js)
Node.js script to test GPU routing with weighted distribution.

**Usage:**
```bash
node test/test-gpu-routing.js
```

**Tests:**
- Weighted routing (70/30 split)
- Multiple GPU servers
- Success/failure tracking
- Response time monitoring

## Running All Tests

```bash
# Test unified load balancer (Ollama + Groq)
node test/test-unified-load-balancer.js

# Test Ollama multi-GPU setup
bash test/test-load-balancer.sh

# Test GPU routing logic
node test/test-gpu-routing.js
```

## Prerequisites

- **Ollama:** Must be running on localhost:11434 (or custom host)
- **Models:** qwen2.5:3b, qwen3:8b (or custom models)
- **Groq API Key:** Optional, for testing unified load balancer with Groq
- **Node.js:** v18+ for JavaScript tests
- **Bash:** For shell script tests (Git Bash on Windows)

## Common Issues

### "Connection refused" on Ollama
**Fix:** Start Ollama server
```bash
ollama serve
```

### "Model not found"
**Fix:** Pull the required model
```bash
ollama pull qwen2.5:3b
```

### "Groq API error"
**Fix:** Check API key is valid
```bash
# Set in environment
export GROQ_API_KEY=your_key_here

# Or pass as argument
node test/test-unified-load-balancer.js --groq-key your_key_here
```
