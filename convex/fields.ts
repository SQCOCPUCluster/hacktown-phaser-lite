import { logger } from "./logger";
// Scalar fields system - spatial memory grid for heat, food, and trauma
// Creates emergent spatial patterns: danger zones, food clustering, haunted areas

import { internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";

// GRID CONFIGURATION
export const GRID_WIDTH = 30;   // 900px / 30px cells = 30 columns
export const GRID_HEIGHT = 17;  // 520px / 30px cells = 17 rows
export const CELL_SIZE = 30;    // Each cell is 30x30 pixels

// FIELD TYPES
export type FieldType = "heat" | "food" | "trauma";

// DIFFUSION RATES (how fast values spread to neighbors)
const HEAT_DIFFUSION_RATE = 0.12;    // Heat spreads quickly like smoke
const FOOD_DIFFUSION_RATE = 0.05;    // Food doesn't spread much
const TRAUMA_DIFFUSION_RATE = 0.08;  // Trauma spreads slower than heat

// EVAPORATION RATES (how fast values decay)
const HEAT_EVAPORATION_RATE = 0.02;  // Heat fades moderately fast
const FOOD_EVAPORATION_RATE = 0.01;  // Food decays slowly
const TRAUMA_EVAPORATION_RATE = 0.005; // Trauma lingers longest

// REGROWTH RATES (for food recovery)
const FOOD_REGROWTH_RATE = 0.002;    // Food slowly regenerates
const FOOD_REGROWTH_CAP = 0.8;       // Max food density

/**
 * Initialize the field grid with default values
 * Seeds café with high food, other locations with moderate food
 */
export const initializeFields = internalMutation({
  handler: async (ctx) => {
    logger.debug("🌍 Initializing scalar field grid...");

    // Clear existing fields
    const existingFields = await ctx.db.query("fields").collect();
    for (const field of existingFields) {
      await ctx.db.delete(field._id);
    }

    // Create grid cells for each field type
    for (let gridX = 0; gridX < GRID_WIDTH; gridX++) {
      for (let gridY = 0; gridY < GRID_HEIGHT; gridY++) {
        // Calculate world position for this cell
        const worldX = gridX * CELL_SIZE + CELL_SIZE / 2;
        const worldY = gridY * CELL_SIZE + CELL_SIZE / 2;

        // FOOD FIELD - high at landmarks, especially café
        let foodValue = 0.2; // Base food everywhere

        // Café (640, 305) - main food source
        const cafeDistSq = Math.pow(worldX - 640, 2) + Math.pow(worldY - 305, 2);
        if (cafeDistSq < 60 * 60) {
          foodValue = 0.8; // High food at café
        } else if (cafeDistSq < 100 * 100) {
          foodValue = 0.5; // Moderate food near café
        }

        // Park (250, 180) - moderate food
        const parkDistSq = Math.pow(worldX - 250, 2) + Math.pow(worldY - 180, 2);
        if (parkDistSq < 90 * 90) {
          foodValue = Math.max(foodValue, 0.4);
        }

        // School (730, 115) - moderate food
        const schoolDistSq = Math.pow(worldX - 730, 2) + Math.pow(worldY - 115, 2);
        if (schoolDistSq < 80 * 80) {
          foodValue = Math.max(foodValue, 0.35);
        }

        // Church (150, 380) - low food
        const churchDistSq = Math.pow(worldX - 150, 2) + Math.pow(worldY - 380, 2);
        if (churchDistSq < 70 * 70) {
          foodValue = Math.max(foodValue, 0.3);
        }

        // Insert food field cell
        await ctx.db.insert("fields", {
          gridX,
          gridY,
          type: "food",
          value: foodValue,
        });

        // HEAT FIELD - start at zero (created dynamically by events)
        await ctx.db.insert("fields", {
          gridX,
          gridY,
          type: "heat",
          value: 0.0,
        });

        // TRAUMA FIELD - start at zero (created by deaths/violence)
        await ctx.db.insert("fields", {
          gridX,
          gridY,
          type: "trauma",
          value: 0.0,
        });
      }
    }

    logger.debug(`✅ Initialized ${GRID_WIDTH * GRID_HEIGHT * 3} field cells`);
  },
});

/**
 * Sample field value at a world position
 * Returns value 0-1 for the given field type at (x, y)
 */
export const sampleField = internalQuery({
  args: {},
  handler: async (ctx, args: { x: number; y: number; type: FieldType }): Promise<number> => {
    const { x, y, type } = args;

    // Convert world coordinates to grid coordinates
    const gridX = Math.floor(x / CELL_SIZE);
    const gridY = Math.floor(y / CELL_SIZE);

    // Clamp to grid bounds
    const clampedX = Math.max(0, Math.min(GRID_WIDTH - 1, gridX));
    const clampedY = Math.max(0, Math.min(GRID_HEIGHT - 1, gridY));

    // Find the field cell
    const cell = await ctx.db
      .query("fields")
      .withIndex("by_type_grid", (q) =>
        q.eq("type", type).eq("gridX", clampedX).eq("gridY", clampedY)
      )
      .first();

    return cell?.value ?? 0;
  },
});

/**
 * Modify field value at a world position
 * Adds delta to current value (can be negative to reduce)
 * Spreads to nearby cells based on radius
 */
export const modifyField = internalMutation({
  handler: async (
    ctx,
    args: { x: number; y: number; type: FieldType; delta: number; radius?: number }
  ) => {
    const { x, y, type, delta, radius = 60 } = args;

    // Convert to grid coordinates
    const centerGridX = Math.floor(x / CELL_SIZE);
    const centerGridY = Math.floor(y / CELL_SIZE);

    // Calculate how many cells the radius covers
    const cellRadius = Math.ceil(radius / CELL_SIZE);

    // Modify all cells within radius (falloff based on distance)
    for (
      let gridX = Math.max(0, centerGridX - cellRadius);
      gridX <= Math.min(GRID_WIDTH - 1, centerGridX + cellRadius);
      gridX++
    ) {
      for (
        let gridY = Math.max(0, centerGridY - cellRadius);
        gridY <= Math.min(GRID_HEIGHT - 1, centerGridY + cellRadius);
        gridY++
      ) {
        // Calculate distance from center (in grid cells)
        const dx = gridX - centerGridX;
        const dy = gridY - centerGridY;
        const distanceInCells = Math.sqrt(dx * dx + dy * dy);

        // Falloff: full strength at center, 0 at radius
        const falloff = Math.max(0, 1 - distanceInCells / cellRadius);

        if (falloff > 0) {
          // Find the cell
          const cell = await ctx.db
            .query("fields")
            .withIndex("by_type_grid", (q) =>
              q.eq("type", type).eq("gridX", gridX).eq("gridY", gridY)
            )
            .first();

          if (cell) {
            const newValue = Math.max(0, Math.min(1, cell.value + delta * falloff));
            await ctx.db.patch(cell._id, { value: newValue });
          }
        }
      }
    }
  },
});

/**
 * Diffuse field - spread values to neighboring cells
 * Simulates heat/trauma spreading like smoke
 */
export const diffuseField = internalMutation({
  handler: async (ctx, args: { type: FieldType }) => {
    const { type } = args;

    // Get diffusion rate for this field type
    let diffusionRate = HEAT_DIFFUSION_RATE;
    if (type === "food") diffusionRate = FOOD_DIFFUSION_RATE;
    if (type === "trauma") diffusionRate = TRAUMA_DIFFUSION_RATE;

    // Get all cells of this type
    const cells = await ctx.db
      .query("fields")
      .withIndex("by_type", (q) => q.eq("type", type))
      .collect();

    // Build a 2D array for current values
    const grid: number[][] = Array(GRID_HEIGHT).fill(0).map(() => Array(GRID_WIDTH).fill(0));

    // Fill grid with current values
    for (const cell of cells) {
      grid[cell.gridY][cell.gridX] = cell.value;
    }

    // Calculate new values with diffusion
    const newGrid: number[][] = [];
    for (let y = 0; y < GRID_HEIGHT; y++) {
      newGrid[y] = [];
      for (let x = 0; x < GRID_WIDTH; x++) {
        const currentValue = grid[y][x];

        // Get neighbor values (4-connected)
        const neighbors = [];
        if (y > 0) neighbors.push(grid[y - 1][x]);
        if (y < GRID_HEIGHT - 1) neighbors.push(grid[y + 1][x]);
        if (x > 0) neighbors.push(grid[y][x - 1]);
        if (x < GRID_WIDTH - 1) neighbors.push(grid[y][x + 1]);

        // Average of neighbors
        const avgNeighbor =
          neighbors.length > 0
            ? neighbors.reduce((a, b) => a + b, 0) / neighbors.length
            : currentValue;

        // Blend current value with neighbor average
        const newValue =
          currentValue * (1 - diffusionRate) + avgNeighbor * diffusionRate;

        newGrid[y][x] = newValue;
      }
    }

    // Update database with new values
    for (const cell of cells) {
      const newValue = newGrid[cell.gridY][cell.gridX];
      if (Math.abs(newValue - cell.value) > 0.001) {
        // Only update if changed significantly
        await ctx.db.patch(cell._id, { value: newValue });
      }
    }
  },
});

/**
 * Evaporate field - decay values over time
 * Heat/trauma fades, food decays
 */
export const evaporateField = internalMutation({
  handler: async (ctx, args: { type: FieldType }) => {
    const { type } = args;

    // Get evaporation rate
    let evaporationRate = HEAT_EVAPORATION_RATE;
    if (type === "food") evaporationRate = FOOD_EVAPORATION_RATE;
    if (type === "trauma") evaporationRate = TRAUMA_EVAPORATION_RATE;

    // Get all cells of this type
    const cells = await ctx.db
      .query("fields")
      .withIndex("by_type", (q) => q.eq("type", type))
      .collect();

    // Decay each cell
    for (const cell of cells) {
      if (cell.value > 0.01) {
        // Only decay if above threshold
        const newValue = Math.max(0, cell.value * (1 - evaporationRate));
        await ctx.db.patch(cell._id, { value: newValue });
      }
    }
  },
});

/**
 * Regrow food field - food slowly regenerates at landmarks
 */
export const regrowFood = internalMutation({
  handler: async (ctx) => {
    const cells = await ctx.db
      .query("fields")
      .withIndex("by_type", (q) => q.eq("type", "food"))
      .collect();

    for (const cell of cells) {
      // Calculate world position
      const worldX = cell.gridX * CELL_SIZE + CELL_SIZE / 2;
      const worldY = cell.gridY * CELL_SIZE + CELL_SIZE / 2;

      // Check if near a landmark (food source)
      let isNearLandmark = false;

      // Café
      const cafeDistSq = Math.pow(worldX - 640, 2) + Math.pow(worldY - 305, 2);
      if (cafeDistSq < 100 * 100) isNearLandmark = true;

      // Park
      const parkDistSq = Math.pow(worldX - 250, 2) + Math.pow(worldY - 180, 2);
      if (parkDistSq < 90 * 90) isNearLandmark = true;

      // Regrow food if near landmark and below cap
      if (isNearLandmark && cell.value < FOOD_REGROWTH_CAP) {
        const newValue = Math.min(
          FOOD_REGROWTH_CAP,
          cell.value + FOOD_REGROWTH_RATE
        );
        await ctx.db.patch(cell._id, { value: newValue });
      }
    }
  },
});

/**
 * Get all fields of a specific type (for frontend visualization)
 */
export const getAllFields = internalQuery({
  handler: async (ctx, args: { type?: FieldType }) => {
    const { type } = args;

    if (type) {
      return await ctx.db
        .query("fields")
        .withIndex("by_type", (q) => q.eq("type", type))
        .collect();
    } else {
      // Return all fields
      return await ctx.db.query("fields").collect();
    }
  },
});

/**
 * Field update tick - Runs periodically to diffuse, evaporate, and regrow fields
 * Called by cron job every 5 seconds
 */
export const fieldUpdateTick = internalMutation({
  handler: async (ctx) => {
    logger.debug("🌊 Field update tick running...");

    // Diffuse all field types (heat/trauma spreads, food spreads slowly)
    await ctx.runMutation(internal.fields.diffuseField, { type: "heat" });
    await ctx.runMutation(internal.fields.diffuseField, { type: "trauma" });
    await ctx.runMutation(internal.fields.diffuseField, { type: "food" });

    // Evaporate all field types (decay over time)
    await ctx.runMutation(internal.fields.evaporateField, { type: "heat" });
    await ctx.runMutation(internal.fields.evaporateField, { type: "trauma" });
    await ctx.runMutation(internal.fields.evaporateField, { type: "food" });

    // Regrow food at landmarks
    await ctx.runMutation(internal.fields.regrowFood);

    logger.debug("✅ Field update complete");
  },
});

/**
 * Get all fields for frontend visualization
 * PUBLIC query - can be called from main.js
 */
export const getFieldsForVisualization = query({
  handler: async (ctx) => {
    return await ctx.db.query("fields").collect();
  },
});