/**
 * AI-assisted effect suggestion hook.
 *
 * Calls a local Ollama instance (http://localhost:11434) to suggest
 * MoshDither effects based on a natural-language description.
 *
 * Example:
 *   const { suggest, loading, error, result } = useAiSuggestion();
 *   suggest("make it look like a corrupted VHS tape");
 */

import { useState, useCallback } from "react";
import { EFFECT_REGISTRY } from "../types/effectTypes";

export interface AiSuggestionResult {
  effects: {
    type: string;
    name: string;
    reason: string;
    params: Record<string, unknown>;
  }[];
  explanation: string;
}

const OLLAMA_URL = "http://localhost:11434/api/generate";

export function useAiSuggestion() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiSuggestionResult | null>(null);

  const suggest = useCallback(async (description: string): Promise<void> => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const effectCatalog = Object.entries(EFFECT_REGISTRY)
        .map(
          ([type, meta]) =>
            `- ${type}: ${meta.name}. Params: ${Object.keys(meta.defaultParams).join(", ")}`,
        )
        .join("\n");

      const prompt = `You are an expert video effects assistant for MoshDither Studio.

Available effects catalog:
${effectCatalog}

User request: "${description}"

Respond ONLY with a JSON object in this exact format (no markdown, no explanation outside the JSON):
{
  "effects": [
    {
      "type": "<effect_type>",
      "params": { "<param_key>": <value> },
      "reason": "<why this effect fits>"
    }
  ],
  "explanation": "<brief summary>"
}`;

      const response = await fetch(OLLAMA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama3.2",
          prompt,
          stream: false,
          format: "json",
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama returned ${response.status}`);
      }

      const data = await response.json();
      const parsed: AiSuggestionResult = JSON.parse(data.response);
      setResult(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  return { suggest, loading, error, result };
}
