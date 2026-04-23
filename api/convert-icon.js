import OpenAI from "openai";
import fs from "fs";
import path from "path";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const promptPath = path.join(process.cwd(), "prompts/icon-style.md");

function safeJson(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function getBasePrompt() {
  try {
    return fs.readFileSync(promptPath, "utf-8");
  } catch (error) {
    console.error("failed to read prompt file:", error);
    throw new Error("프롬프트 파일을 읽을 수 없어요. prompts/icon-style.md 경로를 확인해주세요.");
  }
}

function buildPrompt({ basePrompt, angle = "front", background = "transparent" }) {
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
Return a single final image only.
`;
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "15mb",
    },
  },
};

export default async function handler(req, res) {
  console.log("convert-icon function started");
  console.log("cwd:", process.cwd());
  console.log("OPENAI_API_KEY exists:", !!process.env.OPENAI_API_KEY);
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
      return safeJson(res, 500, { error: "OPENAI_API_KEY is not set" });
    }

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return safeJson(res, 400, { error: "imageBase64 is required" });
    }

    const basePrompt = getBasePrompt();
    const prompt = buildPrompt({ basePrompt, angle, background });

    console.log("calling OpenAI responses.create...");

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      tools: [{ type: "image_generation" }],
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: prompt,
            },
            {
              type: "input_image",
              image_url: imageBase64,
            },
          ],
        },
      ],
    });

    console.log("OpenAI responses.create completed");

    const imageOutput = response.output.find(
      (item) => item.type === "image_generation_call"
    );

    const b64 = imageOutput?.result;

    if (!b64) {
      console.error("No image returned from OpenAI", response.output);
      return safeJson(res, 502, {
        error: "No image returned from OpenAI",
        detail: "응답에 이미지 데이터가 없어요.",
      });
    }

    console.log("returning generated image");

    return safeJson(res, 200, {
      imageBase64: `data:image/png;base64,${b64}`,
    });
  } catch (error) {
    console.error("Image generation failed:", error);
    console.error("error message:", error?.message);
    console.error("error status:", error?.status);

    return safeJson(res, error?.status || 500, {
      error: "Image generation failed",
      detail: error?.message || "Unknown error",
    });
  }
}
