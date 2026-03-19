#!/usr/bin/env bun

/**
 * CLI for the lean Marina agent variant.
 * Same interface as cli.ts but uses MarinaLeanAgent.
 */

import "dotenv/config";
import { loadApiKeys } from "../credentials/api-keys";
import { MarinaLeanAgent } from "./lean-agent";

interface CLIOptions {
  wsUrl: string;
  name: string;
  model?: string;
  autonomous?: string;
  prompt?: string;
  role?: string;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: Partial<CLIOptions> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "--ws-url":
      case "-w":
        options.wsUrl = args[++i];
        break;
      case "--name":
      case "-n":
        options.name = args[++i];
        break;
      case "--model":
      case "-m":
        options.model = args[++i];
        break;
      case "--autonomous":
      case "-a":
        options.autonomous = args[++i];
        break;
      case "--prompt":
        options.prompt = args[++i];
        break;
      case "--role":
      case "-r":
        options.role = args[++i];
        break;
      case "--help":
        showHelp();
        process.exit(0);
      default:
        console.error(`Unknown option: ${arg}`);
        showHelp();
        process.exit(1);
    }
  }

  if (!options.wsUrl || !options.name) {
    console.error("Error: --ws-url and --name are required");
    showHelp();
    process.exit(1);
  }

  return options as CLIOptions;
}

function showHelp(): void {
  console.log(`
marina-lean — Lean Marina agent (platform-first, no local state)

Usage:
  marina-lean --ws-url <url> --name <name> [options]

Required:
  --ws-url, -w <url>          Marina WebSocket URL (e.g. ws://localhost:3300/ws)
  --name, -n <name>           Character name

Optional:
  --model, -m <model>         LLM model (default: google/gemini-2.0-flash)
                              Use openrouter/ prefix for OpenRouter models:
                              openrouter/meta-llama/llama-3.3-70b-instruct
                              openrouter/deepseek/deepseek-chat-v3
  --autonomous, -a <goal>     Run autonomously with goal
  --prompt <message>          Send a single prompt and exit
  --role, -r <role>           Agent role: general, architect, scholar, diplomat, mentor, merchant
  --help                      Show this help

Examples:
  marina-lean --ws-url ws://localhost:3300/ws --name LeanBot --autonomous "explore"
  marina-lean --ws-url ws://localhost:3300/ws --name Scholar --role scholar --autonomous "research game mechanics"
  marina-lean --ws-url ws://localhost:3300/ws --name DeepBot --model openrouter/deepseek/deepseek-chat-v3 --autonomous "explore"
`);
}

async function main() {
  await loadApiKeys();

  const options = parseArgs();

  console.log(`[lean] Connecting to ${options.wsUrl} as ${options.name}...`);

  const agent = new MarinaLeanAgent({
    wsUrl: options.wsUrl,
    name: options.name,
    model: options.model,
    role: (options.role as any) || "general",
  });

  // Event logging
  agent.subscribe((event: any) => {
    const type = event.type;
    switch (type) {
      case "agent_start":
      case "agent_end":
      case "turn_start":
        console.log(`[${type}]`);
        break;
      case "turn_end":
        console.log(`[turn_end] stopReason=${event.message?.stopReason ?? "?"}`);
        if (event.message?.stopReason === "error") {
          console.log(`[turn_end ERROR]`, JSON.stringify(event.message)?.slice(0, 500));
        }
        break;
      case "message_end":
        if (event.message?.role === "assistant") {
          const textContent = event.message.content?.find((c: any) => c.type === "text");
          if (textContent?.text) {
            console.log(`\n[Assistant]: ${textContent.text}`);
          }
          const toolCalls = event.message.content?.filter((c: any) => c.type === "toolCall");
          if (toolCalls?.length) {
            console.log(`[Assistant made ${toolCalls.length} tool call(s)]`);
          }
        }
        break;
      case "tool_execution_start":
        console.log(`\n[Tool] ${event.toolName}:`, JSON.stringify(event.args, null, 2));
        break;
      case "tool_execution_end":
        if (!event.isError) {
          const textContent = event.result?.content?.find((c: any) => c.type === "text");
          if (textContent) {
            console.log(`[Tool Result]: ${textContent.text.slice(0, 200)}`);
          }
        } else {
          console.error(`[Tool Error]:`, JSON.stringify(event.result)?.slice(0, 200));
        }
        break;
    }
  });

  try {
    await agent.connect();
    console.log("[lean] Connected successfully!");

    if (options.autonomous) {
      console.log(`\n[lean] Starting autonomous mode`);
      console.log("[lean] Goal:", options.autonomous);
      console.log(
        "[lean] This is the LEAN agent — no local JSON, no curiosity engine, no learning system.",
      );
      console.log("[lean] All memory/knowledge goes through Marina platform commands.\n");

      await agent.runAutonomous(options.autonomous);

      console.log("[lean] Agent is running autonomously. Press Ctrl+C to stop.\n");
      await new Promise(() => {});
    } else if (options.prompt) {
      console.log(`\n[lean] Sending prompt: ${options.prompt}\n`);
      await agent.prompt(options.prompt);
      await agent.waitForIdle();
    } else {
      console.log("\n[lean] No mode selected. Starting autonomous discovery...\n");
      await agent.runAutonomous();
      await new Promise(() => {});
    }

    console.log("\n[lean] Disconnecting...");
    await agent.disconnect();
  } catch (error) {
    console.error("[lean] Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[lean] Fatal error:", error);
  process.exit(1);
});
