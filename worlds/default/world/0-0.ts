import type { RoomId, RoomModule } from "../../../src/types";

const room: RoomModule = {
  short: "Sector 0-0",
  long: "An empty sector at coordinates (0, 0). The north and west edge of the world lies here.",
  exits: {
    south: "world/1-0" as RoomId,
    east: "world/0-1" as RoomId,
  },
};

export default room;
