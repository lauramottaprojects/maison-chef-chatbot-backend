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

  const models = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
  ];

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

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

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiBody),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`Gemini ${model} error:`, response.status, errText);
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
        console.error(`Gemini ${model}: empty reply`, JSON.stringify(data).slice(0, 500));
        continue;
      }

      return res.status(200).json({ reply });
    } catch (err) {
      console.error(`Gemini ${model} exception:`, err.message);
      continue;
    }
  }

  return res.status(502).json({
    error: "No Gemini model responded successfully. Check Vercel function logs.",
  });
};
