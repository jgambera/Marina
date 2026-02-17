import type { RoomId, RoomModule } from "../../../src/types";

const room: RoomModule = {
  short: "Sector 2-4",
  long: "An empty sector at coordinates (2, 4). The east edge of the world lies here.",
  exits: {
    north: "world/1-4" as RoomId,
    south: "world/3-4" as RoomId,
    west: "world/2-3" as RoomId,
  },
};

export default room;
