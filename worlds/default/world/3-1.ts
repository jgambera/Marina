import type { RoomId, RoomModule } from "../../../src/types";

const room: RoomModule = {
  short: "Sector 3-1",
  long: "An empty sector at coordinates (3, 1). Open ground in every direction.",
  exits: {
    north: "world/2-1" as RoomId,
    south: "world/4-1" as RoomId,
    east: "world/3-2" as RoomId,
    west: "world/3-0" as RoomId,
  },
};

export default room;
