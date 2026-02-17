import type { RoomId, RoomModule } from "../../../src/types";

const room: RoomModule = {
  short: "Sector 1-1",
  long: "An empty sector at coordinates (1, 1). Open ground in every direction.",
  exits: {
    north: "world/0-1" as RoomId,
    south: "world/2-1" as RoomId,
    east: "world/1-2" as RoomId,
    west: "world/1-0" as RoomId,
  },
};

export default room;
