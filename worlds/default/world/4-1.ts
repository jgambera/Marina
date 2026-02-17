import type { RoomId, RoomModule } from "../../../src/types";

const room: RoomModule = {
  short: "Sector 4-1",
  long: "An empty sector at coordinates (4, 1). The south edge of the world lies here.",
  exits: {
    north: "world/3-1" as RoomId,
    east: "world/4-2" as RoomId,
    west: "world/4-0" as RoomId,
  },
};

export default room;
