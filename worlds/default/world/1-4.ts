import type { RoomId, RoomModule } from "../../../src/types";

const room: RoomModule = {
  short: "Sector 1-4",
  long: "An empty sector at coordinates (1, 4). The east edge of the world lies here.",
  exits: {
    north: "world/0-4" as RoomId,
    south: "world/2-4" as RoomId,
    west: "world/1-3" as RoomId,
  },
};

export default room;
