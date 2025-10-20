import Phaser from 'phaser';
import { ConvexHttpClient } from 'convex/browser';
import { logger } from './logger.js';

// Initialize Convex client
const convexUrl = import.meta.env.VITE_CONVEX_URL || "http://127.0.0.1:3210";
const convex = new ConvexHttpClient(convexUrl);

// Expose convex client to browser console for debugging
window.convex = convex;

// Helper function to spawn religious NPCs from console
window.spawnReligiousNPC = async () => {
  return await convex.mutation("entities:spawnReligiousNPC");
};

logger.info('Connecting to Convex at:', convexUrl);
logger.info('💡 Console commands available: spawnReligiousNPC()');

// NPC CLASS - Enhanced with Convex sync
// ============================================================
class NPC {
  constructor(scene, entityData) {
    this.scene = scene;
    this.id = entityData._id;  // Convex ID
    this.name = entityData.name;
    this.color = parseInt(entityData.color);
    this.type = entityData.type || "normal"; // Track NPC type

    // VISUAL PARTS - Different shapes for different types
    if (this.type === "villain") {
      // Black triangle pointing down (menacing)
      this.sprite = scene.add.triangle(
        entityData.x, entityData.y,
        0, 0,      // top point
        -10, 20,   // bottom left
        10, 20,    // bottom right
        0x000000   // black
      ).setOrigin(0.5, 1);
    } else if (this.type === "hero") {
      // White triangle pointing up (heroic)
      this.sprite = scene.add.triangle(
        entityData.x, entityData.y,
        0, 20,     // bottom point
        -10, 0,    // top left
        10, 0,     // top right
        0xFFFFFF   // white
      ).setOrigin(0.5, 1);
    } else if (this.type === "religious") {
      // Religious NPC - cross shape (✝)
      const crossGraphics = scene.add.graphics();
      crossGraphics.fillStyle(this.color, 1);
      // Vertical bar (6px wide, 18px tall)
      crossGraphics.fillRect(-3, -18, 6, 18);
      // Horizontal bar (12px wide, 6px tall, positioned at top third)
      crossGraphics.fillRect(-6, -12, 12, 6);
      crossGraphics.generateTexture('cross_' + this.id, 12, 18);
      crossGraphics.destroy();
      this.sprite = scene.add.image(entityData.x, entityData.y, 'cross_' + this.id).setOrigin(0.5, 1);
    } else {
      // Normal NPC - rectangle
      this.sprite = scene.add.rectangle(entityData.x, entityData.y, 12, 18, this.color).setOrigin(0.5, 1);
    }

    this.label = scene.add.text(entityData.x, entityData.y-22, this.name, { fontSize: '10px', color: '#fff' }).setOrigin(0.5, 1);

    // Speech bubble elements (pixelated retro style)
    this.speechBubble = null;
    this.speechText = null;
    this.speechTimeout = null;
    this.currentConversationId = null;

    // MOVEMENT - sync from Convex (initialize BEFORE creating glow)
    this.pos = new Phaser.Math.Vector2(entityData.x, entityData.y);
    this.target = new Phaser.Math.Vector2(entityData.targetX, entityData.targetY);
    this.speed = entityData.speed || 42;

    // Create pulsing glow animation for special NPCs (AFTER pos is initialized)
    if (this.type === "villain" || this.type === "hero") {
      this.createGlowAnimation();
    }

    // CONVEX STATE
    this.convexData = entityData;
    this.lastDisplayedThought = null; // Track what we've already shown
    this.serverPos = this.pos.clone();
  }

  // Update from Convex data
  syncFromConvex(data) {
    this.convexData = data;
    this.speed = data.speed || this.speed;

    // If server reports a large teleport (e.g., spawn), snap instantly
    const distance = Phaser.Math.Distance.Between(this.pos.x, this.pos.y, data.x, data.y);
    if (distance > 200) {
      this.pos.set(data.x, data.y);
    }

    this.serverPos.set(data.x, data.y);
    this.sprite.x = this.pos.x;
    this.sprite.y = this.pos.y;
    this.label.setPosition(this.pos.x, this.pos.y - 22);

    // Update target if changed
    if (data.targetX !== this.target.x || data.targetY !== this.target.y) {
      this.target.set(data.targetX, data.targetY);
    }

    // Thoughts now displayed in bottom panel, not as bubbles
    this.lastDisplayedThought = data.lastThought;

    // ===== VISUAL FLAIR UPDATES =====
    // Update visual effects based on NPC state
    this.updateVisualEffects(data);
  }

  // Create pulsing glow animation for special NPCs
  createGlowAnimation() {
    // Create a graphics object for the glow effect (circle behind sprite)
    this.glowCircle = this.scene.add.circle(this.pos.x, this.pos.y, 15,
      this.type === "villain" ? 0xFF0000 : 0xFFD700,
      0.3
    );
    this.glowCircle.setDepth(-1); // Render behind sprite

    // Create pulsing animation
    this.scene.tweens.add({
      targets: this.glowCircle,
      alpha: { from: 0.2, to: 0.6 },
      scale: { from: 0.9, to: 1.2 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  // Create special gold glow for protagonist
  createProtagonistGlow() {
    // Create a graphics object for the glow effect (gold circle behind sprite)
    this.glowCircle = this.scene.add.circle(this.pos.x, this.pos.y, 15, 0xFFD700, 0.4);
    this.glowCircle.setDepth(-1); // Render behind sprite

    // Create pulsing animation (slightly different from villain/hero for uniqueness)
    this.scene.tweens.add({
      targets: this.glowCircle,
      alpha: { from: 0.3, to: 0.7 },
      scale: { from: 0.95, to: 1.3 },
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  // Update visual effects based on mood, stress, and age
  updateVisualEffects(data) {
    if (!data.personality) return;

    const mood = data.personality.mood || 0.5;
    const stress = data.stress || 0;
    const age = data.age || 0;
    const despair = data.despair || 0;
    const aggression = data.aggression || 0;
    const traumaCount = data.traumaMemories?.length || 0;

    // Check if this NPC is the protagonist
    const isProtagonist = this.scene.convexProtagonist?.entityId === this.id;

    // DEBUG: Log a sample NPC's stats occasionally
    if (Math.random() < 0.01) {
      logger.debug(`🎨 NPC ${this.name}: mood=${mood.toFixed(2)}, stress=${stress.toFixed(2)}, despair=${despair.toFixed(2)}, age=${age}`);
    }

    // 1. DARK PSYCHOLOGY VISUAL EFFECTS (HIGHEST PRIORITY)
    if (this.type === "normal" && !isProtagonist) {
      let color = this.color; // Default original color
      let colorName = "default";

      // CRISIS STATE - Pulsing dark red glow (despair or aggression high)
      if (despair > 0.7 || aggression > 0.7) {
        color = 0x8B0000; // Dark blood red
        colorName = "DARK RED (CRISIS)";

        // Add pulsing glow effect for crisis
        if (!this.crisisGlow) {
          this.crisisGlow = this.scene.add.circle(this.pos.x, this.pos.y, 20, 0xFF0000, 0.5);
          this.crisisGlow.setDepth(-1);

          this.scene.tweens.add({
            targets: this.crisisGlow,
            alpha: { from: 0.3, to: 0.8 },
            scale: { from: 1.0, to: 1.5 },
            duration: 800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
          });
        }

        logger.warn(`CRISIS: ${this.name} - despair=${despair.toFixed(2)}, aggression=${aggression.toFixed(2)}`);
      } else {
        // Remove crisis glow if no longer in crisis
        if (this.crisisGlow) {
          this.crisisGlow.destroy();
          this.crisisGlow = null;
        }
      }

      // TRAUMATIZED STATE - Purple tint
      if (traumaCount > 0 && despair < 0.7) {
        color = 0x4B0082; // Indigo (traumatized)
        colorName = "PURPLE (traumatized)";
      }

      // AGGRESSIVE STATE - Orange/red
      else if (aggression > 0.5 && aggression < 0.7) {
        color = 0xFF4500; // Orange-red (aggressive)
        colorName = "ORANGE (aggressive)";
      }

      // NORMAL MOOD STATES (only if not in dark psychology state)
      else if (despair < 0.5 && aggression < 0.5) {
        if (stress > 0.5) {
          color = 0xFF6B35; // High stress = Bright red
          colorName = "RED (stressed)";
        } else if (mood > 0.65) {
          color = 0x7ED321; // Happy = Bright green
          colorName = "GREEN (happy)";
        } else if (mood < 0.35) {
          color = 0x4A90E2; // Sad = Blue
          colorName = "BLUE (sad)";
        }
      }

      // DEBUG: Log color changes occasionally
      if (Math.random() < 0.005 && colorName !== "default") {
        logger.debug(`🎨 ${this.name} → ${colorName}`);
      }

      // Update the rectangle fill color
      this.sprite.setFillStyle(color, 1.0);
    }

    // 2. AGE-BASED SCALING
    let scale = 1.0;
    if (isProtagonist) {
      scale = 1.15; // Protagonist is slightly larger for visibility
    } else if (age < 3000) {
      scale = 0.75; // Young/small (more noticeable)
    } else if (age > 12000) {
      scale = 1.3; // Elder/larger (more noticeable)
    }
    this.sprite.setScale(scale);

    // 3. PROTAGONIST SPECIAL EFFECTS
    if (isProtagonist) {
      // Gold color for protagonist
      this.sprite.setFillStyle(0xFFD700, 1.0);
      this.sprite.setStrokeStyle(3, 0xFFAA00, 1.0);

      // Add gold star above name if not already present
      if (!this.protagonistStar) {
        this.protagonistStar = this.scene.add.text(this.pos.x, this.pos.y - 35, '★', {
          fontSize: '16px',
          color: '#FFD700',
          fontFamily: 'Arial',
        });
        this.protagonistStar.setOrigin(0.5);
      }

      // Create protagonist glow if not already present
      if (!this.glowCircle) {
        this.createProtagonistGlow();
      }
    } else {
      // Remove protagonist effects if NPC is no longer protagonist
      if (this.protagonistStar) {
        this.protagonistStar.destroy();
        this.protagonistStar = null;
      }
      if (this.glowCircle && this.type === "normal") {
        this.glowCircle.destroy();
        this.glowCircle = null;
      }
    }

    // 4. SPECIAL NPC GLOW EFFECTS (for villains and heroes)
    if (this.type === "villain") {
      // Thick red stroke for villains
      this.sprite.setStrokeStyle(4, 0xFF0000, 1.0);
      if (!this.glowCircle) {
        this.createGlowAnimation();
      }
    } else if (this.type === "hero") {
      // Thick gold stroke for heroes
      this.sprite.setStrokeStyle(4, 0xFFD700, 1.0);
      if (!this.glowCircle) {
        this.createGlowAnimation();
      }
    }
  }

  update(dt) {
    // Smoothly follow the authoritative server position
    const lerpFactor = Math.min(1, dt * 5); // Higher factor = quicker catch-up
    this.pos.x = Phaser.Math.Linear(this.pos.x, this.serverPos.x, lerpFactor);
    this.pos.y = Phaser.Math.Linear(this.pos.y, this.serverPos.y, lerpFactor);

    // Snap when extremely close to avoid micro jitter
    if (Math.abs(this.pos.x - this.serverPos.x) < 0.1) this.pos.x = this.serverPos.x;
    if (Math.abs(this.pos.y - this.serverPos.y) < 0.1) this.pos.y = this.serverPos.y;

    this.sprite.x = this.pos.x;
    this.sprite.y = this.pos.y;
    this.label.setPosition(this.pos.x, this.pos.y - 22);

    // Update protagonist star position
    if (this.protagonistStar) {
      this.protagonistStar.setPosition(this.pos.x, this.pos.y - 35);
    }

    // Update glow circle position for special NPCs
    if (this.glowCircle) {
      this.glowCircle.setPosition(this.pos.x, this.pos.y);
    }

    // Update crisis glow position for NPCs in crisis
    if (this.crisisGlow) {
      this.crisisGlow.setPosition(this.pos.x, this.pos.y);
    }

    // Update speech bubble position if active (redraw graphics at new position)
    if (this.speechBubble && this.speechText) {
      this.speechText.setPosition(this.pos.x, this.pos.y - 50);
      this.drawSpeechBubbleGraphics(); // Redraw bubble at new position
    }
  }

  // Show a speech bubble with pixel art styling
  showSpeechBubble(text, duration = 2000) {
    // Clear existing bubble
    this.hideSpeechBubble();

    // Create bubble background graphics FIRST (so it renders behind text)
    this.speechBubble = this.scene.add.graphics();

    // Create speech text WITHOUT background (we'll draw it with graphics)
    this.speechText = this.scene.add.text(this.pos.x, this.pos.y - 50, text, {
      fontSize: '9px',
      color: '#000',
      padding: { left: 5, right: 5, top: 3, bottom: 3 },
      fontFamily: '"Departure Mono", "Courier New", monospace',
      wordWrap: { width: 150 }
    }).setOrigin(0.5, 0.5);

    // Now draw the graphics (after text exists so we can get bounds)
    this.drawSpeechBubbleGraphics();

    // Fade in animation for text
    this.speechText.setAlpha(0);
    this.scene.tweens.add({
      targets: this.speechText,
      alpha: 1,
      duration: 200,
      ease: 'Power2'
    });

    // Fade in bubble
    this.speechBubble.setAlpha(0);
    this.scene.tweens.add({
      targets: this.speechBubble,
      alpha: 1,
      duration: 200,
      ease: 'Power2'
    });

    // Auto-hide after duration with fade out
    if (this.speechTimeout) {
      clearTimeout(this.speechTimeout);
    }
    this.speechTimeout = setTimeout(() => {
      // Fade out before hiding
      this.scene.tweens.add({
        targets: [this.speechText, this.speechBubble],
        alpha: 0,
        duration: 300,
        ease: 'Power2',
        onComplete: () => {
          this.hideSpeechBubble();
        }
      });
    }, duration);
  }

  // Helper method to draw speech bubble graphics at current position
  drawSpeechBubbleGraphics() {
    if (!this.speechBubble || !this.speechText) return;

    const bounds = this.speechText.getBounds();

    // Clear previous graphics
    this.speechBubble.clear();

    // Draw white rectangle background with black border
    this.speechBubble.fillStyle(0xffffff, 1);
    this.speechBubble.fillRect(
      bounds.x - 2,
      bounds.y - 2,
      bounds.width + 4,
      bounds.height + 4
    );

    this.speechBubble.lineStyle(3, 0x000000, 1);
    this.speechBubble.strokeRect(
      bounds.x - 2,
      bounds.y - 2,
      bounds.width + 4,
      bounds.height + 4
    );

    // Draw simple triangle tail pointing to NPC
    const tailX = this.pos.x;
    const tailY = bounds.y + bounds.height + 2;

    this.speechBubble.fillStyle(0xffffff, 1);
    this.speechBubble.fillTriangle(
      tailX, tailY + 8,      // bottom point
      tailX - 5, tailY,      // top left
      tailX + 5, tailY       // top right
    );

    this.speechBubble.lineStyle(3, 0x000000, 1);
    this.speechBubble.strokeTriangle(
      tailX, tailY + 8,
      tailX - 5, tailY,
      tailX + 5, tailY
    );
  }

  // Hide speech bubble
  hideSpeechBubble() {
    if (this.speechBubble) {
      this.speechBubble.destroy();
      this.speechBubble = null;
    }
    if (this.speechText) {
      this.speechText.destroy();
      this.speechText = null;
    }
    if (this.speechTimeout) {
      clearTimeout(this.speechTimeout);
      this.speechTimeout = null;
    }
  }

  // Destroy NPC and clean up all visual elements
  destroy() {
    this.hideSpeechBubble();

    if (this.glowCircle) {
      this.glowCircle.destroy();
      this.glowCircle = null;
    }

    if (this.crisisGlow) {
      this.crisisGlow.destroy();
      this.crisisGlow = null;
    }

    if (this.protagonistStar) {
      this.protagonistStar.destroy();
      this.protagonistStar = null;
    }

    if (this.sprite) {
      this.sprite.destroy();
      this.sprite = null;
    }

    if (this.label) {
      this.label.destroy();
      this.label = null;
    }
  }
}

// CONVERSATION MANAGER - Manages speech bubbles for active conversations
// ============================================================
class ConversationManager {
  constructor(scene) {
    this.scene = scene;
    this.activeConversations = new Map(); // convId -> { dialogue, currentIndex, lastUpdate }
  }

  // Update conversations and trigger speech bubbles on NPCs
  update(conversations, npcs) {
    const activeConvIds = new Set();

    if (conversations.length > 0) {
      logger.debug(`💬 ConversationManager: Processing ${conversations.length} conversations`);
    }

    for (const conv of conversations) {
      if (!conv.active) {
        logger.debug(` Skipping inactive conversation`);
        continue;
      }

      if (!conv.dialogue || conv.dialogue.length === 0) {
        logger.debug(` Conversation has no dialogue:`, conv);
        continue;
      }

      activeConvIds.add(conv._id);

      // Get or create conversation state
      let convState = this.activeConversations.get(conv._id);
      if (!convState) {
        convState = {
          dialogue: conv.dialogue,
          currentIndex: 0,
          lastUpdate: Date.now()
        };
        this.activeConversations.set(conv._id, convState);
        logger.info(`New conversation: ${conv.participant1Name} ↔ ${conv.participant2Name} (${conv.dialogue.length} lines)`);

        // FIX: Snap NPCs to server positions when conversation starts
        // This prevents visual desync where NPCs appear far apart due to interpolation lag
        const npc1 = npcs.get(conv.participant1Id);
        const npc2 = npcs.get(conv.participant2Id);

        if (npc1) {
          npc1.pos.set(npc1.serverPos.x, npc1.serverPos.y);
          npc1.sprite.x = npc1.pos.x;
          npc1.sprite.y = npc1.pos.y;
          npc1.label.setPosition(npc1.pos.x, npc1.pos.y - 22);
        }

        if (npc2) {
          npc2.pos.set(npc2.serverPos.x, npc2.serverPos.y);
          npc2.sprite.x = npc2.pos.x;
          npc2.sprite.y = npc2.pos.y;
          npc2.label.setPosition(npc2.pos.x, npc2.pos.y - 22);
        }
      }

      // Check if we should show the next line (every 2 seconds)
      const now = Date.now();
      if (now - convState.lastUpdate > 2000 && convState.currentIndex < conv.dialogue.length) {
        const line = conv.dialogue[convState.currentIndex];

        logger.debug(`Line ${convState.currentIndex + 1}/${conv.dialogue.length}: ${line.speaker} says "${line.text}"`);

        // Find the speaking NPC by ID (not name, to avoid confusion with similar names)
        let speakerNpc = null;

        // Check if this line is from participant1 or participant2
        if (line.speaker === conv.participant1Name) {
          speakerNpc = npcs.get(conv.participant1Id);
        } else if (line.speaker === conv.participant2Name) {
          speakerNpc = npcs.get(conv.participant2Id);
        }

        // Show speech bubble on the correct speaker
        if (speakerNpc) {
          const displayText = `${line.speaker}: "${line.text}"`;
          speakerNpc.showSpeechBubble(displayText, 2000);
          logger.debug(`Showing speech bubble for ${line.speaker} (ID: ${speakerNpc.id})`);
        } else {
          logger.debug(` Could not find NPC: ${line.speaker} (participant IDs: ${conv.participant1Id}, ${conv.participant2Id})`);
        }

        // Move to next line
        convState.currentIndex++;
        convState.lastUpdate = now;
      }
    }

    // Clean up ended conversations
    for (const [convId, state] of this.activeConversations) {
      if (!activeConvIds.has(convId)) {
        this.activeConversations.delete(convId);
        logger.debug(`Conversation ended`);
      }
    }
  }

  destroy() {
    this.activeConversations.clear();
  }
}

// COMMENTARY MANAGER - Streams curated narration to the bottom panel
// ============================================================
class CommentaryManager {
  constructor(scene) {
    this.scene = scene;
    this.techEl = document.getElementById('commentary-tech');
    this.streamEl = document.getElementById('commentary-stream');
    this.queue = [];
    this.timeAccumulator = 0;
    this.displayDelay = 6; // seconds between lines so narration feels paced
    this.maxLines = 20;

    // Track last known values to avoid repeating the same beat
    this.lastPopulation = undefined;
    this.lastBirths = undefined;
    this.lastDeaths = undefined;
    this.lastConversationCount = undefined;
    this.lastAnnouncedTimeBlock = null;
    this.lastSocioSnapshot = null;
    this.lastProtagonistId = null;
    this.lastProtagonistAlive = null;

    this.bootstrap();
  }

  bootstrap() {
    if (this.techEl) {
      this.techEl.textContent = '⚙️ Tech Stack: Phaser 3 • Convex realtime sync • Node.js orchestrator • Groq/Ollama LLM agents';
    }

    this.enqueue('Booting HackTown simulation pipeline…');
    this.enqueue('Phaser sketches the grid while Convex streams fresh NPC state every second.');
    this.enqueue('LLM-driven citizens gossip toward the 6:00 PM café rendezvous.');

    // Show the first line immediately so the panel never sits empty
    if (this.streamEl && this.queue.length > 0) {
      const firstMessage = this.queue.shift();
      this.appendLine(firstMessage);
      this.timeAccumulator = 0;
    }
  }

  enqueue(message) {
    if (!message) return;
    this.queue.push(message);
  }

  update(dt) {
    if (!this.streamEl || this.queue.length === 0) {
      this.timeAccumulator = Math.min(this.timeAccumulator, this.displayDelay);
      return;
    }

    this.timeAccumulator += dt;
    if (this.timeAccumulator >= this.displayDelay) {
      this.timeAccumulator = 0;
      const message = this.queue.shift();
      this.appendLine(message);
    }
  }

  appendLine(text) {
    if (!this.streamEl || !text) return;

    const line = document.createElement('div');
    line.className = 'commentary-line';
    line.textContent = text;
    this.streamEl.appendChild(line);

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        line.classList.add('visible');
        this.streamEl.scrollTop = this.streamEl.scrollHeight;
      });
    } else {
      line.classList.add('visible');
      this.streamEl.scrollTop = this.streamEl.scrollHeight;
    }

    while (this.streamEl.children.length > this.maxLines) {
      this.streamEl.removeChild(this.streamEl.firstChild);
    }

    // Ensure newest line stays in view after any removals
    this.streamEl.scrollTop = this.streamEl.scrollHeight;
  }

  handleConvexUpdate({ worldState, conversations, protagonist, agentCount }) {
    if (!worldState) return;

    this.reportPopulation(worldState.population, agentCount);
    this.reportBirths(worldState.totalBirths);
    this.reportDeaths(worldState.totalDeaths);
    this.reportTime(worldState.currentTime || 0);
    this.reportSocioEconomic(worldState.socioEconomic);
    this.reportConversationActivity(conversations);
    this.reportProtagonist(protagonist);
  }

  reportPopulation(population = 0, agentCount = 0) {
    if (this.lastPopulation === undefined) {
      this.lastPopulation = population;
      this.enqueue(`👥 Tracking ${population} citizens live (${agentCount} rendered on this client).`);
      return;
    }

    if (population !== this.lastPopulation) {
      const delta = population - this.lastPopulation;
      this.lastPopulation = population;

      if (delta > 0) {
        this.enqueue(`🍼 Population grew to ${population}. A newcomer just joined the town.`);
      } else {
        this.enqueue(`🕯️ Population slipped to ${population}. A resident story just ended.`);
      }
    }
  }

  reportBirths(totalBirths = 0) {
    if (this.lastBirths === undefined) {
      this.lastBirths = totalBirths;
      return;
    }

    if (totalBirths > this.lastBirths) {
      const birthsSince = totalBirths - this.lastBirths;
      this.lastBirths = totalBirths;
      this.enqueue(`🎉 ${birthsSince} new birth${birthsSince > 1 ? 's' : ''} recorded (${totalBirths} total).`);
    }
  }

  reportDeaths(totalDeaths = 0) {
    if (this.lastDeaths === undefined) {
      this.lastDeaths = totalDeaths;
      return;
    }

    if (totalDeaths > this.lastDeaths) {
      const losses = totalDeaths - this.lastDeaths;
      this.lastDeaths = totalDeaths;
      this.enqueue(`⚰️ We logged ${losses} loss${losses > 1 ? 'es' : ''}. Memorials shimmer where they fell.`);
    }
  }

  reportTime(simMinutes = 0) {
    const hourOffset = 8; // The world clock starts at 08:00 in the HUD
    const totalMinutes = Math.floor(simMinutes);
    const timeBlock = Math.floor(totalMinutes / 30); // Narrate roughly twice an hour

    if (this.lastAnnouncedTimeBlock === timeBlock) return;
    this.lastAnnouncedTimeBlock = timeBlock;

    const hour = hourOffset + Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    const hh = String(hour).padStart(2, '0');
    const mm = String(minute).padStart(2, '0');
    const meetupCountdown = Math.max(0, (18 - hour) * 60 - minute); // Minutes until 6:00 PM

    let meetupText = '';
    if (meetupCountdown > 0) {
      const hoursLeft = Math.floor(meetupCountdown / 60);
      const minsLeft = meetupCountdown % 60;
      if (hoursLeft > 0) {
        meetupText = ` — ${hoursLeft}h ${minsLeft}m until the café meetup.`;
      } else if (minsLeft > 0) {
        meetupText = ` — ${minsLeft} minutes until everyone crowds the café.`;
      }
    } else {
      meetupText = ' — café meetup underway!';
    }

    this.enqueue(`🕒 Simulation clock reads ${hh}:${mm}${meetupText}`);
  }

  reportSocioEconomic(socioEconomic) {
    if (!socioEconomic) return;

    if (!this.lastSocioSnapshot) {
      this.lastSocioSnapshot = { ...socioEconomic };
      const rounded = Object.entries(socioEconomic)
        .map(([key, value]) => `${this.prettyMetricName(key)} ${Math.round(value * 100)}%`)
        .join(' • ');
      this.enqueue(`📊 Baseline metrics locked in: ${rounded}.`);
      return;
    }

    const deltas = [];
    for (const [key, value] of Object.entries(socioEconomic)) {
      const previous = this.lastSocioSnapshot[key];
      const delta = value - previous;
      if (Math.abs(delta) >= 0.08) {
        deltas.push({ key, value, delta });
      }
      this.lastSocioSnapshot[key] = value;
    }

    if (deltas.length === 0) return;

    const lines = deltas.map(({ key, value, delta }) => {
      const arrow = delta > 0 ? 'rising' : 'falling';
      return `${this.prettyMetricName(key)} ${arrow} to ${Math.round(value * 100)}%`;
    }).join(' • ');

    this.enqueue(`📉 Socio-economic pulse update: ${lines}.`);
  }

  reportConversationActivity(conversations = []) {
    const count = conversations.length;
    if (this.lastConversationCount === undefined) {
      this.lastConversationCount = count;
      if (count > 0) {
        this.enqueue(`💬 ${count} conversation${count > 1 ? 's' : ''} buzzing across town.`);
      }
      return;
    }

    if (count !== this.lastConversationCount) {
      const delta = count - this.lastConversationCount;
      this.lastConversationCount = count;

      if (count === 0) {
        this.enqueue('🤫 The streets quiet down—no active conversations right now.');
      } else if (delta > 0) {
        this.enqueue(`💬 ${count} simultaneous chats now—gossip is spreading!`);
      } else {
        this.enqueue(`👂 Conversations wind down to ${count}.`);
      }
    }
  }

  reportProtagonist(protagonist) {
    if (!protagonist || !protagonist.currentEntity) return;

    const { entityId, entityName, isAlive } = protagonist;

    if (this.lastProtagonistId !== entityId) {
      this.lastProtagonistId = entityId;
      this.lastProtagonistAlive = isAlive;
      this.enqueue(`⭐ ${entityName} takes the spotlight as protagonist.`);
      return;
    }

    if (this.lastProtagonistAlive !== isAlive) {
      this.lastProtagonistAlive = isAlive;
      if (!isAlive) {
        this.enqueue(`⚱️ ${entityName} fell. The council will choose a new protagonist soon.`);
      } else {
        this.enqueue(`💫 ${entityName} is back on their feet and steering the story.`);
      }
    }
  }

  prettyMetricName(key) {
    switch (key) {
      case 'prosperity': return 'Prosperity';
      case 'stability': return 'Stability';
      case 'happiness': return 'Happiness';
      case 'tension': return 'Tension';
      case 'scarcity': return 'Scarcity';
      default:
        return key[0].toUpperCase() + key.slice(1);
    }
  }
}

// ============================================================
// HACKTOWNSCENE CLASS - Convex-powered version
// ============================================================
class HackTownConvexScene extends Phaser.Scene {
  constructor() { super('hack'); }

  init() {
    this.w = 900; this.h = 520;
    this.origin = new Phaser.Math.Vector2(0,0);
    this.start = performance.now();
    this.nowMs = 0;
    this.agents = new Map();  // Map of ID -> NPC instance
    this.conversationManager = null;  // ConversationManager instance
    this.commentaryManager = null;
    this.player = null;
    this.cafe = new Phaser.Math.Vector2(620, 290);

    // Convex subscription state
    this.convexEntities = [];
    this.convexWorldState = null;
    this.convexConversations = [];
    this.lastSyncTime = 0;
  }

  preload(){}

  create(){
    // ===== DRAW THE WORLD (Same as before) =====
    this.add.rectangle(0,0,this.w,this.h,0x0c0f14).setOrigin(0);

    const g = this.add.graphics();
    g.lineStyle(1, 0x1b2636, 1);
    for(let x=0;x<=this.w;x+=40){ g.lineBetween(x,0,x,this.h); }
    for(let y=0;y<=this.h;y+=40){ g.lineBetween(0,y,this.w,y); }

    // ===== LANDMARKS (Enhanced with visual flair) =====
    // CAFÉ - warm inviting area
    const cafe = this.add.rectangle(580, 260, 120, 90, 0x335544).setOrigin(0,0).setStrokeStyle(2,0x88aa99);
    const cafeLabel = this.add.text(640, 255, '☕ CAFÉ', {color:'#cfe', fontSize:'12px', fontStyle: 'bold'}).setOrigin(0.5,1);

    // Subtle glow effect for café (social hub)
    this.tweens.add({
      targets: cafe,
      alpha: { from: 0.95, to: 1.0 },
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // PARK - natural peaceful area
    const park = this.add.rectangle(160, 120, 180, 120, 0x263a2e).setOrigin(0,0).setStrokeStyle(2,0x6aa386);
    const parkLabel = this.add.text(250, 115, '🌳 PARK', {color:'#cfe', fontSize:'12px', fontStyle: 'bold'}).setOrigin(0.5,1);

    // Gentle breathing animation for park
    this.tweens.add({
      targets: park,
      alpha: { from: 0.9, to: 1.0 },
      duration: 3000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // SCHOOL - structured learning area
    const school = this.add.rectangle(640, 60, 180, 110, 0x3a2b2e).setOrigin(0,0).setStrokeStyle(2,0xbb8899);
    const schoolLabel = this.add.text(730, 55, '📚 SCHOOL', {color:'#fde', fontSize:'12px', fontStyle: 'bold'}).setOrigin(0.5,1);

    // Steady pulse for school
    this.tweens.add({
      targets: school,
      alpha: { from: 0.9, to: 1.0 },
      duration: 2500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // CHURCH - spiritual sanctuary area
    const church = this.add.rectangle(80, 360, 140, 130, 0x2a2438).setOrigin(0,0).setStrokeStyle(2,0x9988bb);
    const churchLabel = this.add.text(150, 355, '⛪ CHURCH', {color:'#dce', fontSize:'12px', fontStyle: 'bold'}).setOrigin(0.5,1);

    // Gentle sacred glow for church
    this.tweens.add({
      targets: church,
      alpha: { from: 0.85, to: 1.0 },
      duration: 3500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // ===== PLAYER CHARACTER =====
    this.player = this.add.rectangle(100, 400, 12, 18, 0xffffff).setOrigin(0.5, 1);
    this.playerLabel = this.add.text(100, 378, 'You', { fontSize:'10px', color:'#fff'}).setOrigin(0.5,1);

    // ===== KEYBOARD CONTROLS =====
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D');

    // ===== CONVERSATION MANAGER =====
    this.conversationManager = new ConversationManager(this);
    this.commentaryManager = new CommentaryManager(this);

    // ===== DEBUG: Conversation distance circles =====
    this.debugCircles = this.add.graphics();
    this.debugCircles.setDepth(1000); // Draw on top
    this.showDebugCircles = false; // Toggle with 'D' key

    this.input.keyboard.on('keydown-D', () => {
      this.showDebugCircles = !this.showDebugCircles;
      logger.debug(`Debug circles: ${this.showDebugCircles ? 'ON' : 'OFF'}`);
    });

    // ===== FIELD OVERLAY (heat/food/trauma visualization) =====
    this.fieldOverlay = this.add.graphics();
    this.fieldOverlay.setDepth(100); // On top of everything for debugging
    this.fieldOverlayVisible = false;
    this.convexFields = []; // Store fields from Convex

    this.input.keyboard.on('keydown-F', () => {
      this.fieldOverlayVisible = !this.fieldOverlayVisible;
      logger.debug(`Field overlay: ${this.fieldOverlayVisible ? 'ON' : 'OFF'}`);
      logger.debug(`   Fields loaded: ${this.convexFields?.length || 0}`);

      if (this.fieldOverlayVisible && this.convexFields && this.convexFields.length > 0) {
        const traumaFields = this.convexFields.filter(f => f.type === "trauma" && f.value > 0.05);
        const heatFields = this.convexFields.filter(f => f.type === "heat" && f.value > 0.05);
        const foodFields = this.convexFields.filter(f => f.type === "food" && f.value > 0.05);
        logger.debug(`   Trauma cells: ${traumaFields.length} | Heat cells: ${heatFields.length} | Food cells: ${foodFields.length}`);

        // Show sample trauma field data
        if (traumaFields.length > 0) {
          logger.debug(`   Sample trauma field:`, traumaFields[0]);
        }
      }
    });

    // DEBUG: Press 'V' to test visual effects (stress random NPCs)
    this.input.keyboard.on('keydown-V', () => {
      logger.debug('🎨 Testing visual effects - stressing 30% of NPCs...');
      let count = 0;
      for (const [, npc] of this.agents) {
        if (Math.random() < 0.3) {
          // Artificially modify the NPC's data to trigger visual changes
          if (npc.convexData.personality) {
            npc.convexData.stress = 0.8; // High stress
            npc.convexData.personality.mood = 0.2; // Low mood
            npc.updateVisualEffects(npc.convexData);
            count++;
          }
        }
      }
      logger.debug(`✅ Stressed ${count} NPCs - they should now be RED or BLUE`);
    });

    // DEBUG: Press 'H' to make NPCs happy (test green color)
    this.input.keyboard.on('keydown-H', () => {
      logger.debug('🎨 Testing visual effects - making NPCs happy...');
      let count = 0;
      for (const [, npc] of this.agents) {
        if (Math.random() < 0.4) {
          if (npc.convexData.personality) {
            npc.convexData.stress = 0.1; // Low stress
            npc.convexData.personality.mood = 0.9; // High mood
            npc.updateVisualEffects(npc.convexData);
            count++;
          }
        }
      }
      logger.debug(`✅ Made ${count} NPCs happy - they should now be GREEN`);
    });

    // DEBUG: Press 'P' to test protagonist panel
    this.input.keyboard.on('keydown-P', () => {
      logger.debug('🔍 Testing protagonist panel...');
      const panel = document.getElementById('protagonist-panel');
      logger.debug('Panel element:', panel);
      logger.debug('Panel classes:', panel?.className);
      logger.debug('Panel style.display:', panel?.style.display);
      logger.debug('Panel computed display:', window.getComputedStyle(panel).display);
      logger.debug('Protagonist data:', this.convexProtagonist);

      // Force show panel for testing
      if (panel) {
        panel.classList.remove('hidden');
        logger.debug('✅ Forced panel to show - classes:', panel.className);
      }
    });

    // DEBUG: Press 'R' to reset all NPCs to neutral
    this.input.keyboard.on('keydown-R', () => {
      logger.debug('🔄 Resetting all NPCs to neutral...');
      for (const [, npc] of this.agents) {
        if (npc.convexData.personality) {
          npc.convexData.stress = 0.3;
          npc.convexData.personality.mood = 0.5;
          npc.updateVisualEffects(npc.convexData);
        }
      }
      logger.debug('✅ All NPCs reset to neutral colors');
    });

    // DEBUG: Press 'K' to force crisis on random NPC (test suicide/murder)
    this.input.keyboard.on('keydown-K', () => {
      logger.debug('⚠️ Forcing crisis on random NPC...');
      const npcs = Array.from(this.agents.values());
      if (npcs.length === 0) {
        logger.debug('❌ No NPCs to test with');
        return;
      }

      const randomNPC = npcs[Math.floor(Math.random() * npcs.length)];
      randomNPC.convexData.despair = 0.85; // Will trigger suicide next tick
      randomNPC.convexData.aggression = 0.75; // Will trigger murder if victim nearby

      logger.debug(` Forced crisis on ${randomNPC.name}`);
      logger.debug(`   Despair: 0.85 (suicide threshold: 0.75)`);
      logger.debug(`   Aggression: 0.75 (murder threshold: 0.65)`);
      logger.debug(`   Watch console for dark event in 3-10 seconds...`);
    });

    // DEBUG: Press 'T' to add trauma field manually (test visualization)
    this.input.keyboard.on('keydown-T', () => {
      logger.debug('💔 Creating test trauma field at center of map...');

      // Create fake trauma fields for immediate visualization testing
      if (!this.convexFields) this.convexFields = [];

      // Add a cluster of high-trauma cells in the center
      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
          const gridX = 15 + dx; // Center of 30-wide grid
          const gridY = 8 + dy;  // Center of 17-high grid
          const distance = Math.sqrt(dx*dx + dy*dy);
          const value = Math.max(0, 1.0 - distance / 3); // Decay from center

          // Remove existing field at this location
          this.convexFields = this.convexFields.filter(f =>
            !(f.gridX === gridX && f.gridY === gridY && f.type === "trauma")
          );

          // Add new trauma field
          this.convexFields.push({
            gridX,
            gridY,
            type: "trauma",
            value
          });
        }
      }

      logger.debug(`✅ Created test trauma field with ${25} cells`);
      logger.debug(`   Press 'F' to toggle overlay and see the bright magenta cloud`);
      logger.debug(`   Total fields: ${this.convexFields.length}`);

      // IMMEDIATE TEST - Draw directly without waiting for update loop
      this.fieldOverlay.clear();
      this.fieldOverlay.fillStyle(0xFF00FF, 1.0);
      this.fieldOverlay.fillRect(400, 200, 200, 200);
      logger.debug(`   🟪 DREW HUGE MAGENTA TEST SQUARE at (400,200) - YOU SHOULD SEE THIS NOW!`);
    });

    // DEBUG: Press 'L' to log all psychological states
    this.input.keyboard.on('keydown-L', () => {
      logger.debug('🧠 Logging psychological states of all NPCs:');
      logger.debug('─'.repeat(80));

      const npcs = Array.from(this.agents.values());
      if (npcs.length === 0) {
        logger.debug('No NPCs found');
        return;
      }

      // Create table data
      const tableData = npcs.map(npc => ({
        Name: npc.name,
        Despair: (npc.convexData.despair || 0).toFixed(2),
        Aggression: (npc.convexData.aggression || 0).toFixed(2),
        'Mental Break': (npc.convexData.mentalBreakpoint || 0).toFixed(2),
        Energy: (npc.convexData.energy || 0).toFixed(2),
        Social: (npc.convexData.social || 0).toFixed(2),
        Safety: (npc.convexData.safety || 0).toFixed(2),
        Traumas: npc.convexData.traumaMemories?.length || 0
      }));

      console.table(tableData);

      // Warn about crisis NPCs
      const crisisNPCs = npcs.filter(npc =>
        (npc.convexData.despair || 0) > 0.6 || (npc.convexData.aggression || 0) > 0.6
      );

      if (crisisNPCs.length > 0) {
        logger.debug('⚠️ NPCs in CRISIS:');
        crisisNPCs.forEach(npc => {
          const despair = (npc.convexData.despair || 0).toFixed(2);
          const aggression = (npc.convexData.aggression || 0).toFixed(2);
          logger.debug(`   ${npc.name}: despair=${despair}, aggression=${aggression}`);
        });
      }

      logger.debug('─'.repeat(80));
    });

    // ===== START CONVEX SUBSCRIPTION =====
    this.startConvexSync();

    logger.debug('🎮 HackTown Convex Scene created');
    logger.debug('💡 Keyboard Commands:');
    logger.debug('  D - Toggle conversation distance debug circles');
    logger.debug('  V - Stress 30% of NPCs (test RED visual effect)');
    logger.debug('  H - Make 40% of NPCs happy (test GREEN visual effect)');
    logger.debug('  R - Reset all NPCs to neutral colors');
    logger.debug('  K - Force crisis on random NPC (test suicide/murder)');
    logger.debug('  T - Create test trauma field (bright magenta cloud)');
    logger.debug('  L - Log all psychological states');
    logger.debug('  F - Toggle field overlay (heat/food/trauma)');
  }

  async startConvexSync() {
    logger.debug('📡 Starting Convex real-time sync...');

    try {
      // Initial fetch
      await this.fetchConvexData();

      // Poll every 1 second (you can replace this with actual subscriptions later)
      this.convexSyncTimer = setInterval(() => {
        this.fetchConvexData();
      }, 1000);

    } catch (error) {
      logger.error('❌ Convex sync error:', error);
    }
  }

  async fetchConvexData() {
    try {
      // Fetch entities
      const entities = await convex.query("entities:listEntities");

      // Fetch world state
      const worldState = await convex.query("worldState:getWorldState");

      // Fetch active conversations
      const conversations = await convex.query("conversations:listActiveConversations");

      if (conversations && conversations.length > 0) {
        logger.debug(`Fetched ${conversations.length} active conversations from Convex:`, conversations);
      }

      // Fetch protagonist
      const protagonist = await convex.query("protagonist:getProtagonist");
      if (protagonist) {
        logger.info('Protagonist data fetched:', protagonist.entityName);
      }

      // Fetch fields for visualization
      const fields = await convex.query("fields:getFieldsForVisualization");
      this.convexFields = fields;

      // Debug logging for fields
      if (fields && fields.length > 0) {
        const traumaFields = fields.filter(f => f.type === "trauma" && f.value > 0.1);
        if (traumaFields.length > 0) {
          logger.debug(`Found ${traumaFields.length} trauma fields (total: ${fields.length} fields)`);
        }
      }

      this.updateFromConvex(entities, worldState, conversations, protagonist);

    } catch (error) {
      logger.error('Convex fetch error:', error);
    }
  }

  updateFromConvex(entities, worldState, conversations = [], protagonist = null) {
    this.convexWorldState = worldState;
    this.convexConversations = conversations;
    this.convexProtagonist = protagonist;

    // Track which entity IDs are still alive in the server data
    const aliveEntityIds = new Set(entities.map(e => e._id));

    // Update or create NPCs based on Convex data
    for (const entityData of entities) {
      if (this.agents.has(entityData._id)) {
        // Update existing
        const npc = this.agents.get(entityData._id);
        npc.syncFromConvex(entityData);
      } else {
        // Create new
        const npc = new NPC(this, entityData);
        this.agents.set(entityData._id, npc);
        logger.info(`Created NPC: ${entityData.name}`);
      }
    }

    // Remove dead NPCs that are no longer in the server data
    for (const [id, npc] of this.agents.entries()) {
      if (!aliveEntityIds.has(id)) {
        logger.info(`Removing dead NPC: ${npc.name}`);

        // Add death marker if NPC died (not just despawned)
        const causeOfDeath = npc.convexData.causeOfDeath;
        if (causeOfDeath) {
          const x = npc.pos.x;
          const y = npc.pos.y;

          if (causeOfDeath === "suicide") {
            // Create dramatic suicide marker with glow
            const glow = this.add.circle(x, y, 40, 0x4B0082, 0.6);
            glow.setDepth(-5);

            const marker = this.add.text(x, y, '†', {
              fontSize: '48px',
              color: '#8B00FF',
              fontFamily: 'monospace',
              fontStyle: 'bold',
              stroke: '#000',
              strokeThickness: 4
            }).setOrigin(0.5);
            marker.setDepth(10);

            // Add pulsing animation
            this.tweens.add({
              targets: [marker, glow],
              alpha: 0,
              duration: 45000, // 45 seconds
              ease: 'Sine.easeIn',
              onComplete: () => {
                marker.destroy();
                glow.destroy();
              }
            });

            // Add initial flash
            marker.setAlpha(0);
            glow.setAlpha(0);
            this.tweens.add({
              targets: [marker, glow],
              alpha: { from: 0, to: 1 },
              duration: 500,
              ease: 'Power2'
            });

            logger.warn(`SUICIDE: ${npc.name} at (${x.toFixed(0)}, ${y.toFixed(0)})`);
          } else if (causeOfDeath === "murder") {
            // Create dramatic murder marker with blood pool
            const bloodPool = this.add.circle(x, y, 50, 0x8B0000, 0.7);
            bloodPool.setDepth(-5);

            const marker = this.add.text(x, y, '✗', {
              fontSize: '56px',
              color: '#FF0000',
              fontFamily: 'monospace',
              fontStyle: 'bold',
              stroke: '#000',
              strokeThickness: 5
            }).setOrigin(0.5);
            marker.setDepth(10);

            // Add pulsing animation
            this.tweens.add({
              targets: [marker, bloodPool],
              alpha: 0,
              duration: 45000, // 45 seconds
              ease: 'Sine.easeIn',
              onComplete: () => {
                marker.destroy();
                bloodPool.destroy();
              }
            });

            // Add initial flash
            marker.setAlpha(0);
            bloodPool.setAlpha(0);
            this.tweens.add({
              targets: [marker, bloodPool],
              alpha: { from: 0, to: 1 },
              duration: 500,
              ease: 'Power2'
            });

            logger.warn(`MURDER: ${npc.name} at (${x.toFixed(0)}, ${y.toFixed(0)})`);
          }
        }

        npc.destroy();
        this.agents.delete(id);
      }
    }

    // Update UI
    document.getElementById('agentCount').textContent = String(this.agents.size);

    // Update dashboard
    this.updateDashboard(worldState);

    // Update protagonist panel
    this.updateProtagonistPanel(protagonist);

    if (this.commentaryManager) {
      this.commentaryManager.handleConvexUpdate({
        worldState,
        conversations,
        protagonist,
        agentCount: this.agents.size,
      });
    }
  }


  // Update the dashboard stats overlay (top-left corner)
  updateDashboard(worldState) {
    if (!worldState) return;

    // Helper function: creates ASCII-style progress bars like "████████░░"
    const createProgressBar = (value, length = 10) => {
      const filled = Math.round(value * length); // How many █ blocks to show
      const empty = length - filled;             // How many ░ blocks to show
      return '█'.repeat(filled) + '░'.repeat(empty);
    };

    // === POPULATION STATS ===
    const aliveEl = document.getElementById('stat-alive');
    const birthsEl = document.getElementById('stat-births');
    const deathsEl = document.getElementById('stat-deaths');

    if (aliveEl) aliveEl.textContent = String(worldState.population || 0);
    if (birthsEl) birthsEl.textContent = String(worldState.totalBirths || 0);
    if (deathsEl) deathsEl.textContent = String(worldState.totalDeaths || 0);

    // === TIME AND ACTIVITY ===
    const timeEl = document.getElementById('stat-time');
    const thoughtsEl = document.getElementById('stat-thoughts');

    if (timeEl) timeEl.textContent = String(worldState.currentTime || 0);
    if (thoughtsEl) thoughtsEl.textContent = String(worldState.totalThoughts || 0);

    // === SOCIO-ECONOMIC METRICS (with ASCII progress bars) ===
    if (worldState.socioEconomic) {
      const metrics = worldState.socioEconomic;

      // Helper to update a metric bar
      const updateMetricBar = (metricName, value, isInverted = false) => {
        const barEl = document.getElementById(`bar-${metricName}`);
        const valEl = document.getElementById(`val-${metricName}`);

        if (barEl) barEl.textContent = createProgressBar(value);
        if (valEl) {
          valEl.textContent = (value * 100).toFixed(0) + '%';
          // Color code based on whether high is good (prosperity) or bad (tension)
          if (isInverted) {
            // Low is good (tension, scarcity)
            valEl.style.color = value < 0.3 ? '#7ED321' : value < 0.6 ? '#9ad' : '#FF6B35';
          } else {
            // High is good (prosperity, stability, happiness)
            valEl.style.color = value > 0.6 ? '#7ED321' : value > 0.3 ? '#9ad' : '#FF6B35';
          }
        }
      };

      // Update all 5 metrics
      updateMetricBar('prosperity', metrics.prosperity || 0, false);
      updateMetricBar('stability', metrics.stability || 0, false);
      updateMetricBar('happiness', metrics.happiness || 0, false);
      updateMetricBar('tension', metrics.tension || 0, true);  // Inverted: low is good
      updateMetricBar('scarcity', metrics.scarcity || 0, true); // Inverted: low is good
    }
  }

  // Update protagonist panel (right side)
  updateProtagonistPanel(protagonist) {
    const panel = document.getElementById('protagonist-panel');
    if (!panel) {
      logger.warn('Protagonist panel element not found');
      return;
    }

    // Position protagonist panel directly below dashboard (continuous)
    const dashboard = document.getElementById('dashboard');
    if (dashboard) {
      const dashboardRect = dashboard.getBoundingClientRect();
      const topPosition = dashboardRect.bottom;
      panel.style.setProperty('--protagonist-top', `${topPosition}px`);
      panel.style.top = `${topPosition}px`;
    }

    // Debug logging
    logger.debug('updateProtagonistPanel called with:', protagonist);
    logger.debug('🔍 Has currentEntity?', !!protagonist?.currentEntity);
    logger.debug('🔍 Is alive?', !!protagonist?.isAlive);

    // Hide panel only if no protagonist exists at all
    // (When protagonist dies, a new one will be auto-designated within 2 seconds)
    if (!protagonist || !protagonist.currentEntity) {
      logger.debug('⭐ No protagonist or currentEntity, hiding panel');
      panel.classList.add('hidden');
      return;
    }

    // Show panel and log update stats
    const entity = protagonist.currentEntity;
    const initial = protagonist.initialPersonality;
    const current = entity.personality;

    const ageMin = Math.floor((entity.age || 0) / 60);
    logger.info(`PROTAGONIST UPDATE: ${protagonist.entityName} (Age: ${ageMin}min)`);
    logger.debug(`   💭 Thoughts: ${protagonist.totalThoughts} | 💬 Conversations: ${protagonist.totalConversations} | 👥 Relationships: ${protagonist.relationships?.length || 0}`);
    logger.debug(`   😊 Mood: ${(current?.mood * 100).toFixed(0)}% | 📈 Personality changes: ${protagonist.personalityChanges?.length || 0}`);
    if (protagonist.lifeSummary) {
      logger.debug(`   📖 Life summary: "${protagonist.lifeSummary.substring(0, 80)}..."`);
    }
    panel.classList.remove('hidden');

    // === HEADER ===
    const nameEl = document.getElementById('protag-name');
    const statusEl = document.getElementById('protag-status');

    if (nameEl) {
      // Show special styling when protagonist is deceased
      if (!protagonist.isAlive) {
        nameEl.textContent = `${protagonist.entityName} ⚰️`;
        nameEl.style.color = '#888';
        nameEl.style.textDecoration = 'line-through';
      } else {
        nameEl.textContent = protagonist.entityName;
        nameEl.style.color = '#7ED321';
        nameEl.style.textDecoration = 'none';
      }
    }

    if (statusEl) {
      const ageSec = Math.floor(entity.age);
      const status = protagonist.isAlive ? '😊 Alive' : '⚰️ Deceased (New protagonist soon...)';
      statusEl.textContent = `Age: ${ageSec}s | ${status}`;
      statusEl.style.color = protagonist.isAlive ? '#999' : '#FF6B35';
    }

    // === PERSONALITY EVOLUTION ===
    const personalityEl = document.getElementById('protag-personality');
    if (personalityEl) {
      const traits = [
        { name: 'Boldness', key: 'boldness' },
        { name: 'Curiosity', key: 'curiosity' },
        { name: 'Empathy', key: 'empathy' },
      ];

      let html = '';
      for (const trait of traits) {
        const initialVal = initial[trait.key];
        const currentVal = current[trait.key];
        const delta = currentVal - initialVal;
        const deltaPercent = Math.round(delta * 100);
        const deltaClass = delta > 0.05 ? 'delta-positive' : delta < -0.05 ? 'delta-negative' : '';
        const deltaSign = delta > 0.05 ? '📈' : delta < -0.05 ? '📉' : '—';
        const deltaText = delta !== 0 ? `${deltaSign} ${deltaPercent > 0 ? '+' : ''}${deltaPercent}%` : '';

        html += `<div class="stat-line">
          ${trait.name}: ${Math.round(initialVal * 100)}% → ${Math.round(currentVal * 100)}%
          <span class="${deltaClass}">${deltaText}</span>
        </div>`;
      }
      personalityEl.innerHTML = html;
    }

    // === EMOTIONAL STATE ===
    const emotionalEl = document.getElementById('protag-emotional');
    if (emotionalEl) {
      const moodDelta = current.mood - initial.mood;
      const stressDelta = entity.stress - 0; // Assume stress starts at 0

      emotionalEl.innerHTML = `
        <div class="stat-line">Mood: ${Math.round(current.mood * 100)}% ${moodDelta > 0.1 ? '📈' : moodDelta < -0.1 ? '📉' : '—'}</div>
        <div class="stat-line">Stress: ${Math.round(entity.stress * 100)}% ${stressDelta > 0.3 ? '📈' : '—'}</div>
      `;
    }

    // === LIFE STORY ===
    const storyEl = document.getElementById('protag-story');
    const storyAgeEl = document.getElementById('protag-story-age');
    if (storyEl && storyAgeEl) {
      if (protagonist.lifeSummary) {
        storyEl.textContent = protagonist.lifeSummary;
        storyAgeEl.textContent = 'Updated: just now';
      } else {
        storyEl.textContent = 'Observing their journey... (AI summary generates every 5 minutes)';
        storyAgeEl.textContent = 'Waiting for first summary...';
      }
    }

    // === RELATIONSHIPS ===
    const relationshipsEl = document.getElementById('protag-relationships');
    if (relationshipsEl) {
      const relationships = protagonist.relationships || [];
      const totalConvos = protagonist.totalConversations || 0;
      const peopleMet = relationships.length;

      let closestText = '--';
      if (relationships.length > 0) {
        const sorted = relationships.sort((a, b) => b.conversationCount - a.conversationCount);
        const closest = sorted[0];
        closestText = `${closest.npcName} (${closest.conversationCount} talks)`;
      }

      relationshipsEl.innerHTML = `
        <div class="stat-line">💬 ${totalConvos} total conversations</div>
        <div class="stat-line">👥 ${peopleMet} people met</div>
        <div class="stat-line">⭐ Closest: ${closestText}</div>
      `;
    }

    // === MAJOR EVENTS ===
    const eventsEl = document.getElementById('protag-events');
    if (eventsEl) {
      const events = protagonist.recentEvents || [];
      const majorEvents = events
        .filter(e => e.importance > 0.6)
        .slice(0, 5);

      if (majorEvents.length > 0) {
        const html = majorEvents
          .map(e => `<div class="event-item">${e.description}</div>`)
          .join('');
        eventsEl.innerHTML = html;
      } else {
        eventsEl.innerHTML = '<div style="font-size: 10px; color: #777;">No major events yet...</div>';
      }
    }
  }

  update(_, dtMS){
    const dt = Math.min(dtMS/1000, 0.033);
    this.nowMs = performance.now() - this.start;

    // ===== CLOCK (Use Convex world time if available) =====
    let minutes, hour, minute, timeStr;

    if (this.convexWorldState && this.convexWorldState.currentTime !== undefined) {
      // Use Convex server time
      minutes = this.convexWorldState.currentTime;
    } else {
      // Fallback to local time
      minutes = Math.floor(this.nowMs / 1000);
    }

    hour = 8 + Math.floor(minutes / 60);
    minute = minutes % 60;
    timeStr = `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;

    const clockEl = document.getElementById('clock');
    if(clockEl) clockEl.textContent = timeStr;

    // ===== PLAYER MOVEMENT =====
    const pvel = new Phaser.Math.Vector2(0,0);
    const speed = 90;

    if (this.cursors.left.isDown || this.keys.A.isDown) pvel.x -= 1;
    if (this.cursors.right.isDown || this.keys.D.isDown) pvel.x += 1;
    if (this.cursors.up.isDown || this.keys.W.isDown) pvel.y -= 1;
    if (this.cursors.down.isDown || this.keys.S.isDown) pvel.y += 1;

    if (pvel.lengthSq()>0) pvel.normalize().scale(speed*dt);

    this.player.x += pvel.x;
    this.player.y += pvel.y;
    this.playerLabel.setPosition(this.player.x, this.player.y-22);

    // ===== UPDATE ALL NPCs =====
    for (const [id, npc] of this.agents) {
      npc.update(dt);
    }

    // ===== UPDATE CONVERSATIONS (Speech Bubbles) =====
    if (this.conversationManager && this.convexConversations) {
      this.conversationManager.update(this.convexConversations, this.agents);
    }

    // ===== UPDATE THOUGHT PANEL =====
    this.updateThoughtPanel();

    // ===== UPDATE COMMENTARY =====
    if (this.commentaryManager) {
      this.commentaryManager.update(dt);
    }

    // ===== DEBUG: Draw conversation distance circles =====
    if (this.showDebugCircles) {
      this.debugCircles.clear();
      this.debugCircles.lineStyle(2, 0x00ff00, 0.3); // Green semi-transparent

      const CONVERSATION_DISTANCE = 80; // Match the backend constant (increased for better detection)

      for (const [, npc] of this.agents) {
        // Draw circle showing conversation range
        this.debugCircles.strokeCircle(npc.pos.x, npc.pos.y, CONVERSATION_DISTANCE);
      }
    } else {
      this.debugCircles.clear();
    }

    // ===== RENDER FIELD OVERLAY (if visible) =====
    if (this.fieldOverlayVisible) {
      if (this.convexFields && this.convexFields.length > 0) {
        this.renderFieldOverlay(this.convexFields);
      } else {
        // Draw test pattern if no fields loaded yet
        this.fieldOverlay.clear();
        this.fieldOverlay.fillStyle(0xFF00FF, 0.5);
        this.fieldOverlay.fillRect(100, 100, 50, 50);
      }
    } else {
      // Clear when overlay is off
      this.fieldOverlay.clear();
    }

    // ===== SIMPLE HUD =====
    const hud = document.getElementById('help');
    if (hud && this.convexWorldState) {
      hud.innerHTML = `Convex Mode: <b>${this.agents.size} NPCs</b> synced from server<br/>` +
        `Population: ${this.convexWorldState.population} | Thoughts: ${this.convexWorldState.totalThoughts}`;
    }
  }

  // Update thought panel with nearby NPC thoughts (distance filtered)
  updateThoughtPanel() {
    const thoughtList = document.getElementById('thought-list');
    if (!thoughtList || !this.player) return;

    const THOUGHT_RADIUS = 200; // Only show thoughts within 200px
    const nearbyThoughts = [];

    // Collect thoughts from nearby NPCs
    for (const [id, npc] of this.agents) {
      if (!npc.convexData.lastThought) continue;

      // Calculate distance from player
      const dist = Phaser.Math.Distance.Between(
        this.player.x, this.player.y,
        npc.pos.x, npc.pos.y
      );

      if (dist <= THOUGHT_RADIUS) {
        nearbyThoughts.push({
          name: npc.name,
          thought: npc.convexData.lastThought,
          distance: dist
        });
      }
    }

    // Sort by distance (closest first)
    nearbyThoughts.sort((a, b) => a.distance - b.distance);

    // Limit to 10 most recent/closest thoughts
    const displayThoughts = nearbyThoughts.slice(0, 10);

    // Update HTML
    thoughtList.innerHTML = displayThoughts.map(t => `
      <li class="thought-item">
        <span class="npc-name">${t.name}</span>: <span class="thought-text">💭 ${t.thought}</span>
      </li>
    `).join('');
  }

  // Render field overlay visualization (heat/food/trauma spatial memory grid)
  renderFieldOverlay(fields) {
    this.fieldOverlay.clear();
    const CELL_SIZE = 30;

    // Sort fields to render trauma on top (most important)
    const sortedFields = fields.sort((a, b) => {
      const priority = { food: 1, heat: 2, trauma: 3 };
      return (priority[a.type] || 0) - (priority[b.type] || 0);
    });

    for (const field of sortedFields) {
      if (field.value <= 0.05) continue; // Skip empty cells

      let color, alpha;
      if (field.type === "trauma") {
        // DRAMATIC TRAUMA VISUALIZATION
        // Use gradient from dark purple to bright magenta based on intensity
        if (field.value > 0.7) {
          color = 0xFF00FF; // Bright magenta for high trauma
          alpha = 0.9;
        } else if (field.value > 0.4) {
          color = 0x8B00FF; // Purple for medium trauma
          alpha = 0.7;
        } else {
          color = 0x4B0082; // Indigo for low trauma
          alpha = 0.5;
        }
      } else if (field.type === "heat") {
        // Heat visualization (congregation areas)
        color = 0xFF4500; // Orange-red
        alpha = field.value * 0.4;
      } else if (field.type === "food") {
        // Food visualization (resource areas)
        color = 0x7ED321; // Bright green
        alpha = field.value * 0.25;
      }

      this.fieldOverlay.fillStyle(color, alpha);
      this.fieldOverlay.fillRect(
        field.gridX * CELL_SIZE,
        field.gridY * CELL_SIZE,
        CELL_SIZE,
        CELL_SIZE
      );

      // Add border glow for high-intensity trauma cells
      if (field.type === "trauma" && field.value > 0.6) {
        this.fieldOverlay.lineStyle(2, 0xFF00FF, field.value * 0.8);
        this.fieldOverlay.strokeRect(
          field.gridX * CELL_SIZE,
          field.gridY * CELL_SIZE,
          CELL_SIZE,
          CELL_SIZE
        );
      }
    }
  }

  shutdown() {
    // Clean up subscription when scene closes
    if (this.convexSyncTimer) {
      clearInterval(this.convexSyncTimer);
    }
  }
}

// ============================================================
// GAME BOOT
// ============================================================
const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: 900,
  height: 520,
  backgroundColor: '#0c0f14',
  parent: document.body,
  scene: [HackTownConvexScene],
  render: {
    pixelArt: false,  // Keep false for smooth fonts
    antialias: true,   // Enable antialiasing for crisp text
    roundPixels: true  // Round pixel positions for sharper rendering
  }
});

logger.debug('🚀 HackTown Convex Edition started');
