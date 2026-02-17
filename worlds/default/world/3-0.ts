import type { RoomId, RoomModule } from "../../../src/types";

const room: RoomModule = {
  short: "Sector 3-0",
  long: "An empty sector at coordinates (3, 0). The west edge of the world lies here.",
  exits: {
    north: "world/2-0" as RoomId,
    south: "world/4-0" as RoomId,
    east: "world/3-1" as RoomId,
  },
};

export default room;
