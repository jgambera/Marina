import type { RoomId, RoomModule } from "../../../src/types";

const room: RoomModule = {
  short: "Sector 1-3",
  long: "An empty sector at coordinates (1, 3). Open ground in every direction.",
  exits: {
    north: "world/0-3" as RoomId,
    south: "world/2-3" as RoomId,
    east: "world/1-4" as RoomId,
    west: "world/1-2" as RoomId,
  },
};

export default room;
