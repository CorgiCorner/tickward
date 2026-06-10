// Shared WebMCP surface used by both the inline registration script (rendered
// into the homepage HTML) and the WebMcpTools client bridge. The browser API
// (navigator.modelContext) is experimental, so everything is typed locally and
// feature-detected at runtime instead of relying on DOM lib types.

export type WebMcpToolResult = { content: Array<{ type: "text"; text: string }> }

export type WebMcpToolDefinition = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export type WebMcpTool = WebMcpToolDefinition & {
  annotations?: { readOnlyHint?: boolean }
  execute: (args?: unknown) => WebMcpToolResult | Promise<WebMcpToolResult>
}

export type WebMcpBridge = {
  execute: ((name: string, args?: unknown) => WebMcpToolResult) | null
}

declare global {
  interface Window {
    __tickwardWebMcp?: WebMcpBridge
    __tickwardWebMcpRegistered?: boolean
  }
}

export const WEBMCP_TOOL_DEFINITIONS: WebMcpToolDefinition[] = [
  {
    name: "list_timers",
    description: "List the countdown timers in the tickward project currently open on this page (read-only).",
    inputSchema: {
      type: "object",
      properties: {
        include_archived: {
          type: "boolean",
          description: "Include archived timers in the result. Defaults to false.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_project_overview",
    description:
      "Summarize the tickward project currently open on this page: name, spaces, timer counts, and the next upcoming deadline (read-only).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
]

const BRIDGE_POLL_INTERVAL_MS = 200
const BRIDGE_POLL_BUDGET_MS = 10_000

/**
 * Inline script that registers the WebMCP tools while the HTML document is
 * still parsing. Agent scanners install `navigator.modelContext` before any
 * page script runs and snapshot registrations around DOMContentLoaded, which
 * is earlier than React hydration — so registration cannot wait for the client
 * bundle. Tool calls are forwarded to the WebMcpTools client bridge once it
 * hydrates; until then they wait briefly instead of failing.
 */
export function webMcpInlineScript(): string {
  return `(function () {
  var modelContext = typeof navigator === "undefined" ? null : navigator.modelContext;
  if (!modelContext || window.__tickwardWebMcpRegistered) return;
  function callBridge(name, args) {
    var bridge = window.__tickwardWebMcp;
    if (bridge && typeof bridge.execute === "function") return bridge.execute(name, args);
    return new Promise(function (resolve) {
      var waitedMs = 0;
      var timer = setInterval(function () {
        var lateBridge = window.__tickwardWebMcp;
        if (lateBridge && typeof lateBridge.execute === "function") {
          clearInterval(timer);
          resolve(lateBridge.execute(name, args));
          return;
        }
        waitedMs += ${BRIDGE_POLL_INTERVAL_MS};
        if (waitedMs >= ${BRIDGE_POLL_BUDGET_MS}) {
          clearInterval(timer);
          resolve({ content: [{ type: "text", text: "The page is still loading; retry this tool in a moment." }] });
        }
      }, ${BRIDGE_POLL_INTERVAL_MS});
    });
  }
  var tools = ${JSON.stringify(WEBMCP_TOOL_DEFINITIONS)}.map(function (definition) {
    return {
      name: definition.name,
      description: definition.description,
      inputSchema: definition.inputSchema,
      annotations: { readOnlyHint: true },
      execute: function (args) {
        return callBridge(definition.name, args);
      },
    };
  });
  try {
    if (typeof modelContext.registerTool === "function") {
      for (var i = 0; i < tools.length; i++) modelContext.registerTool(tools[i]);
    } else if (typeof modelContext.provideContext === "function") {
      modelContext.provideContext({ tools: tools });
    } else {
      return;
    }
    window.__tickwardWebMcpRegistered = true;
  } catch (error) {
    // WebMCP is experimental; never let a registration failure break the page.
  }
})();`
}
