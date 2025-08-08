import { NextRequest } from "next/server";
import { z } from "zod";
import { openai } from "@/lib/openai";
import { executeTool, toolSpecs } from "@/lib/tools";

const BodySchema = z.object({
  system: z.string().optional().default("You are a helpful API tutor."),
  user: z.string().min(1),
  model: z.string().optional(),
  reasoningEffort: z.enum(["low","medium","high"]).optional().default("medium"),
  toolCall: z.object({
    name: z.string(),
    arguments: z.record(z.any()),
  }),
  json: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  const { system, user, model: m, reasoningEffort, toolCall, json } =
    BodySchema.parse(await req.json());

  const model = m ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
  const isGpt5 = model.startsWith("gpt-5");

  // 1) Execute the tool server-side
  const toolResult = await executeTool(toolCall);

  // 2) Ask model to continue, giving it the tool result; stream final answer
  const stream = await openai.responses.stream({
    model,
    input: [
      { role: "system", content: system },
      { role: "user", content: user },
      {
        role: "tool",
        name: toolCall.name,
        content: JSON.stringify(toolResult),
      } as any,
    ],
    tools: toolSpecs as any,
    tool_choice: "auto",
    ...(json ? { text: { format: "json_object" } } : {}),
    ...(isGpt5 ? { reasoning: { effort: reasoningEffort } } : {}),
  });

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "response.output_text.delta") {
            controller.enqueue(event.delta);
          }
        }
      } catch (e) {
        controller.error(e);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
