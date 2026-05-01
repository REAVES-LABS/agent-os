#!/usr/bin/env node
// MCP server entrypoint. Exposes 4 tools over stdio:
//   submit_action, record_outcome, get_routing, recover
//
// First principles: any agent that speaks MCP can now ask a supervisor
// "is it safe for me to do X?" without caring which LLM the supervisor
// is running on.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AgentOS } from "./index.js";

const os = new AgentOS();

const server = new McpServer({
  name: "agent-os",
  version: "0.1.0",
});

server.registerTool(
  "submit_action",
  {
    title: "Submit an action for supervision",
    description:
      "Submit a proposed action to the supervisor. Returns a verdict (auto / supervised / escalate) plus a trust score for the action's category. If verdict is 'auto', the action was written to the outbox; otherwise it was queued for human approval.",
    inputSchema: {
      agentId: z.string().describe("Identifier for the calling agent."),
      category: z
        .string()
        .describe(
          "Action category (e.g. 'send_email', 'commit_code', 'place_trade'). Trust scores are tracked per category.",
        ),
      action: z.string().describe("Plain-English description of the proposed action."),
      irreversibility: z
        .enum(["reversible", "external", "irreversible"])
        .optional()
        .describe(
          "reversible = local file write, no external calls. external = email, API call. irreversible = paid, sent, posted, traded.",
        ),
      context: z
        .string()
        .optional()
        .describe("Optional extra context the supervisor should weigh."),
    },
  },
  async (args) => {
    const out = await os.submit({
      agentId: args.agentId,
      category: args.category,
      action: args.action,
      irreversibility: args.irreversibility,
      context: args.context,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
    };
  },
);

server.registerTool(
  "record_outcome",
  {
    title: "Record an outcome",
    description:
      "After executing an action, report back so the supervisor can update the category's trust score. capability x quality x impact = worth, which moves the trust score's rolling average.",
    inputSchema: {
      actionId: z.string(),
      success: z.boolean(),
      capability: z.number().min(0).max(1).optional().describe("Did the output exist? 0..1"),
      quality: z.number().min(0).max(1).optional().describe("Was it good? 0..1"),
      impact: z.number().min(0).max(1).optional().describe("Did it produce value? 0..1"),
      notes: z.string().optional(),
    },
  },
  async (args) => {
    const out = await os.recordOutcome(args);
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  },
);

server.registerTool(
  "get_routing",
  {
    title: "Get routing recommendation",
    description:
      "Ask the supervisor which specialist role should handle a description. Useful when an upstream agent wants to fan out to a sub-agent.",
    inputSchema: {
      description: z.string(),
      candidates: z
        .array(z.string())
        .optional()
        .describe("Optional candidate roles to constrain routing to."),
    },
  },
  async (args) => {
    const out = await os.route(args);
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  },
);

server.registerTool(
  "recover",
  {
    title: "Recovery plan for a failed action",
    description:
      "Submit a failed actionId plus error message. Returns a recovery plan: retry instructions, rollback steps, or escalation target.",
    inputSchema: {
      actionId: z.string(),
      error: z.string(),
    },
  },
  async (args) => {
    const out = await os.recover(args);
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  },
);

server.registerTool(
  "status",
  {
    title: "Agent-OS status",
    description:
      "Inspection tool: returns recent actions, count of pending approvals, and trust scores per category.",
    inputSchema: {},
  },
  async () => {
    const out = os.status();
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
