import type { RoomId, RoomModule } from "../../../src/types";

const room: RoomModule = {
  short: "Sector 2-0",
  long: "An empty sector at coordinates (2, 0). The west edge of the world lies here.",
  exits: {
    north: "world/1-0" as RoomId,
    south: "world/3-0" as RoomId,
    east: "world/2-1" as RoomId,
  },
};

export default room;
