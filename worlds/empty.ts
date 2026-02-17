import type { RoomId } from "../src/types";
import type { WorldDefinition } from "../src/world/world-definition";

const emptyWorld: WorldDefinition = {
  name: "Empty",
  startRoom: "void/center" as RoomId,
  rooms: {
    "void/center": {
      short: "The Void",
      long: "An infinite expanse of nothing. You float in silence.",
    },
  },
  quests: [],
  guideNotes: [],
};

export default emptyWorld;
