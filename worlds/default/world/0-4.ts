import type { RoomId, RoomModule } from "../../../src/types";

const room: RoomModule = {
  short: "Sector 0-4",
  long: "An empty sector at coordinates (0, 4). The north and east edge of the world lies here.",
  exits: {
    south: "world/1-4" as RoomId,
    west: "world/0-3" as RoomId,
  },
};

export default room;
