const ALLOWED_ORIGIN = "https://lauramottaprojects.github.io";

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const origin = req.headers.origin || "";
  if (origin !== ALLOWED_ORIGIN) {
    return res.status(403).json({ error: "Forbidden: origin not allowed" });
  }

  const { contents, systemPrompt } = req.body || {};
  if (!contents || !Array.isArray(contents)) {
    return res.status(400).json({ error: "Missing or invalid contents array" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Server misconfiguration: missing API key" });
  }

  // Step 1: Discover available models
  let availableModels = [];
  try {
    const listRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    if (listRes.ok) {
      const listData = await listRes.json();
      availableModels = (listData.models || [])
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m) => m.name.replace("models/", ""));
      console.log("Available models:", availableModels);
    } else {
      console.error("Failed to list models:", listRes.status);
    }
  } catch (err) {
    console.error("Error listing models:", err.message);
  }

  if (availableModels.length === 0) {
    return res.status(502).json({ error: "No models found for this API key. Check your Google AI Studio project." });
  }

  // Step 2: Try each available model
  const geminiBody = {
    contents,
    systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
    generationConfig: {
      temperature: 0.7,
      topP: 0.95,
      maxOutputTokens: 1024,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  for (const model of availableModels) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiBody),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`${model} error:`, response.status, errText.slice(0, 200));
        continue;
      }

      const data = await response.json();
      const parts = data.candidates?.[0]?.content?.parts || [];
      const reply = parts
        .filter((p) => !p.thought)
        .map((p) => p.text)
        .join("")
        .trim();

      if (!reply) {
        console.error(`${model}: empty reply`);
        continue;
      }

      console.log(`Success with model: ${model}`);
      return res.status(200).json({ reply });
    } catch (err) {
      console.error(`${model} exception:`, err.message);
      continue;
    }
  }

  return res.status(502).json({
    error: `None of ${availableModels.length} available models responded. Models tried: ${availableModels.join(", ")}`,
  });
};
