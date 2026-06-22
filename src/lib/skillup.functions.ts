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
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.search(/[\[{]/);
  if (start === -1) throw new Error("No JSON found in model output");
  const sliced = cleaned.slice(start);
  try {
    return JSON.parse(sliced) as T;
  } catch {
    const last = Math.max(sliced.lastIndexOf("}"), sliced.lastIndexOf("]"));
    if (last > 0) return JSON.parse(sliced.slice(0, last + 1)) as T;
    throw new Error("Failed to parse JSON from model output");
  }
}

export type ResumeAnalysis = {
  score: number;
  summary: string;
  detectedSkills: string[];
  strengths: string[];
  weaknesses: string[];
  missingElements: string[];
  improvementSuggestions: string[];
  sections: {
    technicalSkills: string[];
    projects: string[];
    internships: string[];
    education: string[];
    certifications: string[];
  };
};

export const analyzeResume = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      text: z.string().min(50, "Resume text is too short").max(50_000),
    }),
  )
  .handler(async ({ data }): Promise<{ analysis: ResumeAnalysis }> => {
    const model = getModel();
    const prompt = `You are an expert resume reviewer. Analyze the resume below STRICTLY based on its content. Do not invent facts. If a section is missing, list it under missingElements.

Return ONLY valid JSON matching this TypeScript type:
{
  "score": number,                  // 0-100 overall resume strength
  "summary": string,                // 1-2 sentence overview
  "detectedSkills": string[],       // normalized technical skills found (e.g. "React", "Python", "AWS")
  "strengths": string[],            // 3-6 short bullets
  "weaknesses": string[],           // 3-6 short bullets
  "missingElements": string[],      // e.g. "GitHub profile", "Professional summary", "Measurable achievements"
  "improvementSuggestions": string[], // 3-6 concrete actions
  "sections": {
    "technicalSkills": string[],
    "projects": string[],          // short project titles/one-liners
    "internships": string[],       // role @ company - dates if present
    "education": string[],         // degree, institution, year
    "certifications": string[]
  }
}

RESUME:
"""
${data.text}
"""`;

    const { text } = await generateText({ model, prompt, temperature: 0.2 });
    const analysis = extractJson<ResumeAnalysis>(text);
    // Clamp score
    analysis.score = Math.max(0, Math.min(100, Math.round(analysis.score ?? 0)));
    return { analysis };
  });

export type SkillGap = {
  role: string;
  matchPct: number;
  detectedSkills: string[];
  requiredSkills: string[];
  matchedSkills: string[];
  missingSkills: string[];
  prioritySkills: string[];
  learningPlan: { skill: string; why: string; resource: string }[];
};

export const analyzeSkillGap = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      role: z.string().min(2).max(80),
      detectedSkills: z.array(z.string().min(1).max(60)).min(0).max(80),
    }),
  )
  .handler(async ({ data }): Promise<{ gap: SkillGap }> => {
    const model = getModel();
    const prompt = `You are a career coach. For the target role "${data.role}", produce the canonical required skill set (10-15 skills), then compare to the candidate's detected skills below.

Candidate detected skills: ${JSON.stringify(data.detectedSkills)}

Matching rules:
- Case-insensitive, normalize aliases (e.g. "JS" == "JavaScript", "Node" == "Node.js").
- matchedSkills = required skills the candidate already has.
- missingSkills = required skills not in candidate list.
- prioritySkills = top 3-5 most impactful missing skills to learn next, ordered by importance.
- matchPct = round(matchedSkills.length / requiredSkills.length * 100).

Return ONLY valid JSON:
{
  "role": "${data.role}",
  "matchPct": number,
  "detectedSkills": string[],
  "requiredSkills": string[],
  "matchedSkills": string[],
  "missingSkills": string[],
  "prioritySkills": string[],
  "learningPlan": [{ "skill": string, "why": string, "resource": string }]
}`;

    const { text } = await generateText({ model, prompt, temperature: 0.2 });
    const gap = extractJson<SkillGap>(text);
    gap.matchPct = Math.max(0, Math.min(100, Math.round(gap.matchPct ?? 0)));
    return { gap };
  });
