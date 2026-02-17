import type { RoomId, RoomModule } from "../../../src/types";

const room: RoomModule = {
  short: "Sector 1-2",
  long: "An empty sector at coordinates (1, 2). Open ground in every direction.",
  exits: {
    north: "world/0-2" as RoomId,
    south: "world/2-2" as RoomId,
    east: "world/1-3" as RoomId,
    west: "world/1-1" as RoomId,
  },
};

export default room;
