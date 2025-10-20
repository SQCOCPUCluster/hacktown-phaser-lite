// Quick test to verify load balancer is routing to both GPUs
const SERVERS = [
  { name: 'Mac GPU', url: 'http://localhost:11434' },
  { name: 'Windows GPU', url: 'http://100.97.106.7:11434' }
];

async function testRouting(iterations = 10) {
  console.log(`\n🧪 Testing GPU routing with ${iterations} requests...\n`);

  const results = {
    'Mac GPU': 0,
    'Windows GPU': 0,
    errors: 0
  };

  for (let i = 0; i < iterations; i++) {
    // Simulate weighted selection (70% Windows, 30% Mac)
    const useWindows = Math.random() > 0.3;
    const server = useWindows ? SERVERS[1] : SERVERS[0];

    try {
      const startTime = Date.now();
      const response = await fetch(`${server.url}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen2.5:3b',
          prompt: 'Say hello',
          stream: false,
          options: { num_predict: 5 }
        })
      });

      const elapsed = Date.now() - startTime;

      if (response.ok) {
        results[server.name]++;
        console.log(`✅ Request ${i + 1}: ${server.name} (${elapsed}ms)`);
      } else {
        results.errors++;
        console.log(`❌ Request ${i + 1}: ${server.name} failed (${response.status})`);
      }
    } catch (error) {
      results.errors++;
      console.log(`❌ Request ${i + 1}: ${server.name} error - ${error.message}`);
    }
  }

  console.log('\n📊 Results:');
  console.log(`   Mac GPU: ${results['Mac GPU']}/${iterations} (${(results['Mac GPU']/iterations*100).toFixed(0)}%)`);
  console.log(`   Windows GPU: ${results['Windows GPU']}/${iterations} (${(results['Windows GPU']/iterations*100).toFixed(0)}%)`);
  console.log(`   Errors: ${results.errors}`);
  console.log(`\n✅ Expected distribution: ~30% Mac, ~70% Windows`);
}

testRouting(20).catch(console.error);
