/**
 * Think Tool - Gives the agent a structured scratchpad for multi-step reasoning.
 * This is a zero-side-effect tool: it does NOT send any commands to the server.
 * It returns the agent's own structured thoughts back into the conversation context,
 * enabling chain-of-thought planning before action.
 */

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";

const thinkToolSchema = Type.Object({
  action: Type.Union(
    [
      Type.Literal("plan"),
      Type.Literal("analyze"),
      Type.Literal("reflect"),
      Type.Literal("hypothesize"),
    ],
    {
      description:
        "Type of reasoning: plan (multi-step action plan), analyze (deep situation analysis), reflect (evaluate recent outcomes), hypothesize (form testable theory about game mechanics)",
    },
  ),
  thought: Type.String({
    description:
      "Your detailed reasoning, analysis, or reflection. Be thorough - this is your scratchpad.",
  }),
  steps: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "Ordered action steps for 'plan' action. Each step should be a concrete, executable action.",
    }),
  ),
  subject: Type.Optional(
    Type.String({
      description:
        "The specific topic being analyzed/hypothesized about (e.g., 'locked door puzzle', 'combat with dragon').",
    }),
  ),
  conclusion: Type.Optional(
    Type.String({
      description: "Key takeaway or decision reached through this reasoning.",
    }),
  ),
  hypothesis: Type.Optional(
    Type.String({
      description:
        "For 'hypothesize' action: the testable hypothesis (e.g., 'The brass key from the cellar unlocks the north tower door').",
    }),
  ),
  experiment: Type.Optional(
    Type.String({
      description:
        "For 'hypothesize' action: how to test the hypothesis (e.g., 'Get brass key, go to north tower, try unlock door').",
    }),
  ),
});

export type ThinkToolInput = Static<typeof thinkToolSchema>;

export interface ThinkToolDetails {
  action: string;
  subject?: string;
  stepCount?: number;
  hasConclusion: boolean;
  hasHypothesis: boolean;
}

export function createThinkTool(): AgentTool<typeof thinkToolSchema, ThinkToolDetails> {
  return {
    name: "think",
    label: "Structured Reasoning",
    description: `A zero-side-effect reasoning tool. Use this to think deeply BEFORE acting on complex problems.
This tool does NOT execute any commands. It structures your reasoning and returns it as context for your next actions.

**When to use this:**
- Before attempting puzzles, quests, or multi-step objectives
- When you're stuck or uncertain about the best approach
- When you need to synthesize information from multiple sources (game state, memories, map)
- After a sequence of actions to evaluate what worked and what didn't
- When you encounter unfamiliar mechanics and want to form theories

**Actions:**

**plan** - Create an ordered, multi-step action plan before executing
- thought: Your reasoning about the situation and approach
- steps: Concrete action steps to follow (e.g., ["Go to cellar", "Get brass key", "Return to tower", "Unlock door"])
- conclusion: Summary of the plan's goal

**analyze** - Deep-dive analysis of a situation, puzzle, or problem
- thought: Your detailed analysis considering all available information
- subject: What you're analyzing (e.g., "locked door in north tower")
- conclusion: What you've determined and what to do next

**reflect** - Evaluate recent actions and outcomes
- thought: What happened, what worked, what didn't, and why
- conclusion: Lessons learned and strategy adjustments

**hypothesize** - Form a testable theory about an unknown game mechanic
- thought: Your reasoning and evidence for the theory
- hypothesis: The specific, testable claim
- experiment: How to test it (concrete steps)
- subject: The mechanic or system you're investigating`,

    parameters: thinkToolSchema,

    async execute(_toolCallId: string, params: ThinkToolInput, _signal?: AbortSignal) {
      const { action, thought, steps, subject, conclusion, hypothesis, experiment } = params;

      const separator = "─".repeat(50);

      switch (action) {
        case "plan": {
          const stepList =
            steps && steps.length > 0
              ? steps.map((s, i) => `  ${i + 1}. ${s}`).join("\n")
              : "  (No explicit steps provided - consider adding steps for clarity)";

          const output = [
            `${separator}`,
            `PLAN${subject ? `: ${subject}` : ""}`,
            `${separator}`,
            "",
            "Reasoning:",
            thought,
            "",
            "Action Steps:",
            stepList,
            "",
            conclusion ? `Goal: ${conclusion}` : "",
            "",
            `${separator}`,
            "Now execute this plan step by step. After each step, verify the outcome before proceeding to the next.",
            `${separator}`,
          ]
            .filter(Boolean)
            .join("\n");

          return {
            content: [{ type: "text", text: output }],
            details: {
              action,
              subject,
              stepCount: steps?.length ?? 0,
              hasConclusion: !!conclusion,
              hasHypothesis: false,
            },
          };
        }

        case "analyze": {
          const output = [
            `${separator}`,
            `ANALYSIS${subject ? `: ${subject}` : ""}`,
            `${separator}`,
            "",
            thought,
            "",
            conclusion ? `Conclusion: ${conclusion}` : "",
            "",
            `${separator}`,
            "Use this analysis to inform your next actions.",
            `${separator}`,
          ]
            .filter(Boolean)
            .join("\n");

          return {
            content: [{ type: "text", text: output }],
            details: {
              action,
              subject,
              hasConclusion: !!conclusion,
              hasHypothesis: false,
            },
          };
        }

        case "reflect": {
          const output = [
            `${separator}`,
            `REFLECTION${subject ? `: ${subject}` : ""}`,
            `${separator}`,
            "",
            thought,
            "",
            conclusion ? `Lessons Learned: ${conclusion}` : "",
            "",
            `${separator}`,
            "Consider saving key insights to memory, then adjust your strategy based on these reflections.",
            `${separator}`,
          ]
            .filter(Boolean)
            .join("\n");

          return {
            content: [{ type: "text", text: output }],
            details: {
              action,
              subject,
              hasConclusion: !!conclusion,
              hasHypothesis: false,
            },
          };
        }

        case "hypothesize": {
          const output = [
            `${separator}`,
            `HYPOTHESIS${subject ? `: ${subject}` : ""}`,
            `${separator}`,
            "",
            "Reasoning:",
            thought,
            "",
            hypothesis ? `Hypothesis: ${hypothesis}` : "",
            experiment ? `Experiment: ${experiment}` : "",
            "",
            `${separator}`,
            "Test this hypothesis now. If confirmed, save to memory as a verified discovery. If disproven, revise and form a new hypothesis.",
            `${separator}`,
          ]
            .filter(Boolean)
            .join("\n");

          return {
            content: [{ type: "text", text: output }],
            details: {
              action,
              subject,
              hasConclusion: !!conclusion,
              hasHypothesis: !!hypothesis,
            },
          };
        }

        default:
          return {
            content: [{ type: "text", text: `Unknown think action: ${action}` }],
            details: {
              action,
              hasConclusion: false,
              hasHypothesis: false,
            },
          };
      }
    },
  };
}
