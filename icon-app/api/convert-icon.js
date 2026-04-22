import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function buildPrompt({ angle = "front", background = "transparent" }) {
  const angleMap = {
    front: "front-facing",
    left45: "left 45-degree view",
    right45: "right 45-degree view",
  };

  const bgText = background === "transparent"
    ? "transparent background"
    : "clean white background";

  return [
    "Create a minimal 3D icon from the uploaded image.",
    "Style: cute, soft, rounded 3D illustration.",
    "Design language: Toss-inspired, extremely clean and minimal.",
    "Material: smooth matte plastic, no texture, no gloss, no noise.",
    "Lighting: soft studio lighting, subtle shading, no harsh highlights.",
    `Composition: ${angleMap[angle] || angleMap.front}, centered subject, ${bgText}.`,
    "Use the uploaded image as the main reference for the symbol or object.",
    "Simplify details while preserving the key silhouette and recognizability.",
    "Keep a single main object only. No extra decorations, no scene elements, no stand, no base.",
    "Output should feel like a polished product icon used in a modern interface.",
  ].join(" ");
}

function normalizeBackground(background) {
  return background === "white" ? "opaque" : "transparent";
}

function safeJson(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "15mb",
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return safeJson(res, 405, { error: "Method not allowed" });
  }

  try {
    const { imageBase64, background = "transparent", angle = "front" } = req.body || {};

    if (!process.env.OPENAI_API_KEY) {
      return safeJson(res, 500, { error: "OPENAI_API_KEY is not set" });
    }

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return safeJson(res, 400, { error: "imageBase64 is required" });
    }

    const prompt = buildPrompt({ angle, background });
    const imageDataUrl = imageBase64.startsWith("data:")
      ? imageBase64
      : `data:image/png;base64,${imageBase64}`;

    const result = await client.images.edit({
      model: "gpt-image-1",
      image: imageDataUrl,
      prompt,
      size: "1024x1024",
      quality: "medium",
      output_format: "png",
      background: normalizeBackground(background),
    });

    const b64 = result?.data?.[0]?.b64_json;

    if (!b64) {
      return safeJson(res, 502, { error: "No image returned from OpenAI" });
    }

    return safeJson(res, 200, {
      imageBase64: `data:image/png;base64,${b64}`,
    });
  } catch (error) {
    const status = error?.status || 500;
    return safeJson(res, status, {
      error: "Image generation failed",
      detail: error?.message || "Unknown error",
    });
  }
}
