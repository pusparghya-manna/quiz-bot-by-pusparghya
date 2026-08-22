import sharp from 'sharp';

export type ImageBBox = { x: number; y: number; width: number; height: number };

export type CroppedQuestionImage = {
  buffer: Buffer;
  mimeType: string;
  width: number;
  height: number;
};

/** Normalize Gemini bbox into pixel coords for the source image. */
export function normalizeBBox(
  bbox: ImageBBox,
  imgWidth: number,
  imgHeight: number
): { left: number; top: number; width: number; height: number } | null {
  if (!bbox || imgWidth < 1 || imgHeight < 1) return null;
  let { x, y, width, height } = bbox;
  if (![x, y, width, height].every((n) => Number.isFinite(n))) return null;

  // Normalized 0–1
  if (x >= 0 && y >= 0 && width > 0 && height > 0 && x <= 1 && y <= 1 && width <= 1 && height <= 1) {
    x *= imgWidth;
    y *= imgHeight;
    width *= imgWidth;
    height *= imgHeight;
  }
  // Gemini often uses 0–1000 normalized boxes
  else if (
    x >= 0 &&
    y >= 0 &&
    width > 0 &&
    height > 0 &&
    x <= 1000 &&
    y <= 1000 &&
    width <= 1000 &&
    height <= 1000
  ) {
    const maxExtent = Math.max(x + width, y + height);
    if (maxExtent <= 1000 && (imgWidth > 1000 || imgHeight > 1000 || maxExtent < Math.max(imgWidth, imgHeight) * 0.9)) {
      x = (x / 1000) * imgWidth;
      y = (y / 1000) * imgHeight;
      width = (width / 1000) * imgWidth;
      height = (height / 1000) * imgHeight;
    }
  }

  let left = Math.floor(x);
  let top = Math.floor(y);
  let w = Math.floor(width);
  let h = Math.floor(height);

  if (w < 8 || h < 8) return null;
  if (left < 0) {
    w += left;
    left = 0;
  }
  if (top < 0) {
    h += top;
    top = 0;
  }
  if (left >= imgWidth || top >= imgHeight) return null;
  if (left + w > imgWidth) w = imgWidth - left;
  if (top + h > imgHeight) h = imgHeight - top;
  if (w < 8 || h < 8) return null;
  return { left, top, width: w, height: h };
}

export async function cropQuestionImage(
  pageBuffer: Buffer,
  bbox: ImageBBox
): Promise<CroppedQuestionImage | null> {
  try {
    const meta = await sharp(pageBuffer).metadata();
    const imgW = meta.width || 0;
    const imgH = meta.height || 0;
    const box = normalizeBBox(bbox, imgW, imgH);
    if (!box) return null;

    const out = await sharp(pageBuffer)
      .extract({ left: box.left, top: box.top, width: box.width, height: box.height })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });

    if (!out.data?.length) return null;
    return {
      buffer: out.data,
      mimeType: 'image/jpeg',
      width: out.info.width,
      height: out.info.height,
    };
  } catch (e) {
    console.warn('[ocr-image] crop failed:', (e as Error)?.message || e);
    return null;
  }
}

/** Upload cropped image to private Telegram storage channel; returns file_id. */
export async function uploadToTelegramStorage(
  buffer: Buffer,
  mimeType: string,
  filename = 'question.jpg'
): Promise<{ fileId: string; width?: number; height?: number } | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  const chatId = process.env.TELEGRAM_MEDIA_STORAGE_CHAT_ID || '';
  if (!token) {
    console.warn('[ocr-image] TELEGRAM_BOT_TOKEN missing — cannot store media');
    return null;
  }
  if (!chatId) {
    console.warn('[ocr-image] TELEGRAM_MEDIA_STORAGE_CHAT_ID missing — cannot store media');
    return null;
  }
  if (buffer.length > 9_500_000) {
    console.warn('[ocr-image] crop too large for Telegram');
    return null;
  }

  try {
    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('disable_notification', 'true');
    const blob = new Blob([buffer], { type: mimeType || 'image/jpeg' });
    form.append('photo', blob, filename);

    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(30000),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!data?.ok) {
      console.warn('[ocr-image] Telegram upload failed:', data?.description || res.status);
      return null;
    }
    const photos = data.result?.photo || [];
    const best = photos[photos.length - 1];
    const fileId = best?.file_id;
    if (!fileId) return null;
    return {
      fileId: String(fileId),
      width: best?.width,
      height: best?.height,
    };
  } catch (e) {
    console.warn('[ocr-image] upload error:', (e as Error)?.message || e);
    return null;
  }
}

/**
 * Process OCR questions: crop has_image bboxes from the page and attach image.fileId.
 * Failures on individual questions are recorded; text import continues.
 */
export async function attachCroppedImagesToOcrQuestions(
  pageBase64: string,
  mimeType: string,
  questions: any[]
): Promise<{ questions: any[]; imageErrors: string[] }> {
  const imageErrors: string[] = [];
  if (!Array.isArray(questions) || questions.length === 0) {
    return { questions: questions || [], imageErrors };
  }

  let pageBuffer: Buffer;
  try {
    pageBuffer = Buffer.from(pageBase64, 'base64');
  } catch {
    return {
      questions,
      imageErrors: ['Invalid page image data — skipped all image crops'],
    };
  }

  const out: any[] = [];
  for (let i = 0; i < questions.length; i++) {
    const q = { ...questions[i] };
    const label = q.question_number != null ? `Q${q.question_number}` : `item ${i + 1}`;

    if (!q.has_image || !q.image_bbox) {
      q.has_image = false;
      q.image_bbox = null;
      out.push(q);
      continue;
    }

    const cropped = await cropQuestionImage(pageBuffer, q.image_bbox);
    if (!cropped) {
      imageErrors.push(`${label}: invalid/empty crop — imported as text-only`);
      q.has_image = false;
      q.image_bbox = null;
      out.push(q);
      continue;
    }

    const uploaded = await uploadToTelegramStorage(cropped.buffer, cropped.mimeType, `ocr_${i}.jpg`);
    if (!uploaded?.fileId) {
      imageErrors.push(`${label}: Telegram media upload failed — imported as text-only`);
      q.has_image = false;
      q.image_bbox = null;
      out.push(q);
      continue;
    }

    q.image = {
      fileId: uploaded.fileId,
      mimeType: cropped.mimeType,
      width: uploaded.width || cropped.width,
      height: uploaded.height || cropped.height,
    };
    out.push(q);
  }

  return { questions: out, imageErrors };
}
