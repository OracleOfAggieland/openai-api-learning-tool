export type ToolCall = { name: string; arguments: Record<string, any> };

export const toolSpecs = [
  {
    type: "function",
    function: {
      name: "getServerTime",
      description: "Get the current server time in a given IANA time zone.",
      parameters: {
        type: "object",
        properties: {
          timeZone: {
            type: "string",
            description: "IANA time zone like 'America/Chicago' or 'UTC'.",
          },
        },
        required: ["timeZone"],
        additionalProperties: false,
      },
    },
  },
] as const;

export async function executeTool(call: ToolCall) {
  switch (call.name) {
    case "getServerTime": {
      const tz = String(call.arguments?.timeZone || "UTC");
      const now = new Date();
      const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      return { timeZone: tz, iso: now.toISOString(), formatted: fmt.format(now) };
    }
    default:
      return { error: `Unknown tool: ${call.name}` };
  }
}
