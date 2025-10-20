#!/usr/bin/env node

/**
 * Test Script for Unified Load Balancer
 * Tests Ollama + Groq integration with weighted distribution
 *
 * Usage:
 *   node test-unified-load-balancer.js
 *   node test-unified-load-balancer.js --requests 20
 *   node test-unified-load-balancer.js --groq-key YOUR_API_KEY
 */

const args = process.argv.slice(2);
const numRequests = parseInt(args[args.indexOf('--requests') + 1] || '10', 10);
const groqApiKey = args[args.indexOf('--groq-key') + 1] || process.env.GROQ_API_KEY;

console.log('🧪 Unified Load Balancer Test\n');
console.log('Configuration:');
console.log(`  • Requests: ${numRequests}`);
console.log(`  • Groq API Key: ${groqApiKey ? '✅ Set' : '❌ Not set (Ollama only)'}`);
console.log('');

// Simulated provider adapters (similar to actual implementation)
class OllamaProvider {
  constructor(name, url) {
    this.name = name;
    this.url = url;
    this.type = 'ollama';
  }

  async generate(prompt) {
    const response = await fetch(`${this.url}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen2.5:3b',
        prompt,
        stream: false,
        options: { temperature: 0.7, num_predict: 20 },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama HTTP ${response.status}`);
    }

    const data = await response.json();
    return {
      text: data.response,
      provider: `ollama:${this.name}`,
    };
  }

  async checkHealth() {
    try {
      const response = await fetch(`${this.url}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      return { healthy: response.ok };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }
}

class GroqProvider {
  constructor(name, apiKey) {
    this.name = name;
    this.apiKey = apiKey;
    this.type = 'groq';
  }

  async generate(prompt) {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 20,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return {
      text: data.choices[0].message.content,
      provider: `groq:${this.name}`,
    };
  }

  async checkHealth() {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(5000),
      });
      return { healthy: response.ok };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }
}

// Simulated load balancer
class LoadBalancer {
  constructor(servers) {
    this.servers = servers.map(s => ({
      ...s,
      healthy: true,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalResponseTime: 0,
    }));
  }

  async checkHealth() {
    console.log('🏥 Checking provider health...');
    for (const server of this.servers) {
      const health = await server.provider.checkHealth();
      server.healthy = health.healthy;
      const status = health.healthy ? '✅' : '❌';
      const errorMsg = health.error ? ` (${health.error})` : '';
      console.log(`   ${status} ${server.name} (${server.type})${errorMsg}`);
    }
    console.log('');
  }

  getNextServer() {
    const healthyServers = this.servers.filter(s => s.healthy);
    if (healthyServers.length === 0) return null;

    // Weighted round-robin
    const random = Math.random();
    let cumulative = 0;

    for (const server of healthyServers) {
      cumulative += server.weight;
      if (random <= cumulative) {
        return server;
      }
    }

    return healthyServers[0];
  }

  async generate(prompt) {
    const maxRetries = 2;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const server = this.getNextServer();
      if (!server) {
        throw new Error('No healthy servers available');
      }

      try {
        server.totalRequests++;
        const startTime = Date.now();

        const result = await server.provider.generate(prompt);

        const elapsed = Date.now() - startTime;
        server.successfulRequests++;
        server.totalResponseTime += elapsed;

        return {
          text: result.text,
          server: server.name,
          provider: server.type,
          latency: elapsed,
        };
      } catch (error) {
        server.failedRequests++;
        server.healthy = false;
        console.log(`   ⚠️ ${server.name} failed: ${error.message}`);
        continue;
      }
    }

    throw new Error('All attempts failed');
  }

  getStats() {
    return this.servers.map(s => ({
      name: s.name,
      type: s.type,
      healthy: s.healthy,
      weight: (s.weight * 100).toFixed(0) + '%',
      totalRequests: s.totalRequests,
      successfulRequests: s.successfulRequests,
      failedRequests: s.failedRequests,
      successRate: s.totalRequests > 0
        ? ((s.successfulRequests / s.totalRequests) * 100).toFixed(1) + '%'
        : 'N/A',
      avgResponseTime: s.successfulRequests > 0
        ? (s.totalResponseTime / s.successfulRequests).toFixed(0) + 'ms'
        : 'N/A',
    }));
  }
}

// Main test function
async function runTest() {
  // Configure servers
  const servers = [];

  if (groqApiKey) {
    servers.push({
      name: 'Groq Cloud',
      type: 'groq',
      weight: 0.7, // 70% of requests
      provider: new GroqProvider('Groq Cloud', groqApiKey),
    });
  }

  servers.push({
    name: 'Local Ollama',
    type: 'ollama',
    weight: groqApiKey ? 0.3 : 1.0, // 30% if Groq available, 100% otherwise
    provider: new OllamaProvider('Local Ollama', 'http://localhost:11434'),
  });

  // Initialize load balancer
  const lb = new LoadBalancer(servers);

  console.log('🔄 Load Balancer Configuration:');
  servers.forEach(s => {
    const weight = (s.weight * 100).toFixed(0);
    console.log(`   • ${s.name} (${s.type}) - ${weight}% weight`);
  });
  console.log('');

  // Health check
  await lb.checkHealth();

  // Make requests
  console.log(`📤 Making ${numRequests} requests...\n`);

  const prompts = [
    'Say hello',
    'What is AI?',
    'Describe a sunset',
    'Tell a joke',
    'Explain quantum physics briefly',
    'What is love?',
    'Describe happiness',
    'What is time?',
    'Explain gravity',
    'What is consciousness?',
  ];

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < numRequests; i++) {
    const prompt = prompts[i % prompts.length];

    try {
      const result = await lb.generate(prompt);
      successCount++;

      const serverDisplay = result.server.padEnd(15);
      const latencyDisplay = `${result.latency}ms`.padStart(6);
      const responsePreview = result.text.slice(0, 50).replace(/\n/g, ' ');

      console.log(`${i + 1}. ${serverDisplay} ${latencyDisplay} "${responsePreview}..."`);
    } catch (error) {
      failCount++;
      console.log(`${i + 1}. ❌ Failed: ${error.message}`);
    }
  }

  console.log('');
  console.log('📊 Test Results:');
  console.log(`   • Successful: ${successCount}/${numRequests} (${((successCount / numRequests) * 100).toFixed(1)}%)`);
  console.log(`   • Failed: ${failCount}/${numRequests}`);
  console.log('');

  console.log('📈 Provider Statistics:');
  const stats = lb.getStats();
  stats.forEach(s => {
    console.log(`   ${s.name} (${s.type}):`);
    console.log(`      Weight: ${s.weight}`);
    console.log(`      Requests: ${s.successfulRequests}/${s.totalRequests} (${s.successRate} success)`);
    console.log(`      Avg Latency: ${s.avgResponseTime}`);
    console.log(`      Health: ${s.healthy ? '✅ Healthy' : '❌ Unhealthy'}`);
    console.log('');
  });

  // Verify distribution matches weights
  if (stats.length > 1 && successCount > 0) {
    console.log('📉 Weight Distribution Analysis:');
    stats.forEach(s => {
      const expectedWeight = parseFloat(s.weight);
      const actualWeight = (s.totalRequests / numRequests) * 100;
      const difference = Math.abs(expectedWeight - actualWeight);
      const match = difference < 15 ? '✅' : '⚠️'; // Allow 15% variance
      console.log(`   ${match} ${s.name}: Expected ${expectedWeight.toFixed(0)}%, Got ${actualWeight.toFixed(0)}% (diff: ${difference.toFixed(1)}%)`);
    });
  }
}

// Run the test
runTest().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
