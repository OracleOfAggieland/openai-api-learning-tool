import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { openai } from "@/lib/openai";
import { toolSpecs } from "@/lib/tools";

const BodySchema = z.object({
  system: z.string().optional().default("You are a helpful API tutor."),
  user: z.string().min(1),
  json: z.boolean().optional().default(false),
  reasoningEffort: z.enum(["low","medium","high"]).optional().default("medium"),
  model: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const body = BodySchema.parse(await req.json());
  const model = body.model ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
  const isGpt5 = model.startsWith("gpt-5");

  const response = await openai.responses.create({
    model,
    input: [
      { role: "system", content: body.system },
      { role: "user", content: body.user },
    ],
    tools: toolSpecs as any,
    tool_choice: "auto",
    ...(body.json ? { text: { format: "json_object" } } : {}),
    ...(isGpt5 ? { reasoning: { effort: body.reasoningEffort } } : {}),
  });

  const outputs: any[] = (response as any).output ?? [];
  let toolCall: { name: string; arguments: any } | null = null;

  for (const out of outputs) {
    const content = out?.content ?? [];
    for (const c of content) {
      // Responses API emits {type:"function_call", name, arguments} for tool calls
      if (c?.type === "function_call" && c?.name) {
        toolCall = {
          name: c.name,
          arguments: safeParseJSON(c.arguments),
        };
      }
    }
  }

  const text = (response as any).output_text ?? "";
  return NextResponse.json({ ok: true, model, toolCall, text, raw: response });
}

function safeParseJSON(s: any) {
  if (typeof s !== "string") return s;
  try { return JSON.parse(s); } catch { return s; }
}
