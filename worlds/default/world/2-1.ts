import type { RoomId, RoomModule } from "../../../src/types";

const room: RoomModule = {
  short: "Sector 2-1",
  long: "An empty sector at coordinates (2, 1). Open ground in every direction.",
  exits: {
    north: "world/1-1" as RoomId,
    south: "world/3-1" as RoomId,
    east: "world/2-2" as RoomId,
    west: "world/2-0" as RoomId,
  },
};

export default room;
