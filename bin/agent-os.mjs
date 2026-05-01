#!/usr/bin/env node
// agent-os CLI — verbs:
//   submit    <category> <action> [--irreversibility=...] [--agent=...]
//   outcome   <actionId> <success: true|false> [--capability=N --quality=N --impact=N]
//   route     <description>
//   recover   <actionId> <error>
//   status
//   serve     (start MCP server on stdio)

import { AgentOS } from "../dist/index.js";

const argv = process.argv.slice(2);
const verb = argv[0];

function parseFlags(args) {
  const flags = {};
  const positional = [];
  for (const a of args) {
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      flags[k] = v ?? true;
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

async function main() {
  if (!verb || verb === "--help" || verb === "-h") {
    console.log(`agent-os <verb> [args]

verbs:
  submit    <category> <action>
            [--irreversibility=reversible|external|irreversible]
            [--agent=<id>]
  outcome   <actionId> <success: true|false>
            [--capability=N --quality=N --impact=N --notes="..."]
  route     <description>
  recover   <actionId> <error>
  status
  serve     start MCP server on stdio

env:
  AGENT_OS_SUPERVISOR  anthropic | openai | ollama | generic
  AGENT_OS_MODEL       supervisor model id
  ANTHROPIC_API_KEY / OPENAI_API_KEY / OLLAMA_URL  per backend
`);
    process.exit(0);
  }

  if (verb === "serve") {
    await import("../dist/server.js");
    return;
  }

  const os = new AgentOS();
  const { flags, positional } = parseFlags(argv.slice(1));

  switch (verb) {
    case "submit": {
      const [category, ...rest] = positional;
      const action = rest.join(" ");
      if (!category || !action) {
        console.error("usage: agent-os submit <category> <action>");
        process.exit(2);
      }
      const out = await os.submit({
        agentId: flags.agent ?? "cli",
        category,
        action,
        irreversibility: flags.irreversibility,
      });
      console.log(JSON.stringify(out, null, 2));
      break;
    }
    case "outcome": {
      const [actionId, successStr] = positional;
      if (!actionId || !successStr) {
        console.error("usage: agent-os outcome <actionId> <true|false>");
        process.exit(2);
      }
      const out = await os.recordOutcome({
        actionId,
        success: successStr === "true",
        capability: flags.capability ? Number(flags.capability) : undefined,
        quality: flags.quality ? Number(flags.quality) : undefined,
        impact: flags.impact ? Number(flags.impact) : undefined,
        notes: flags.notes,
      });
      console.log(JSON.stringify(out, null, 2));
      break;
    }
    case "route": {
      const description = positional.join(" ");
      if (!description) {
        console.error("usage: agent-os route <description>");
        process.exit(2);
      }
      const out = await os.route({ description });
      console.log(JSON.stringify(out, null, 2));
      break;
    }
    case "recover": {
      const [actionId, ...rest] = positional;
      const error = rest.join(" ");
      if (!actionId || !error) {
        console.error("usage: agent-os recover <actionId> <error>");
        process.exit(2);
      }
      const out = await os.recover({ actionId, error });
      console.log(JSON.stringify(out, null, 2));
      break;
    }
    case "status": {
      console.log(JSON.stringify(os.status(), null, 2));
      break;
    }
    default:
      console.error(`unknown verb: ${verb}`);
      process.exit(2);
  }
}

main().catch((e) => {
  console.error(e?.stack ?? e);
  process.exit(1);
});
