import type { RoomId, RoomModule } from "../../../src/types";

const room: RoomModule = {
  short: "Sector 3-3",
  long: "An empty sector at coordinates (3, 3). Open ground in every direction.",
  exits: {
    north: "world/2-3" as RoomId,
    south: "world/4-3" as RoomId,
    east: "world/3-4" as RoomId,
    west: "world/3-2" as RoomId,
  },
};

export default room;
