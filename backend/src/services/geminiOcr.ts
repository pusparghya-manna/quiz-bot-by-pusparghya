import { GoogleGenAI, Type } from '@google/genai';

export async function parseQuestionsFromMedia(fileBase64: string, mimeType: string): Promise<any> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not configured.');
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'QuizBotByPusparghya',
      },
    },
  });

  const promptText = `Extract all multiple choice examination questions from this question paper document/image into structured JSON.

CRITICAL RULES:
1. Preserve the exact original question text cleanly.
2. Preserve the exact original option text and order. Always extract options into an array of strings.
3. "answer" must be a 0-based integer index corresponding to the correct option:
   - 0 = Option A / First option
   - 1 = Option B / Second option
   - 2 = Option C / Third option
   - 3 = Option D / Fourth option
   - Use null if the correct answer key is not explicitly provided in the question paper. NEVER guess or invent an answer if it is not explicitly marked or provided!
4. Default "marks" to 1 unless explicitly specified otherwise.
5. Default "negativeMarks" to 0 unless explicitly specified otherwise.
6. Extract EVERY single question accurately without skipping.
7. question_number should be the printed number when visible.

IMAGE / DIAGRAM DETECTION (per question — be careful):
For every question, carefully determine whether it contains an actual visual element such as a diagram, photograph, graph, chart, map, figure, illustration, chemical structure, or biological image.

has_image / image_bbox rules:
- If the question has NO actual visual element: set "has_image": false and "image_bbox": null.
- If the question HAS a visual: set "has_image": true and provide "image_bbox".

CRITICAL image_bbox CROPPING RULE:
"image_bbox" must contain ONLY the actual visual/diagram belonging to that question.

DO NOT include in image_bbox:
- question number
- question text
- surrounding paragraphs
- answer options A/B/C/D
- unrelated text
- content from neighboring questions

The question text and options are separate JSON fields and must NOT be part of image_bbox.

- If a diagram appears below the question text, crop only the diagram.
- If it appears above or between parts of the question, crop only the visual itself.
- If the diagram contains labels, arrows, legends, axis labels, annotations, or text that is physically part of the diagram, INCLUDE those in the crop.
- Before returning image_bbox, verify the selected region actually contains a visual/diagram. If the region would contain only printed question text, it is INVALID — use has_image=false and image_bbox=null instead.
- Do NOT use the bounding box of the entire question block as image_bbox.
- Prioritize accurate visual boundaries over the question's text boundaries.
- Coordinates must be relative to the ORIGINAL uploaded image dimensions (top-left origin). Do not use coordinates from a resized or internally scaled representation.
- image_bbox format: { "x": number, "y": number, "width": number, "height": number }

Do NOT convert the diagram into text and do NOT invent a replacement image. Preserve the original visual via bbox only.`;

  const imagePart = {
    inlineData: {
      mimeType: mimeType || 'image/jpeg',
      data: fileBase64,
    },
  };

  const response = await ai.models.generateContent({
    model: 'gemini-3.6-flash',
    contents: {
      parts: [imagePart, { text: promptText }],
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question_number: { type: Type.NUMBER },
                question: { type: Type.STRING, description: 'Preserved question text' },
                options: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: 'List of option choices in order A,B,C,D...',
                },
                answer: {
                  type: Type.INTEGER,
                  nullable: true,
                  description: '0-based index of correct option, or null',
                },
                marks: { type: Type.NUMBER },
                negativeMarks: { type: Type.NUMBER },
                explanation: { type: Type.STRING, nullable: true },
                subject: { type: Type.STRING, nullable: true },
                has_image: {
                  type: Type.BOOLEAN,
                  description:
                    'True only if this question has a real visual (diagram/photo/graph/chart/map/figure). False for text-only questions.',
                },
                image_bbox: {
                  type: Type.OBJECT,
                  nullable: true,
                  description:
                    'Pixel bbox of ONLY the diagram/photo on the original image (not question text, not options, not question number). null when has_image is false.',
                  properties: {
                    x: { type: Type.NUMBER, description: 'Left edge in original image pixels' },
                    y: { type: Type.NUMBER, description: 'Top edge in original image pixels' },
                    width: { type: Type.NUMBER, description: 'Width of visual only in pixels' },
                    height: { type: Type.NUMBER, description: 'Height of visual only in pixels' },
                  },
                  required: ['x', 'y', 'width', 'height'],
                },
              },
              required: ['question', 'options', 'has_image'],
            },
          },
        },
        required: ['questions'],
      },
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error('Empty response from Gemini OCR');
  }
  return JSON.parse(text);
}
