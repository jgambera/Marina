import type { RoomId, RoomModule } from "../../../src/types";

const room: RoomModule = {
  short: "Sector 0-2",
  long: "An empty sector at coordinates (0, 2). The north edge of the world lies here.",
  exits: {
    south: "world/1-2" as RoomId,
    east: "world/0-3" as RoomId,
    west: "world/0-1" as RoomId,
  },
};

export default room;
