#!/usr/bin/env bun

/**
 * CLI for marina-bot
 * Allows running the bot from command line
 */

import "dotenv/config";
import { loadApiKeys } from "../credentials/api-keys";
import { MarinaAgent } from "./marina-agent";

interface CLIOptions {
  wsUrl: string;
  mcpUrl?: string;
  name: string;
  model?: string;
  autonomous?: string;
  prompt?: string;
}

/**
 * Parse command line arguments
 */
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

      case "--mcp-url":
        options.mcpUrl = args[++i];
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

      case "--help":
        showHelp();
        process.exit(0);

      default:
        console.error(`Unknown option: ${arg}`);
        showHelp();
        process.exit(1);
    }
  }

  // Validate required options
  if (!options.wsUrl || !options.name) {
    console.error("Error: --ws-url and --name are required");
    showHelp();
    process.exit(1);
  }

  return options as CLIOptions;
}

/**
 * Show help message
 */
function showHelp(): void {
  console.log(`
marina-bot - LLM-powered autonomous agent for Marina

Usage:
  marina-bot --ws-url <url> --name <name> [options]

Required Options:
  --ws-url, -w <url>          Marina WebSocket URL (e.g. ws://localhost:3300/ws)
  --name, -n <name>           Character name to login with

Optional Options:
  --mcp-url <url>             Marina MCP URL (e.g. http://localhost:3300/mcp)
  --model, -m <model>         LLM model to use (default: google/gemini-2.0-flash)
                              Use openrouter/ prefix for OpenRouter models:
                              openrouter/meta-llama/llama-3.3-70b-instruct
  --autonomous, -a <goal>     Run autonomously with specified goal
  --prompt <message>          Send a single prompt and exit
  --help                      Show this help message

Examples:
  # Connect and run interactively
  marina-bot --ws-url ws://localhost:3300/ws --name TestBot

  # Run autonomously with a goal
  marina-bot --ws-url ws://localhost:3300/ws --name Explorer --autonomous "Explore all rooms and map the world"

  # Use an OpenRouter model
  marina-bot --ws-url ws://localhost:3300/ws --name DeepBot --model openrouter/deepseek/deepseek-chat-v3 --autonomous "explore"

  # Send a single prompt
  marina-bot --ws-url ws://localhost:3300/ws --name Scout --prompt "Look around and describe what you see"

  # Use a different model
  marina-bot --ws-url ws://localhost:3300/ws --name Claude --model anthropic/claude-sonnet-4-5
`);
}

/**
 * Main CLI entry point
 */
async function main() {
  await loadApiKeys();

  const options = parseArgs();

  console.log(`Connecting to Marina at ${options.wsUrl} as ${options.name}...`);

  // Create agent
  const agent = new MarinaAgent({
    wsUrl: options.wsUrl,
    mcpUrl: options.mcpUrl,
    name: options.name,
    model: options.model,
  });

  // Set up event handlers
  agent.subscribe((event: any) => {
    // Debug: log ALL events
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
          console.log(`[turn_end ERROR] message:`, JSON.stringify(event.message)?.slice(0, 500));
        }
        break;
      case "message_start":
        console.log(`[message_start] role=${event.message?.role}`);
        break;
      case "message_end":
        if (event.message?.role === "assistant") {
          const textContent = event.message.content?.find((c: any) => c.type === "text");
          if (textContent?.text) {
            console.log(`\n[Assistant]: ${textContent.text}`);
          }
          // Also log tool calls
          const toolCalls = event.message.content?.filter((c: any) => c.type === "toolCall");
          if (toolCalls?.length) {
            console.log(`[Assistant made ${toolCalls.length} tool call(s)]`);
          }
          if (!textContent?.text && !toolCalls?.length) {
            console.log(
              `[message_end] assistant with EMPTY content:`,
              JSON.stringify(event.message.content)?.slice(0, 200),
            );
          }
        } else {
          console.log(`[message_end] role=${event.message?.role}`);
        }
        break;
      case "message_update":
        // Skip streaming updates to avoid noise
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
      default:
        console.log(`[${type}]`);
    }
  });

  try {
    // Connect to Marina
    await agent.connect();
    console.log("Connected successfully!");

    if (options.autonomous) {
      // Run autonomously - fully self-directed
      console.log(`\nStarting autonomous mode\n`);
      console.log("Goal:", options.autonomous);
      console.log("\nThe agent will:");
      console.log("  - Explore the world and discover rooms");
      console.log("  - Communicate via channels, boards, and tells");
      console.log("  - Coordinate with other agents via groups and tasks");
      console.log("  - Build TypeScript rooms when rank permits");
      console.log("  - Learn and adapt strategies\n");

      await agent.runAutonomous(options.autonomous);

      // Agent will run continuously - keep process alive
      console.log("\nAgent is running autonomously");
      console.log("  Press Ctrl+C to stop\n");

      // Keep alive
      await new Promise(() => {});
    } else if (options.prompt) {
      // Send single prompt
      console.log(`\nSending prompt: ${options.prompt}\n`);
      await agent.prompt(options.prompt);

      // Wait for agent to finish
      await agent.waitForIdle();
    } else {
      // Default: Run autonomous discovery
      console.log("\nNo specific mode selected. Starting autonomous discovery mode...\n");
      await agent.runAutonomous();

      // Keep alive
      await new Promise(() => {});
    }

    console.log("\nSession complete. Disconnecting...");
    agent.disconnect();
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run CLI
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
