import type { RoomId, RoomModule } from "../../../src/types";

const room: RoomModule = {
  short: "Sector 3-4",
  long: "An empty sector at coordinates (3, 4). The east edge of the world lies here.",
  exits: {
    north: "world/2-4" as RoomId,
    south: "world/4-4" as RoomId,
    west: "world/3-3" as RoomId,
  },
};

export default room;
