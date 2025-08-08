import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { openai } from "@/lib/openai";

const BodySchema = z.object({
  system: z.string().optional().default("You are a helpful API tutor."),
  user: z.string().min(1, "User prompt is required"),
  // Keep temperature only for non-GPT-5 models (legacy/other)
  temperature: z.number().min(0).max(2).optional(),
  json: z.boolean().optional().default(false),
  reasoningEffort: z.enum(["low","medium","high"]).optional().default("medium"),
  model: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { system, user, temperature, json, reasoningEffort, model: bodyModel } = BodySchema.parse(body);

    const model = bodyModel ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
    const isGpt5 = model.startsWith("gpt-5");

    const request: any = {
      model,
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      ...(json ? { text: { format: "json" } } : {}),
    };

    if (isGpt5) {
      request.reasoning = { effort: reasoningEffort };
    } else if (typeof temperature === "number") {
      request.temperature = temperature;
    }

    const response = await openai.responses.create(request);
    const text =
      response.output_text ??
      (Array.isArray(response.output)
        ? response.output.map((o: any) => ("content" in o ? o.content?.[0]?.text?.value : "")).join("")
        : "");

    return NextResponse.json({ ok: true, model, text, raw: response });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ ok: false, error: err?.message ?? "Unknown error" }, { status: 400 });
  }
}
