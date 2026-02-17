// Dynamic room layout engine for the world map SVG.
// Computes positions from live room data — no hardcoded grid.
// Coordinates target a virtual 1000×800 space.

export interface RoomPosition {
  id: string;
  x: number;
  y: number;
  district: string;
}

export interface RoomEdge {
  from: string;
  to: string;
  crossDistrict: boolean;
}

export interface RoomInput {
  id: string;
  short: string;
  district: string;
  exits: Record<string, string>;
}

// ── District colors — dynamic palette for any district name ──────────────────

const PALETTE = [
  "#00ffe7", // cyan
  "#ff6bff", // magenta
  "#ffcc00", // gold
  "#66ff66", // green
  "#ff6644", // coral
  "#6699ff", // blue
  "#ff9944", // orange
  "#cc66ff", // purple
];

const districtColorCache = new Map<string, string>();

export function getDistrictColor(district: string): string {
  let color = districtColorCache.get(district);
  if (!color) {
    const idx = districtColorCache.size % PALETTE.length;
    color = PALETTE[idx]!;
    districtColorCache.set(district, color);
  }
  return color;
}

export function getDistrictLabel(district: string): string {
  return district.toUpperCase();
}

// ── Layout: detect grid patterns or fall back to force-directed ──────────────

/** Try to parse a grid coordinate from room ID like "world/2-3" */
function parseGridCoord(id: string): { row: number; col: number } | null {
  const after = id.split("/")[1];
  if (!after) return null;
  const m = after.match(/^(\d+)-(\d+)$/);
  if (!m) return null;
  return { row: Number(m[1]), col: Number(m[2]) };
}

/** Compute positions for all rooms. Detects grid patterns automatically. */
export function computeLayout(
  rooms: RoomInput[],
  startRoom?: string,
): { positions: RoomPosition[]; edges: RoomEdge[] } {
  if (rooms.length === 0) return { positions: [], edges: [] };

  // Reset color cache for fresh layout
  districtColorCache.clear();

  // ── Try grid detection ───────────────────────────────────────────────
  const gridCoords = new Map<string, { row: number; col: number }>();
  let allGrid = true;
  for (const room of rooms) {
    const coord = parseGridCoord(room.id);
    if (coord) {
      gridCoords.set(room.id, coord);
    } else {
      allGrid = false;
    }
  }

  const posMap = new Map<string, RoomPosition>();

  if (allGrid && gridCoords.size === rooms.length) {
    // Pure grid world — use grid layout
    let minRow = Infinity;
    let maxRow = -Infinity;
    let minCol = Infinity;
    let maxCol = -Infinity;
    for (const { row, col } of gridCoords.values()) {
      minRow = Math.min(minRow, row);
      maxRow = Math.max(maxRow, row);
      minCol = Math.min(minCol, col);
      maxCol = Math.max(maxCol, col);
    }
    const rows = maxRow - minRow + 1;
    const cols = maxCol - minCol + 1;
    // Scale to fit in 600×400 centered in 1000×800
    const spacingX = cols > 1 ? 600 / (cols - 1) : 0;
    const spacingY = rows > 1 ? 400 / (rows - 1) : 0;
    const spacing = Math.min(spacingX || 100, spacingY || 100, 100);
    const totalW = (cols - 1) * spacing;
    const totalH = (rows - 1) * spacing;
    const offsetX = 500 - totalW / 2;
    const offsetY = 400 - totalH / 2;

    for (const room of rooms) {
      const coord = gridCoords.get(room.id)!;
      posMap.set(room.id, {
        id: room.id,
        x: offsetX + (coord.col - minCol) * spacing,
        y: offsetY + (coord.row - minRow) * spacing,
        district: room.district,
      });
    }
  } else {
    // Non-grid or mixed — use BFS radial layout from startRoom
    const adjacency = new Map<string, string[]>();
    for (const room of rooms) {
      const neighbors: string[] = [];
      for (const target of Object.values(room.exits)) {
        neighbors.push(target);
      }
      adjacency.set(room.id, neighbors);
    }

    // BFS from start room (or first room)
    const root = startRoom && rooms.some((r) => r.id === startRoom) ? startRoom : rooms[0]!.id;

    const visited = new Set<string>();
    const layers: string[][] = [];
    const queue: string[] = [root];
    visited.add(root);

    while (queue.length > 0) {
      const layer = [...queue];
      layers.push(layer);
      queue.length = 0;
      for (const id of layer) {
        for (const neighbor of adjacency.get(id) ?? []) {
          if (!visited.has(neighbor) && rooms.some((r) => r.id === neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
    }

    // Place any disconnected rooms
    for (const room of rooms) {
      if (!visited.has(room.id)) {
        layers.push([room.id]);
        visited.add(room.id);
      }
    }

    // Place root at center
    posMap.set(root, {
      id: root,
      x: 500,
      y: 400,
      district: rooms.find((r) => r.id === root)?.district ?? "",
    });

    // Radial placement for each BFS layer
    for (let li = 1; li < layers.length; li++) {
      const layer = layers[li]!;
      const radius = li * 90;
      for (let ni = 0; ni < layer.length; ni++) {
        const angle = (2 * Math.PI * ni) / layer.length - Math.PI / 2;
        const id = layer[ni]!;
        posMap.set(id, {
          id,
          x: 500 + Math.cos(angle) * radius,
          y: 400 + Math.sin(angle) * radius,
          district: rooms.find((r) => r.id === id)?.district ?? "",
        });
      }
    }
  }

  // ── Build edges ──────────────────────────────────────────────────────
  const edgeSet = new Set<string>();
  const edges: RoomEdge[] = [];
  for (const room of rooms) {
    const srcDistrict = room.id.split("/")[0]!;
    for (const target of Object.values(room.exits)) {
      const tgtDistrict = target.split("/")[0]!;
      const key = [room.id, target].sort().join("|");
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push({
          from: room.id,
          to: target,
          crossDistrict: srcDistrict !== tgtDistrict,
        });
      }
    }
  }

  return { positions: Array.from(posMap.values()), edges };
}
