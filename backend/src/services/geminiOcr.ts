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
For every question, decide if it has a REAL drawn visual (diagram, figure, graph, chart, map, biological drawing, chemical structure, pedigree, Venn circles, labeled organ drawing).

has_image / image_bbox rules:
- NO visual → "has_image": false, "image_bbox": null.
- HAS visual → "has_image": true AND a precise "image_bbox" for THAT question only.

CRITICAL image_bbox RULES (wrong crops break the exam):
1. image_bbox = ONLY the diagram/drawing for THIS question number.
2. NEVER put option lines (a)(b)(c)(d), question stem text, question numbers, or neighboring questions inside the box.
3. DO include labels that are part of the drawing (A,B,C,D,E on a figure; X,Y,Z,Q on circles; arrows; axis text printed ON the figure).
4. On typical exam pages the figure is often on the RIGHT of the options — box the figure on the right, not the option list on the left.
5. Each question with a figure must get its OWN unique bbox. Do not reuse the same box for two questions.
6. The full diagram must fit inside the box (not half a sperm cell, not half a Venn set). Prefer a slightly larger tight box over a clipped figure.
7. If you cannot locate the diagram confidently, set has_image=false and image_bbox=null (text-only is better than a wrong crop).

COORDINATE SYSTEM (mandatory):
- image_bbox uses NORMALIZED 0–1000 on the FULL page image you received.
- x=0,y=0 top-left; x=1000 right edge; y=1000 bottom edge.
- Example right-side figure: {"x": 620, "y": 120, "width": 340, "height": 280}
- Always 0–1000 units. Never raw pixel coordinates of a different resolution.

image_bbox format: { "x", "y", "width", "height" } all numbers in 0..1000.

Do NOT invent a replacement image. Preserve the original visual via bbox only.`;

  const modelCandidates = [
    process.env.GEMINI_MODEL,
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-flash-lite-latest',
  ].filter((m, i, arr) => Boolean(m) && arr.indexOf(m) === i) as string[];

  const imagePart = {
    inlineData: {
      mimeType: mimeType || 'image/jpeg',
      data: fileBase64,
    },
  };

  let response: any = null;
  let lastErr: any = null;
  for (const model of modelCandidates) {
    try {
      response = await ai.models.generateContent({
        model,
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
                      description:
                        '0-based index of the correct option; return null only when unreadable or genuinely ambiguous',
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
      console.log('[ocr] Gemini model used:', model);
      lastErr = null;
      break;
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message || e || '');
      const busy =
        /high demand|UNAVAILABLE|503|429|resource exhausted|quota|timed out|timeout|unavailable/i.test(
          msg
        );
      console.warn('[ocr] model failed:', model, msg.slice(0, 180));
      if (!busy) {
        // Non-retryable (bad key, invalid arg) — stop early
        break;
      }
    }
  }
  if (!response) {
    const detail = String(lastErr?.message || lastErr || 'unknown error');
    if (/high demand|UNAVAILABLE|503/i.test(detail)) {
      throw new Error(
        'Gemini is busy (high demand). Please try Photo OCR again in a minute. If this keeps happening, the model may be overloaded.'
      );
    }
    throw new Error(detail || 'Gemini OCR failed');
  }

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
