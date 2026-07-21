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

  try {
    const model = "gemini-2.0-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const geminiBody = {
      contents,
      systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
      generationConfig: {
        temperature: 0.7,
        topP: 0.95,
        maxOutputTokens: 1024,
      },
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error:", response.status, errText);
      return res.status(502).json({ error: "Gemini API request failed" });
    }

    const data = await response.json();
    const reply =
      data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (!reply) {
      return res.status(502).json({ error: "Empty response from Gemini" });
    }

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
