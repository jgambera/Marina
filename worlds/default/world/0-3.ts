import type { RoomId, RoomModule } from "../../../src/types";

const room: RoomModule = {
  short: "Sector 0-3",
  long: "An empty sector at coordinates (0, 3). The north edge of the world lies here.",
  exits: {
    south: "world/1-3" as RoomId,
    east: "world/0-4" as RoomId,
    west: "world/0-2" as RoomId,
  },
};

export default room;
