import { NextRequest, NextResponse } from 'next/server';
import { createCanvas, loadImage, ImageData } from 'canvas';

interface Settings {
  rect: { x: number; y: number; w: number; h: number };
  cols: number[];
  optGap: number;
  startY: number;
  endY: number;
  bubbleR: number;
  colStartYs?: number[];   // per-column start Y
  colEndYs?: number[];     // per-column end Y
  fillThreshold?: number;
  minDifference?: number;
}

// Get darkness ratio of a circular region (0=white, 1=black)
function getFillRatio(imageData: ImageData, imgWidth: number, imgHeight: number, x: number, y: number, r: number): number {
  const centerX = Math.round(x);
  const centerY = Math.round(y);
  const radius = Math.max(1, Math.round(r));

  const clampedX = Math.max(radius, Math.min(imgWidth - radius - 1, centerX));
  const clampedY = Math.max(radius, Math.min(imgHeight - radius - 1, centerY));

  let totalPixels = 0;
  let totalDarkness = 0;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= radius * radius) {
        const px = clampedX + dx;
        const py = clampedY + dy;

        if (px >= 0 && px < imgWidth && py >= 0 && py < imgHeight) {
          const idx = (py * imgWidth + px) * 4;
          const red = imageData.data[idx];
          const green = imageData.data[idx + 1];
          const blue = imageData.data[idx + 2];
          const gray = 0.299 * red + 0.587 * green + 0.114 * blue;
          totalDarkness += (255 - gray) / 255;
          totalPixels++;
        }
      }
    }
  }

  if (totalPixels === 0) return 0;
  return totalDarkness / totalPixels;
}

function getRowY(startY: number, endY: number, rowIndex: number, totalRows: number): number {
  return startY + (endY - startY) * (rowIndex / (totalRows - 1));
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const settingsStr = formData.get('settings') as string;

    if (!file || !settingsStr) {
      return NextResponse.json({ success: false, error: 'Missing data' }, { status: 400 });
    }

    const settings: Settings = JSON.parse(settingsStr);
    const { rect, cols, optGap, startY, endY, bubbleR, colStartYs, colEndYs, fillThreshold, minDifference } = settings;

    // Tuning defaults
    const MIN_FILL = fillThreshold ?? 0.20;
    const MIN_DIFF = minDifference ?? 0.15;

    // Per-column Y bounds: use per-column if provided, else fall back to global
    const getColStartY = (ci: number) => colStartYs?.[ci] ?? startY;
    const getColEndY = (ci: number) => colEndYs?.[ci] ?? endY;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const img = await loadImage(buffer);

    const imgWidth = img.width;
    const imgHeight = img.height;

    const canvas = createCanvas(imgWidth, imgHeight);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, imgWidth, imgHeight);

    const outputCanvas = createCanvas(imgWidth, imgHeight);
    const outputCtx = outputCanvas.getContext('2d');
    outputCtx.drawImage(img, 0, 0);

    const QUESTIONS_PER_COL = 45;
    const NUM_COLS = cols.length;

    const answers: Record<string, string | null> = {};
    const stats = { answered: 0, unanswered: 0, invalid: 0 };

    // Draw gray dots for all check positions
    outputCtx.fillStyle = 'rgb(180, 180, 180)';
    for (let ci = 0; ci < NUM_COLS; ci++) {
      const csy = getColStartY(ci);
      const cey = getColEndY(ci);
      for (let row = 0; row < QUESTIONS_PER_COL; row++) {
        for (let opt = 0; opt < 4; opt++) {
          const absX = rect.x + cols[ci] + opt * optGap;
          const absY = rect.y + getRowY(csy, cey, row, QUESTIONS_PER_COL);
          outputCtx.beginPath();
          outputCtx.arc(absX, absY, 2, 0, Math.PI * 2);
          outputCtx.fill();
        }
      }
    }

    // Process each question using ROBUST relative comparison
    for (let ci = 0; ci < NUM_COLS; ci++) {
      const csy = getColStartY(ci);
      const cey = getColEndY(ci);

      for (let row = 0; row < QUESTIONS_PER_COL; row++) {
        const q = ci * QUESTIONS_PER_COL + row + 1;

        const ratios: number[] = [];
        const coords: { x: number; y: number }[] = [];

        for (let opt = 0; opt < 4; opt++) {
          const absX = rect.x + cols[ci] + opt * optGap;
          const absY = rect.y + getRowY(csy, cey, row, QUESTIONS_PER_COL);

          const ratio = getFillRatio(imageData, imgWidth, imgHeight, absX, absY, bubbleR);
          ratios.push(ratio);
          coords.push({ x: Math.round(absX), y: Math.round(absY) });
        }

        // Sort descending
        const sorted = ratios
          .map((r, i) => ({ ratio: r, index: i }))
          .sort((a, b) => b.ratio - a.ratio);

        const maxRatio = sorted[0].ratio;
        const maxIndex = sorted[0].index;

        // The "empty baseline" = average of the 3 lightest bubbles
        const baseline = (sorted[1].ratio + sorted[2].ratio + sorted[3].ratio) / 3;
        const gap = maxRatio - baseline;

        if (maxRatio < MIN_FILL) {
          // Darkest bubble isn't dark enough — all empty
          answers[String(q)] = null;
          stats.unanswered++;
        } else if (gap >= MIN_DIFF) {
          // Clear winner — significantly darker than the empty baseline
          answers[String(q)] = String(maxIndex + 1);
          stats.answered++;
          outputCtx.strokeStyle = 'rgb(0, 255, 0)';
          outputCtx.lineWidth = 2;
          outputCtx.beginPath();
          outputCtx.arc(coords[maxIndex].x, coords[maxIndex].y, bubbleR + 3, 0, Math.PI * 2);
          outputCtx.stroke();
        } else if (gap >= MIN_DIFF * 0.4 && maxRatio > MIN_FILL * 1.8) {
          // Marginal — barely darker but very dark absolute, count with low confidence
          answers[String(q)] = String(maxIndex + 1);
          stats.answered++;
          outputCtx.strokeStyle = 'rgb(255, 180, 0)';
          outputCtx.lineWidth = 2;
          outputCtx.beginPath();
          outputCtx.arc(coords[maxIndex].x, coords[maxIndex].y, bubbleR + 3, 0, Math.PI * 2);
          outputCtx.stroke();
        } else {
          // Can't distinguish — all roughly equal or too noisy
          answers[String(q)] = null;
          stats.unanswered++;
        }
      }
    }

    // Draw selection rectangle
    outputCtx.strokeStyle = 'rgb(16, 185, 129)';
    outputCtx.lineWidth = 2;
    outputCtx.strokeRect(rect.x, rect.y, rect.w, rect.h);

    // Draw column lines
    outputCtx.strokeStyle = 'rgb(200, 200, 0)';
    outputCtx.lineWidth = 1;
    for (let ci = 0; ci < NUM_COLS; ci++) {
      const x = rect.x + cols[ci];
      outputCtx.beginPath();
      outputCtx.moveTo(x, rect.y);
      outputCtx.lineTo(x, rect.y + rect.h);
      outputCtx.stroke();
    }

    // Draw per-column start/end markers
    for (let ci = 0; ci < NUM_COLS; ci++) {
      const csy = getColStartY(ci);
      const cey = getColEndY(ci);
      const x = rect.x + cols[ci];
      outputCtx.fillStyle = 'rgb(0, 200, 0)';
      outputCtx.beginPath();
      outputCtx.arc(x, rect.y + csy, 4, 0, Math.PI * 2);
      outputCtx.fill();
      outputCtx.fillStyle = 'rgb(0, 0, 200)';
      outputCtx.beginPath();
      outputCtx.arc(x, rect.y + cey, 4, 0, Math.PI * 2);
      outputCtx.fill();
    }

    const annotatedImage = outputCanvas.toBuffer('image/jpeg').toString('base64');

    return NextResponse.json({
      success: true,
      data: {
        answers,
        statistics: { ...stats, total_questions: NUM_COLS * QUESTIONS_PER_COL }
      },
      annotatedImage: `data:image/jpeg;base64,${annotatedImage}`,
      processor: 'javascript',
      processorInfo: 'Robust relative comparison: darkest vs average of other 3'
    });

  } catch (error) {
    console.error('OMR processing error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
