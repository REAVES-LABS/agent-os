// Library example. Run with: npx tsx examples/library-use.ts
//
// Walks the four primitives end to end against a local Ollama supervisor.

import { AgentOS } from "@reaves-labs/agent-os";

const os = new AgentOS({
  supervisor: { backend: "ollama", model: "llama3.2" },
});

// 1. Submit a reversible action — likely auto.
const localFile = await os.submit({
  agentId: "writer-bot",
  category: "draft_blog_post",
  action: "Draft a 200-word post explaining MCP to a JS developer.",
  irreversibility: "reversible",
});
console.log("draft verdict:", localFile.verdict, "→", localFile.effectPath);

// 2. Submit an irreversible action — supervisor will escalate.
const trade = await os.submit({
  agentId: "trader-7",
  category: "place_trade",
  action: "Open $200 BTC long at market.",
  irreversibility: "irreversible",
});
console.log("trade verdict:", trade.verdict);

// 3. Record an outcome — moves the trust score.
const outcome = await os.recordOutcome({
  actionId: localFile.actionId,
  success: true,
  capability: 1.0,
  quality: 0.85,
  impact: 0.7,
});
console.log("trust", outcome.category, outcome.trustScoreBefore, "→", outcome.trustScoreAfter);

// 4. Routing standalone.
const routed = await os.route({
  description: "We need someone to write a press release for the seed round.",
});
console.log("routing:", routed);

// 5. Snapshot.
console.log(JSON.stringify(os.status(), null, 2));
