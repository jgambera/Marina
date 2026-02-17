import type { RoomId, RoomModule } from "../../../src/types";

const room: RoomModule = {
  short: "Sector 2-3",
  long: "An empty sector at coordinates (2, 3). Open ground in every direction.",
  exits: {
    north: "world/1-3" as RoomId,
    south: "world/3-3" as RoomId,
    east: "world/2-4" as RoomId,
    west: "world/2-2" as RoomId,
  },
};

export default room;
