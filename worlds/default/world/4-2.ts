import type { RoomId, RoomModule } from "../../../src/types";

const room: RoomModule = {
  short: "Sector 4-2",
  long: "An empty sector at coordinates (4, 2). The south edge of the world lies here.",
  exits: {
    north: "world/3-2" as RoomId,
    east: "world/4-3" as RoomId,
    west: "world/4-1" as RoomId,
  },
};

export default room;
