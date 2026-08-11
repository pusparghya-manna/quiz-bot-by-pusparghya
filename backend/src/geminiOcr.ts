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
        'User-Agent': 'aistudio-build'
      }
    }
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
6. Extract EVERY single question accurately without skipping.`;

  const imagePart = {
    inlineData: {
      mimeType: mimeType || 'image/jpeg',
      data: fileBase64
    }
  };

  const response = await ai.models.generateContent({
    model: 'gemini-3.6-flash',
    contents: {
      parts: [imagePart, { text: promptText }]
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
                question: { type: Type.STRING, description: 'Preserved question text' },
                options: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: 'List of option choices'
                },
                answer: {
                  type: Type.INTEGER,
                  nullable: true,
                  description: '0-based index of correct option, or null if unknown'
                },
                marks: { type: Type.NUMBER, description: 'Marks for correct answer' },
                negativeMarks: { type: Type.NUMBER, description: 'Negative marks for wrong answer' }
              },
              required: ['question', 'options']
            }
          }
        },
        required: ['questions']
      }
    }
  });

  const responseText = response.text || '{}';
  try {
    const parsed = JSON.parse(responseText);
    return parsed;
  } catch (err) {
    console.error('Failed to parse Gemini OCR JSON output:', responseText);
    throw new Error('Failed to parse structured questions from OCR response.');
  }
}
