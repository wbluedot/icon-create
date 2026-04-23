import OpenAI from "openai";
import fs from "fs";
import path from "path";

console.log("convert-icon function started");
console.log("cwd:", process.cwd());
console.log("OPENAI_API_KEY exists:", !!process.env.OPENAI_API_KEY);

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const promptPath = path.join(process.cwd(), "prompts/icon-style.md");
console.log("prompt path:", promptPath);

let basePrompt = "";
try {
  basePrompt = fs.readFileSync(promptPath, "utf-8");
  console.log("prompt file loaded successfully");
} catch (error) {
  console.error("failed to read prompt file:", error);
  throw error;
}

function buildPrompt({ angle = "front", background = "transparent" }) {
  const angleMap = {
    front: "front view",
    left45: "left 45 degree view",
    right45: "right 45 degree view",
  };

  const bgText =
    background === "white"
      ? "pure white background"
      : "transparent background";

  return `
${basePrompt}

## Input Instruction
Use the uploaded image as the main shape reference.

## Transform Instruction
Rebuild the uploaded reference as a standalone 3D object icon.
Do not place it on a square app icon tile, plate, badge, or base.
Do not turn it into a symbol printed on a surface.
The object itself must become the icon.

## Adjustments
Angle: ${angleMap[angle] || "front view"}
Background: ${bgText}

## Output Goal
Create a clean, soft, rounded 3D object in the same silhouette family as the uploaded image.
`;
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
  console.log("request method:", req.method);

  if (req.method !== "POST") {
    return safeJson(res, 405, { error: "Method not allowed" });
  }

  try {
    const { imageBase64, background = "transparent", angle = "front" } = req.body || {};
    console.log("request body received");
    console.log("background:", background, "angle:", angle);
    console.log("imageBase64 exists:", !!imageBase64);

    if (!process.env.OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY is not set");
      return safeJson(res, 500, { error: "OPENAI_API_KEY is not set" });
    }

    if (!imageBase64 || typeof imageBase64 !== "string") {
      console.error("imageBase64 is missing or invalid");
      return safeJson(res, 400, { error: "imageBase64 is required" });
    }

    const prompt = buildPrompt({ angle, background });
    const imageDataUrl = imageBase64.startsWith("data:")
      ? imageBase64
      : `data:image/png;base64,${imageBase64}`;

    console.log("calling OpenAI images.edit...");

    const result = await client.images.edit({
      model: "dall-e-2",
      image: imageDataUrl,
      prompt,
      size: "1024x1024",
    });

    console.log("OpenAI images.edit completed");

    const b64 = result?.data?.[0]?.b64_json;

    if (!b64) {
      console.error("No image returned from OpenAI", result);
      return safeJson(res, 502, { error: "No image returned from OpenAI" });
    }

    console.log("returning generated image");
    return safeJson(res, 200, {
      imageBase64: `data:image/png;base64,${b64}`,
    });
  } catch (error) {
    console.error("Image generation failed:", error);
    const status = error?.status || 500;
    return safeJson(res, status, {
      error: "Image generation failed",
      detail: error?.message || "Unknown error",
    });
  }
}
