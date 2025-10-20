// ==============================================
// STEP 1: Import all the tools we need
// ==============================================

// Express: A framework that helps us create a web server easily
import express from 'express';

// node-fetch: A tool to make requests to other websites/APIs (like calling Groq)
import fetch from 'node-fetch';

// dotenv: Loads secret keys from a .env file (keeps secrets safe, not in code)
import dotenv from 'dotenv';

// These help us find the correct file paths on your computer
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ==============================================
// STEP 2: Set up file paths
// ==============================================

// __filename: The full path to THIS file (server.js)
const __filename = fileURLToPath(import.meta.url);

// __dirname: The folder that contains THIS file
const __dirname = dirname(__filename);

// ==============================================
// STEP 3: Load secret keys from .env file
// ==============================================

// This loads your GROQ_API_KEY from the .env file
// The .env file keeps your API key secret (never share it!)
dotenv.config({ path: join(__dirname, '.env') });

// ==============================================
// STEP 4: Create the server
// ==============================================

// Create a new Express app (this is our web server)
const app = express();

// The server will listen on port 3001 (like a phone number for computers)
// You'll access it at: http://localhost:3001
const PORT = 3001;

// ==============================================
// STEP 5: Set up middleware (helpers)
// ==============================================

// This lets our server understand JSON data in requests
// (JSON is a format for sending data, like { "name": "Alex" })
app.use(express.json());

// ==============================================
// STEP 6: Enable CORS (Cross-Origin Resource Sharing)
// ==============================================

// CORS is like a security guard that decides which websites can talk to your server
// This middleware allows your game (running on a different port) to talk to this server
app.use((req, res, next) => {

  // Allow requests from ANY website (the * means "anyone")
  // In production, you'd want to restrict this to your game's URL only
  res.header('Access-Control-Allow-Origin', '*');

  // Allow the request to include JSON data (Content-Type header)
  res.header('Access-Control-Allow-Headers', 'Content-Type');

  // Allow POST requests (for sending data) and OPTIONS (for permission checks)
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');

  // OPTIONS is a "preflight" request - the browser asking "can I make this request?"
  // We just say "yes" (200 means OK)
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  // next() means "continue to the next step" (process the actual request)
  next();
});

// ==============================================
// STEP 7: The main endpoint - Generate NPC dialogue
// ==============================================

// This endpoint listens for POST requests to /api/chat
// POST means "send data to the server" (vs GET which is "get data from the server")
// async means this function can wait for things (like AI responses) without freezing
app.post('/api/chat', async (req, res) => {
  try {
    const { npcName, personality, memories, nearbyNPC, situation, currentTime } = req.body;

    if (!npcName || !nearbyNPC) {
      return res.status(400).json({ error: 'Missing required fields: npcName, nearbyNPC' });
    }

    // Build memory context
    const memoryContext = memories && memories.length > 0
      ? memories.slice(-5).map(m => `- ${m.text}`).join('\n')
      : '- No recent memories';

    // Build situation-specific instructions
    let contextInstructions = '';
    if (situation === 'cafe_invite') {
      contextInstructions = 'You are inviting them to a café meetup at 18:00 (6 PM). Be friendly and casual.';
    } else if (situation === 'cafe_mention') {
      contextInstructions = 'You already know about the café meetup at 18:00. Mention it casually.';
    } else {
      contextInstructions = 'Make casual small talk about coding, projects, or daily life.';
    }

    // Build the system prompt
    const systemPrompt = `You are ${npcName}, an NPC in HackTown, a game about indie hackers and builders.

Your personality: ${personality || 'friendly, casual'}

Your recent memories:
${memoryContext}

Current situation: It's ${currentTime || 'daytime'}. You're near ${nearbyNPC}.

${contextInstructions}

Generate ONE SHORT dialogue line (maximum 12 words). Be natural and conversational. No quotes or formatting.`;

    // Call Ollama API - Using local GPU (RTX 5090)
    const selectedServer = 'http://localhost:11434';
    const modelName = 'qwen2.5:3b';

    console.log(`🤖 Calling Ollama (${modelName}) on Local GPU (RTX 5090)`);
    console.log(`   → Server: ${selectedServer}`);

    const startTime = Date.now();
    const ollamaResponse = await fetch(`${selectedServer}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelName, // Fast non-thinking model (was qwen3:8b)
        prompt: systemPrompt + '\n\nDialogue:',
        stream: false,
        options: {
          temperature: 0.8,
          num_predict: 30,
        }
      })
    });

    if (!ollamaResponse.ok) {
      throw new Error(`Ollama API error: ${ollamaResponse.status}`);
    }

    const ollamaData = await ollamaResponse.json();
    const dialogue = ollamaData.response?.trim().split('\n')[0] || '...';
    const inferenceTime = Date.now() - startTime;

    console.log(`   ✅ Generated in ${inferenceTime}ms: "${dialogue}"`);

    res.json({ dialogue, npcName, nearbyNPC });

  } catch (error) {
    console.error('❌ Ollama error:', error.message);
    console.error('   → Falling back to default response');
    // Fallback to simple response
    return res.json({
      dialogue: "...",
      npcName: req.body.npcName || "NPC",
      nearbyNPC: req.body.nearbyNPC || "someone",
      fallback: true
    });
  }

  /* ORIGINAL GROQ CODE - KEPT FOR REFERENCE

  /* GROQ API ENDPOINT - COMMENTED OUT FOR LOCAL USE
  try {
    // ==============================================
    // STEP 7A: Extract the data sent from the game
    // ==============================================

    // req.body contains all the data the game sent us
    // We're "destructuring" it to get specific pieces of information
    const { npcName, personality, memories, nearbyNPC, situation, currentTime } = req.body;

    // ==============================================
    // STEP 7B: Make sure we got the essential info
    // ==============================================

    // Check if the game sent us the required information
    // If not, send back an error (status 400 = "bad request")
    if (!npcName || !nearbyNPC) {
      return res.status(400).json({ error: 'Missing required fields: npcName, nearbyNPC' });
    }

    // ==============================================
    // STEP 7C: Build the NPC's memory context
    // ==============================================

    // Take the NPC's memories and format them nicely
    // If they have memories, take the last 5 and format as bullet points
    // If no memories, just say "No recent memories"
    const memoryContext = memories && memories.length > 0
      ? memories.slice(-5).map(m => `- ${m.text}`).join('\n')
      : '- No recent memories';

    // ==============================================
    // STEP 7D: Build situation-specific instructions
    // ==============================================

    // Depending on the situation, we tell the AI how to respond
    let contextInstructions = '';

    // If the NPC is inviting someone to coffee
    if (situation === 'cafe_invite') {
      contextInstructions = 'You are inviting them to a café meetup at 18:00 (6 PM). Be friendly and casual.';
    }
    // If the NPC already knows about the coffee meetup
    else if (situation === 'cafe_mention') {
      contextInstructions = 'You already know about the café meetup at 18:00. Mention it casually.';
    }
    // Default: just make normal conversation
    else {
      contextInstructions = 'Make casual small talk about coding, projects, or daily life.';
    }

    // ==============================================
    // STEP 7E: Build the prompt for the AI
    // ==============================================

    // This is the "instruction manual" we send to the AI
    // It tells the AI who the NPC is, what they remember, and how to respond
    const systemPrompt = `You are ${npcName}, an NPC in HackTown, a game about indie hackers and builders.

Your personality: ${personality || 'friendly, casual'}

Your recent memories:
${memoryContext}

Current situation: It's ${currentTime || 'daytime'}. You're near ${nearbyNPC}.

${contextInstructions}

Generate ONE SHORT dialogue line (maximum 12 words). Be natural and conversational. No quotes or formatting.`;

    // ==============================================
    // STEP 7F: Call the Groq API (the AI service)
    // ==============================================

    // Now we make a request to Groq's AI service
    // "await" means "wait for this to finish before continuing"
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {

      // We're sending data (POST request)
      method: 'POST',

      // Headers are like metadata about our request
      headers: {
        // This is our secret API key (from the .env file)
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,

        // We're sending JSON data
        'Content-Type': 'application/json'
      },

      // The actual data we're sending to Groq
      body: JSON.stringify({
        // Which AI model to use (llama-3.1-8b-instant is fast and good)
        model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',

        // The conversation we're sending to the AI
        messages: [
          // The system message: tells the AI who it is and what to do
          { role: 'system', content: systemPrompt },

          // The user message: the actual request
          { role: 'user', content: 'Generate the dialogue line now.' }
        ],

        // temperature: controls creativity (0 = predictable, 1 = creative)
        // 0.8 is pretty creative, good for dialogue
        temperature: 0.8,

        // max_tokens: maximum length of the response (30 tokens ≈ 20-25 words)
        max_tokens: 30,

        // top_p: another creativity control (0.9 = use top 90% of likely words)
        top_p: 0.9
      })
    });

    // ==============================================
    // STEP 7G: Check if the AI request worked
    // ==============================================

    // If the request failed (status code is not 200-299)
    if (!groqResponse.ok) {
      // Get the error message from Groq
      const errorText = await groqResponse.text();

      // Log it to the console so we can debug
      console.error('Groq API error:', errorText);

      // Send an error back to the game (status 500 = "server error")
      // fallback: true tells the game to use a default dialogue
      return res.status(500).json({ error: 'Groq API request failed', fallback: true });
    }

    // ==============================================
    // STEP 7H: Extract the dialogue from the AI response
    // ==============================================

    // Parse the JSON response from Groq
    const groqData = await groqResponse.json();

    // Extract the actual dialogue text
    // The ?. is "optional chaining" - it safely accesses nested properties
    // If any part is missing, it returns undefined instead of crashing
    // || '' means "if it's undefined, use an empty string instead"
    const dialogue = groqData.choices[0]?.message?.content?.trim() || '';

    // ==============================================
    // STEP 7I: Send the dialogue back to the game
    // ==============================================

    // Send back a JSON response with the dialogue
    res.json({ dialogue, npcName, nearbyNPC });

  } catch (error) {
    // ==============================================
    // STEP 7J: Handle any unexpected errors
    // ==============================================

    // If ANYTHING goes wrong anywhere in the try block, we end up here
    // Log the error so we can see what went wrong
    console.error('Server error:', error);

    // Send an error response back to the game
    // fallback: true tells the game to use a default dialogue
    res.status(500).json({ error: error.message, fallback: true });
  }
  */
});

// ==============================================
// STEP 8: Health check endpoint
// ==============================================

// This is a simple endpoint to check if the server is running
// GET requests to /health will return basic server status
app.get('/health', (req, res) => {

  // Return a JSON response with:
  // - status: 'ok' (server is running)
  // - groqConfigured: true/false (do we have an API key?)
  // The !! converts any value to a boolean (true/false)
  res.json({ status: 'ok', groqConfigured: !!process.env.GROQ_API_KEY });
});

// ==============================================
// STEP 9: Start the server
// ==============================================

// Tell the server to start listening for requests on port 3001
// When it's ready, run the function inside the () => { }
app.listen(PORT, () => {

  // Print some friendly messages to the console so you know it's working
  console.log(`🚀 NPC Dialogue server running on http://localhost:${PORT}`);
  console.log(`🤖 Using Ollama (gemma3:27b) on http://localhost:11434`);
  console.log(`📡 Groq API: Disabled (using local Ollama instead)`);
});

// ==============================================
// SUMMARY: What this server does
// ==============================================

// 1. Your game sends NPC info (name, personality, memories) to /api/chat
// 2. This server builds a prompt telling the AI who the NPC is
// 3. The server sends that prompt to Groq's AI service
// 4. Groq generates a short dialogue line (like "Hey! Working on anything cool?")
// 5. The server sends that dialogue back to your game
// 6. Your game displays it as a speech bubble above the NPC

// Why use a server instead of calling Groq directly from the game?
// - Security: Keeps your API key secret (not visible in browser)
// - Control: You can modify responses, add caching, or switch AI providers easily
// - Cost management: You can track and limit API usage in one place
