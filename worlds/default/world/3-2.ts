import type { RoomId, RoomModule } from "../../../src/types";

const room: RoomModule = {
  short: "Sector 3-2",
  long: "An empty sector at coordinates (3, 2). Open ground in every direction.",
  exits: {
    north: "world/2-2" as RoomId,
    south: "world/4-2" as RoomId,
    east: "world/3-3" as RoomId,
    west: "world/3-1" as RoomId,
  },
};

export default room;
