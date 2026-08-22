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
7. IMAGE / DIAGRAM DETECTION:
   - If a question includes a photograph, diagram, graph, chart, map, biological figure, chemical structure, or any visual that belongs to that question, set has_image=true.
   - Provide image_bbox as pixel coordinates on THIS source image: { x, y, width, height } with origin at the top-left of the full page image.
   - The bbox must tightly crop only that question's visual (not the whole page, not option text).
   - Do NOT describe the diagram in text as a replacement for the image. Keep has_image/image_bbox instead.
   - For text-only questions set has_image=false and image_bbox=null.
8. question_number should be the printed number when visible.`;

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
                  description: 'True when a diagram/photo/graph belongs to this question',
                },
                image_bbox: {
                  type: Type.OBJECT,
                  nullable: true,
                  properties: {
                    x: { type: Type.NUMBER },
                    y: { type: Type.NUMBER },
                    width: { type: Type.NUMBER },
                    height: { type: Type.NUMBER },
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
