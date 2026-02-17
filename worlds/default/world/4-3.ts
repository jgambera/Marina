import type { RoomId, RoomModule } from "../../../src/types";

const room: RoomModule = {
  short: "Sector 4-3",
  long: "An empty sector at coordinates (4, 3). The south edge of the world lies here.",
  exits: {
    north: "world/3-3" as RoomId,
    east: "world/4-4" as RoomId,
    west: "world/4-2" as RoomId,
  },
};

export default room;
