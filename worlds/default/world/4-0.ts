import type { RoomId, RoomModule } from "../../../src/types";

const room: RoomModule = {
  short: "Sector 4-0",
  long: "An empty sector at coordinates (4, 0). The south and west edge of the world lies here.",
  exits: {
    north: "world/3-0" as RoomId,
    east: "world/4-1" as RoomId,
  },
};

export default room;
