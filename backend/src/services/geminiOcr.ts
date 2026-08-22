import { GoogleGenAI, Type } from '@google/genai';

export function normalizeOcrAnswer(value: unknown, optionCount = 4): number | null {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number' && Number.isInteger(value)) {
    return value >= 0 && value < optionCount ? value : null;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    if (numeric === 0) return 0;
    if (numeric >= 1 && numeric <= optionCount) return numeric - 1;
    return null;
  }

  const numberMatch = raw.match(/(?:OPTION|CHOICE|ANSWER)?\s*[:#-]?\s*([1-9]\d*)\b/i);
  if (numberMatch) {
    const numeric = Number(numberMatch[1]);
    return numeric >= 1 && numeric <= optionCount ? numeric - 1 : null;
  }

  const letterMatch = raw.match(/(?:OPTION|CHOICE|ANSWER)?\s*[:#-]?\s*([A-Z])\b/i);
  if (!letterMatch) return null;
  const index = letterMatch[1].toUpperCase().charCodeAt(0) - 65;
  return index >= 0 && index < optionCount ? index : null;
}

export function normalizeOcrQuestion(raw: any): any {
  const options = Array.isArray(raw?.options)
    ? raw.options.map((option: unknown) =>
        typeof option === 'string' ? option : option && typeof option === 'object' && 'text' in option
          ? String((option as any).text ?? '')
          : String(option ?? '')
      ).slice(0, 4)
    : [];
  const answerValue = raw?.answer ?? raw?.correctAnswer ?? raw?.correct_option ?? raw?.correctOption;
  const normalized: any = {
    ...raw,
    question: String(raw?.question ?? raw?.text ?? '').trim(),
    options,
    answer: normalizeOcrAnswer(answerValue, options.length || 4),
    marks: Number.isFinite(Number(raw?.marks)) && Number(raw.marks) > 0 ? Number(raw.marks) : 1,
    negativeMarks: Number.isFinite(Number(raw?.negativeMarks)) && Number(raw.negativeMarks) >= 0 ? Number(raw.negativeMarks) : 0,
    explanation: raw?.explanation == null ? null : String(raw.explanation),
    subject: raw?.subject == null ? null : String(raw.subject),
  };
  return normalized;
}

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
   - If the paper includes an answer key or marked answer, convert it to the matching index.
   - If no key is printed, solve the question from the visible text when the answer is clear and academically unambiguous.
   - Use null only when the answer is unreadable, ambiguous, outside the options, or cannot be determined reliably. NEVER guess when uncertain.
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
- COORDINATE SYSTEM (mandatory): image_bbox uses a NORMALIZED 0–1000 scale on the ORIGINAL image.
  - x=0, y=0 is the top-left corner of the full page image.
  - x=1000 is the right edge; y=1000 is the bottom edge.
  - Example: a diagram in the center might be {"x": 200, "y": 350, "width": 600, "height": 280}.
  - Do NOT return pixel coordinates of any intermediate resolution. Always normalize to 0–1000.
- image_bbox format: { "x": number, "y": number, "width": number, "height": number } with all values between 0 and 1000.
- Make the box as tight as possible around the visual only (small padding of ~5–15 units is OK).

Do NOT convert the diagram into text and do NOT invent a replacement image. Preserve the original visual via bbox only.`;

  const imagePart = {
    inlineData: {
      mimeType: mimeType || 'image/jpeg',
      data: fileBase64,
    },
  };

  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL || 'gemini-flash-latest',
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
                  description: '0-based index of the correct option; return null only when unreadable or genuinely ambiguous',
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
                    x: {
                      type: Type.NUMBER,
                      description: 'Left edge on 0–1000 scale (0=left of original page)',
                    },
                    y: {
                      type: Type.NUMBER,
                      description: 'Top edge on 0–1000 scale (0=top of original page)',
                    },
                    width: {
                      type: Type.NUMBER,
                      description: 'Width on 0–1000 scale (diagram only, not full question)',
                    },
                    height: {
                      type: Type.NUMBER,
                      description: 'Height on 0–1000 scale (diagram only, not full question)',
                    },
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
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return { questions: parsed.map(normalizeOcrQuestion) };
  return {
    ...parsed,
    questions: Array.isArray(parsed?.questions) ? parsed.questions.map(normalizeOcrQuestion) : [],
  };
}
