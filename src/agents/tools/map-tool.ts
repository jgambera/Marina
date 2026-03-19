/**
 * Map Tool - Allows agent to maintain and use a world map
 */

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import type { WorldMap } from "../mapping/map-data";
import { MapRenderer } from "../mapping/map-renderer";

// Directions are now plain strings in Marina (no fixed enum)

const mapToolSchema = Type.Object({
  action: Type.Union([
    Type.Literal("record_location"),
    Type.Literal("get_map"),
    Type.Literal("find_path"),
    Type.Literal("get_unexplored"),
    Type.Literal("export_map"),
  ]),
  fromLocation: Type.Optional(Type.String({ description: "Starting location for pathfinding" })),
  toLocation: Type.Optional(Type.String({ description: "Destination for pathfinding" })),
  format: Type.Optional(
    Type.Union([Type.Literal("ascii"), Type.Literal("json"), Type.Literal("summary")], {
      description: "Map export format",
    }),
  ),
});

export type MapToolInput = Static<typeof mapToolSchema>;

export function createMapTool(worldMap: WorldMap): AgentTool<typeof mapToolSchema> {
  return {
    name: "world_map",
    label: "Maintain and use world map",
    description: `Maintain an internal world map for efficient navigation and discovery.

Actions:
- **record_location**: Record your current location and exits (done automatically, but can trigger manually)
- **get_map**: Get ASCII visualization of the explored world
- **find_path**: Find the shortest path between two locations
- **get_unexplored**: Get list of unexplored exits to discover new areas
- **export_map**: Export map for sharing with other players

Your map helps you:
- Navigate efficiently using shortest paths
- Avoid getting lost by knowing where you've been
- Discover new areas systematically
- Share your discoveries with other players

The map is persistent and grows as you explore.`,

    parameters: mapToolSchema,

    async execute(toolCallId: string, params: MapToolInput, signal?: AbortSignal) {
      const { action, fromLocation, toLocation, format = "ascii" } = params;

      try {
        switch (action) {
          case "record_location": {
            // Recording happens automatically via perception events
            // This action just confirms the current state
            const currentRoom = worldMap.getCurrentRoom();
            if (!currentRoom) {
              return {
                content: [
                  {
                    type: "text",
                    text: "No current location recorded. Make sure you've looked around first.",
                  },
                ],
                details: { success: false },
              };
            }

            const stats = worldMap.getStats();
            return {
              content: [
                {
                  type: "text",
                  text: `Current location recorded: ${currentRoom.title}\n\nMap stats:\n- Total rooms: ${stats.totalRooms}\n- Unexplored exits: ${stats.unexploredExits}\n- Exploration rate: ${stats.roomsPerMinute} rooms/min`,
                },
              ],
              details: { success: true, currentRoom, stats },
            };
          }

          case "get_map": {
            const renderer = new MapRenderer();
            const currentRoom = worldMap.getCurrentRoom();
            const startRoom = worldMap.getStartRoom();

            const asciiMap = renderer.renderASCII(worldMap, {
              highlightCurrent: true,
              showMarkers: true,
            });

            return {
              content: [
                {
                  type: "text",
                  text: `Here's your world map:\n\n${asciiMap}\n\nUse this map to navigate efficiently and find unexplored areas.`,
                },
              ],
              details: { success: true, map: asciiMap },
            };
          }

          case "find_path": {
            if (!fromLocation || !toLocation) {
              return {
                content: [
                  {
                    type: "text",
                    text: "Error: Both fromLocation and toLocation are required for pathfinding.",
                  },
                ],
                details: { success: false, error: "Missing locations" },
              };
            }

            // Find rooms by title
            const allRooms = worldMap.getAllRooms();
            const fromRoom = allRooms.find((r) =>
              r.title.toLowerCase().includes(fromLocation.toLowerCase()),
            );
            const toRoom = allRooms.find((r) =>
              r.title.toLowerCase().includes(toLocation.toLowerCase()),
            );

            if (!fromRoom) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Error: Could not find starting location "${fromLocation}". Make sure you've visited it first.`,
                  },
                ],
                details: { success: false, error: "From location not found" },
              };
            }

            if (!toRoom) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Error: Could not find destination "${toLocation}". Make sure you've visited it first.`,
                  },
                ],
                details: { success: false, error: "To location not found" },
              };
            }

            const path = worldMap.findPath(fromRoom.id, toRoom.id);
            if (!path) {
              return {
                content: [
                  {
                    type: "text",
                    text: `No path found from "${fromLocation}" to "${toLocation}". They may not be connected yet.`,
                  },
                ],
                details: { success: false, error: "No path found" },
              };
            }

            const directions = path.join(" → ");
            return {
              content: [
                {
                  type: "text",
                  text: `Path from "${fromLocation}" to "${toLocation}":\n\n${directions}\n\n(${path.length} steps)`,
                },
              ],
              details: { success: true, path, steps: path.length },
            };
          }

          case "get_unexplored": {
            const unexplored = worldMap.getUnexploredExits();

            if (unexplored.length === 0) {
              return {
                content: [
                  {
                    type: "text",
                    text: "No unexplored exits found! You've discovered all connected areas. Try exploring from different starting points.",
                  },
                ],
                details: { success: true, unexplored: [] },
              };
            }

            // Group by room
            const byRoom = new Map<string, { roomTitle: string; exits: string[] }>();
            for (const exit of unexplored) {
              const room = worldMap.getRoom(exit.roomId);
              if (room) {
                if (!byRoom.has(exit.roomId)) {
                  byRoom.set(exit.roomId, { roomTitle: room.title, exits: [] });
                }
                byRoom.get(exit.roomId)!.exits.push(exit.direction);
              }
            }

            const lines = ["Unexplored exits:"];
            let count = 0;
            for (const [roomId, data] of byRoom.entries()) {
              if (count >= 10) {
                lines.push(`\n... and ${unexplored.length - count} more unexplored exits`);
                break;
              }
              lines.push(`\n- ${data.roomTitle}: ${data.exits.join(", ")}`);
              count += data.exits.length;
            }

            return {
              content: [
                {
                  type: "text",
                  text: lines.join(""),
                },
              ],
              details: { success: true, unexplored: Array.from(byRoom.values()) },
            };
          }

          case "export_map": {
            const stats = worldMap.getStats();

            if (format === "json") {
              const jsonExport = worldMap.toJSON();
              return {
                content: [
                  {
                    type: "text",
                    text: `Map exported in JSON format:\n\n${JSON.stringify(jsonExport, null, 2)}\n\nYou can share this with other players or save it for later.`,
                  },
                ],
                details: { success: true, export: jsonExport },
              };
            } else if (format === "summary") {
              const rooms = worldMap.getAllRooms();
              const roomList = rooms
                .slice(0, 20)
                .map((r) => `- ${r.title} (${r.exits.size} exits)`)
                .join("\n");
              const summary = `Map Summary:\n\nTotal Rooms: ${stats.totalRooms}\nUnexplored Exits: ${stats.unexploredExits}\nExploration Rate: ${stats.roomsPerMinute} rooms/min\n\nRecent Locations:\n${roomList}${rooms.length > 20 ? `\n... and ${rooms.length - 20} more` : ""}`;

              return {
                content: [
                  {
                    type: "text",
                    text: summary,
                  },
                ],
                details: { success: true, summary },
              };
            } else {
              // ASCII format
              const renderer = new MapRenderer();
              const asciiMap = renderer.renderASCII(worldMap, {
                highlightCurrent: true,
                showMarkers: true,
              });

              return {
                content: [
                  {
                    type: "text",
                    text: `Here's your map to share with players:\n\n${asciiMap}\n\nYou can copy this ASCII art and share it in chat!`,
                  },
                ],
                details: { success: true, map: asciiMap },
              };
            }
          }

          default:
            return {
              content: [
                {
                  type: "text",
                  text: `Unknown action: ${action}`,
                },
              ],
              details: { success: false, error: "Unknown action" },
            };
        }
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error.message}`,
            },
          ],
          details: { success: false, error: error.message },
        };
      }
    },
  };
}
