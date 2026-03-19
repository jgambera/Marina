/**
 * Social awareness and interaction system
 * Processes Perception objects to detect social events
 */

import type { Perception } from "../net/types";

export interface SocialEvent {
  type: SocialEventType;
  speaker?: string;
  message?: string;
  target?: string;
  channel?: string;
  timestamp: number;
}

export type SocialEventType =
  | "player_joined"
  | "player_left"
  | "player_says"
  | "player_tells"
  | "player_emote"
  | "player_shout"
  | "player_entered_room"
  | "player_left_room"
  | "channel_message"
  | "broadcast_message"
  | "group_invite"
  | "trade_request";

export class SocialAwareness {
  private socialEvents: SocialEvent[] = [];
  private entitiesInRoom: Set<string> = new Set();
  private recentSpeakers: Map<string, number> = new Map();

  /**
   * Process a Perception for social events
   */
  handlePerception(p: Perception): SocialEvent[] {
    const events: SocialEvent[] = [];
    const timestamp = Date.now();

    switch (p.kind) {
      case "message": {
        const data = p.data as {
          from?: string;
          to?: string;
          message?: string;
          type?: string;
          channel?: string;
        };

        if (data.channel) {
          // Channel message
          events.push({
            type: "channel_message",
            speaker: data.from,
            message: data.message,
            channel: data.channel,
            timestamp,
          });
        } else if (data.to) {
          // Private tell
          events.push({
            type: "player_tells",
            speaker: data.from,
            message: data.message,
            target: data.to,
            timestamp,
          });
        } else {
          // Room say
          events.push({
            type: "player_says",
            speaker: data.from,
            message: data.message,
            timestamp,
          });
        }

        if (data.from) {
          this.recentSpeakers.set(data.from, timestamp);
        }
        break;
      }

      case "broadcast": {
        const data = p.data as {
          from?: string;
          message?: string;
          type?: string;
        };

        events.push({
          type: "broadcast_message",
          speaker: data.from,
          message: data.message,
          timestamp,
        });

        if (data.from) {
          this.recentSpeakers.set(data.from, timestamp);
        }
        break;
      }

      case "movement": {
        const data = p.data as {
          entity?: string;
          entityName?: string;
          direction?: string;
          type?: string;
        };

        const entityName = data.entityName || data.entity || "Someone";

        if (data.type === "arrive" || data.direction === "arrive") {
          events.push({
            type: "player_entered_room",
            speaker: entityName,
            timestamp,
          });
          this.entitiesInRoom.add(entityName);
        } else if (data.type === "depart" || data.direction) {
          events.push({
            type: "player_left_room",
            speaker: entityName,
            message: data.direction,
            timestamp,
          });
          this.entitiesInRoom.delete(entityName);
        }
        break;
      }

      case "system": {
        const data = p.data as {
          type?: string;
          entity?: string;
          entityName?: string;
          message?: string;
        };

        if (data.type === "login" || data.type === "connect") {
          events.push({
            type: "player_joined",
            speaker: data.entityName || data.entity,
            timestamp,
          });
        } else if (data.type === "logout" || data.type === "disconnect") {
          events.push({
            type: "player_left",
            speaker: data.entityName || data.entity,
            timestamp,
          });
        }
        break;
      }
    }

    // Store events
    this.socialEvents.push(...events);

    // Keep only recent events (last 100)
    if (this.socialEvents.length > 100) {
      this.socialEvents = this.socialEvents.slice(-100);
    }

    return events;
  }

  /**
   * Update entities in room from room perception data
   */
  updateEntitiesInRoom(entities: Array<{ name: string }>): void {
    this.entitiesInRoom.clear();
    for (const entity of entities) {
      if (entity.name) {
        this.entitiesInRoom.add(entity.name);
      }
    }
  }

  /**
   * Get entities currently in room
   */
  getEntitiesInRoom(): string[] {
    return Array.from(this.entitiesInRoom);
  }

  /**
   * Check if should respond to message
   */
  shouldRespond(event: SocialEvent, myName: string): boolean {
    // Always respond to direct tells
    if (event.type === "player_tells") {
      return true;
    }

    // Respond if mentioned by name
    if (event.message && event.message.toLowerCase().includes(myName.toLowerCase())) {
      return true;
    }

    // Respond to questions directed at everyone
    if (event.message && event.message.includes("?") && event.type === "player_says") {
      return Math.random() > 0.5;
    }

    // Respond to greetings if recently active
    if (event.message && event.message.match(/\b(hello|hi|hey)\b/i)) {
      return Math.random() > 0.3;
    }

    return false;
  }

  /**
   * Score a social event by priority for perception buffering.
   * Higher scores = more important = should interrupt the agent.
   */
  scorePerception(event: SocialEvent, myName: string): number {
    const lowerName = myName.toLowerCase();

    // Direct tell to me
    if (event.type === "player_tells" && event.target?.toLowerCase() === lowerName) {
      return 100;
    }

    // Name mentioned in any message
    if (event.message && event.message.toLowerCase().includes(lowerName)) {
      return 80;
    }

    switch (event.type) {
      case "player_says":
      case "player_shout":
      case "player_emote":
        return 50;
      case "channel_message":
        return 40;
      case "player_entered_room":
      case "player_left_room":
        return 30;
      case "broadcast_message":
        return 20;
      case "player_joined":
      case "player_left":
        return 10;
      default:
        return 15;
    }
  }

  /**
   * Get recent social events
   */
  getRecentEvents(limit = 10): SocialEvent[] {
    return this.socialEvents.slice(-limit);
  }

  /**
   * Get active speakers (spoke in last 5 minutes)
   */
  getActiveSpeakers(): string[] {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const active: string[] = [];

    for (const [speaker, timestamp] of this.recentSpeakers.entries()) {
      if (timestamp > fiveMinutesAgo) {
        active.push(speaker);
      }
    }

    return active;
  }

  /**
   * Generate social context summary
   */
  getSocialContext(): string {
    const lines: string[] = [];

    if (this.entitiesInRoom.size > 0) {
      lines.push(`Entities in room: ${Array.from(this.entitiesInRoom).join(", ")}`);
    }

    const activeSpeakers = this.getActiveSpeakers();
    if (activeSpeakers.length > 0) {
      lines.push(`Recently active: ${activeSpeakers.join(", ")}`);
    }

    const recentEvents = this.getRecentEvents(5);
    if (recentEvents.length > 0) {
      lines.push("\nRecent social events:");
      for (const event of recentEvents) {
        if (event.channel) {
          lines.push(`  - [${event.channel}] ${event.speaker}: ${event.message || event.type}`);
        } else {
          lines.push(`  - ${event.speaker}: ${event.message || event.type}`);
        }
      }
    }

    return lines.length > 0 ? lines.join("\n") : "No recent social activity";
  }

  /**
   * Clear social state
   */
  reset(): void {
    this.socialEvents = [];
    this.entitiesInRoom.clear();
    this.recentSpeakers.clear();
  }
}
