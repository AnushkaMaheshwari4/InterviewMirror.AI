import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";

import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const MODEL = "google/gemini-3-flash-preview";

function getModel() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  return createLovableAiGatewayProvider(key)(MODEL);
}

function extractJson<T>(text: string): T {
  // Strip markdown fences and parse the first JSON object/array.
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.search(/[\[{]/);
  if (start === -1) throw new Error("No JSON found in model output");
  const sliced = cleaned.slice(start);
  // Try parse, then progressively trim from end if trailing text exists.
  try {
    return JSON.parse(sliced) as T;
  } catch {
    const lastBrace = Math.max(sliced.lastIndexOf("}"), sliced.lastIndexOf("]"));
    if (lastBrace > 0) return JSON.parse(sliced.slice(0, lastBrace + 1)) as T;
    throw new Error("Failed to parse JSON from model output");
  }
}

export const generateQuestions = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      category: z.enum(["hr", "technical", "behavioral", "communication", "mixed"]),
      count: z.number().int().min(1).max(10).default(5),
      role: z.string().max(120).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const model = getModel();
    const prompt = `Generate ${data.count} concise interview questions for a ${
      data.role ?? "general software"
    } candidate in the ${data.category} category. Return ONLY a JSON array of strings, no commentary.`;

    const { text } = await generateText({
      model,
      prompt,
      temperature: 0.7,
    });

    const questions = extractJson<string[]>(text);
    if (!Array.isArray(questions)) throw new Error("Model did not return an array");
    return { questions: questions.filter((q) => typeof q === "string").slice(0, data.count) };
  });

const AnswerSchema = z.object({
  question: z.string().min(1),
  transcript: z.string(),
  durationSec: z.number().nonnegative(),
  wordCount: z.number().int().nonnegative(),
  fillerCount: z.number().int().nonnegative(),
  wordsPerMinute: z.number().nonnegative(),
  eyeContactPct: z.number().min(0).max(100).nullable(),
});

export const scoreInterview = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      role: z.string().max(120).optional(),
      answers: z.array(AnswerSchema).min(1).max(20),
    }),
  )
  .handler(async ({ data }) => {
    const model = getModel();

    const summary = data.answers
      .map(
        (a, i) =>
          `Q${i + 1}: ${a.question}\nTranscript: "${a.transcript || "(no speech detected)"}"\nMetrics: ${a.wordCount} words, ${a.fillerCount} fillers, ${a.wordsPerMinute.toFixed(0)} wpm, ${
            a.eyeContactPct == null ? "eye-contact unavailable" : `${a.eyeContactPct.toFixed(0)}% eye contact`
          }, ${a.durationSec.toFixed(1)}s.`,
      )
      .join("\n\n");

    const prompt = `You are an interview coach. Score this candidate's responses for a ${
      data.role ?? "general"
    } role STRICTLY based on the transcripts and measured metrics below. Do NOT invent details. If a transcript is empty, reflect that in the scores and feedback.

${summary}

Return ONLY valid JSON matching this TypeScript type, with all scores 0-100 integers:
{
  "communication": number,
  "confidence": number,
  "technicalClarity": number,
  "overall": number,
  "strengths": string[],
  "weaknesses": string[],
  "recommendations": string[],
  "perAnswer": { "question": string, "feedback": string, "score": number }[]
}`;

    const { text } = await generateText({
      model,
      prompt,
      temperature: 0.3,
    });

    type Report = {
      communication: number;
      confidence: number;
      technicalClarity: number;
      overall: number;
      strengths: string[];
      weaknesses: string[];
      recommendations: string[];
      perAnswer: { question: string; feedback: string; score: number }[];
    };

    const report = extractJson<Report>(text);
    return { report };
  });
