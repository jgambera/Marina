import type { RoomId, RoomModule } from "../../../src/types";

const room: RoomModule = {
  short: "Sector 4-4",
  long: "An empty sector at coordinates (4, 4). The south and east edge of the world lies here.",
  exits: {
    north: "world/3-4" as RoomId,
    west: "world/4-3" as RoomId,
  },
};

export default room;
