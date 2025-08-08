import { NextRequest } from "next/server";
import { z } from "zod";
import { openai } from "@/lib/openai";

const BodySchema = z.object({
  system: z.string().optional().default("You are a helpful API tutor."),
  user: z.string().min(1),
  json: z.boolean().optional().default(false),
  reasoningEffort: z.enum(["low","medium","high"]).optional().default("medium"),
  model: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const { system, user, json, reasoningEffort, model: bodyModel } = BodySchema.parse(await req.json());
  const model = bodyModel ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
  const isGpt5 = model.startsWith("gpt-5");

  const stream = await openai.responses.stream({
    model,
    input: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    ...(json ? { response_format: { type: "json_object" } } : {}),
    ...(isGpt5 ? { reasoning: { effort: reasoningEffort } } : {}),
  });

  // Convert OpenAI event stream → text stream of only the generated text
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          // Text tokens
          if (event.type === "response.output_text.delta") {
            controller.enqueue(event.delta);
          }
          // (Optional) You can also forward reasoning summaries or tool-call deltas here later.
        }
      } catch (err) {
        controller.error(err);
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
