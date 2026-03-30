import { NextRequest, NextResponse } from 'next/server';
import { createCanvas, loadImage, ImageData } from 'canvas';

interface Settings {
  rect: { x: number; y: number; w: number; h: number };
  cols: number[];
  optGap: number;
  startY: number;
  endY: number;
  bubbleR: number;
  colStartYs?: number[];
  colEndYs?: number[];
  fillThreshold?: number;
  minDifference?: number;
  mode?: '180Q' | '200Q';     // 200Q = two-section layout with gap
  sectionGap?: number;          // extra pixels between section A (35 rows) and B (10 rows)
  sectionARows?: number;        // rows in section A (default 35)
}

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
          const gray = 0.299 * imageData.data[idx] + 0.587 * imageData.data[idx + 1] + 0.114 * imageData.data[idx + 2];
          totalDarkness += (255 - gray) / 255;
          totalPixels++;
        }
      }
    }
  }
  if (totalPixels === 0) return 0;
  return totalDarkness / totalPixels;
}

// Standard linear interpolation (180Q mode)
function getRowY(startY: number, endY: number, rowIndex: number, totalRows: number): number {
  return startY + (endY - startY) * (rowIndex / (totalRows - 1));
}

// Two-section interpolation (200Q mode)
function getRowY200Q(startY: number, endY: number, rowIndex: number, totalRows: number, gap: number, sectionARows: number): number {
  const sectionBRows = totalRows - sectionARows;
  const availableRange = endY - startY - gap;
  const rangeA = availableRange * (sectionARows / totalRows);
  const sectionAMidY = startY + rangeA;
  const sectionBStartY = sectionAMidY + gap;
  const sectionBEndY = endY;
  const rangeB = sectionBEndY - sectionBStartY;

  if (rowIndex < sectionARows) {
    if (sectionARows <= 1) return startY;
    return startY + rangeA * (rowIndex / (sectionARows - 1));
  } else {
    const bIndex = rowIndex - sectionARows;
    if (sectionBRows <= 1) return sectionBStartY;
    return sectionBStartY + rangeB * (bIndex / (sectionBRows - 1));
  }
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
    const mode = settings.mode ?? '180Q';
    const sectionGap = settings.sectionGap ?? 0;
    const sectionARows = settings.sectionARows ?? 35;

    const MIN_FILL = fillThreshold ?? 0.20;
    const MIN_DIFF = minDifference ?? 0.15;

    const getColStartY = (ci: number) => colStartYs?.[ci] ?? startY;
    const getColEndY = (ci: number) => colEndYs?.[ci] ?? endY;

    const is200Q = mode === '200Q';
    const QUESTIONS_PER_COL = is200Q ? (sectionARows + (45 - sectionARows)) : 45; // always 45 total usable
    const NUM_COLS = cols.length;

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

    const answers: Record<string, string | null> = {};
    const stats = { answered: 0, unanswered: 0, invalid: 0 };

    // Helper to get Y for a row in a column
    const getY = (ci: number, row: number) => {
      const csy = getColStartY(ci);
      const cey = getColEndY(ci);
      if (is200Q) {
        return getRowY200Q(csy, cey, row, QUESTIONS_PER_COL, sectionGap, sectionARows);
      }
      return getRowY(csy, cey, row, QUESTIONS_PER_COL);
    };

    // Draw gray dots
    outputCtx.fillStyle = 'rgb(180, 180, 180)';
    for (let ci = 0; ci < NUM_COLS; ci++) {
      for (let row = 0; row < QUESTIONS_PER_COL; row++) {
        for (let opt = 0; opt < 4; opt++) {
          const absX = rect.x + cols[ci] + opt * optGap;
          const absY = rect.y + getY(ci, row);
          outputCtx.beginPath();
          outputCtx.arc(absX, absY, 2, 0, Math.PI * 2);
          outputCtx.fill();
        }
      }
    }

    // Draw section divider line for 200Q mode
    if (is200Q) {
      outputCtx.strokeStyle = 'rgb(255, 100, 100)';
      outputCtx.lineWidth = 1;
      outputCtx.setLineDash([5, 5]);
      for (let ci = 0; ci < NUM_COLS; ci++) {
        const lastARow = sectionARows - 1;
        const firstBRow = sectionARows;
        const yA = rect.y + getY(ci, lastARow);
        const yB = rect.y + getY(ci, firstBRow);
        const midY = (yA + yB) / 2;
        outputCtx.beginPath();
        outputCtx.moveTo(rect.x, midY);
        outputCtx.lineTo(rect.x + rect.w, midY);
        outputCtx.stroke();
      }
      outputCtx.setLineDash([]);
    }

    // Process questions
    for (let ci = 0; ci < NUM_COLS; ci++) {
      for (let row = 0; row < QUESTIONS_PER_COL; row++) {
        const q = ci * QUESTIONS_PER_COL + row + 1;
        const ratios: number[] = [];
        const coords: { x: number; y: number }[] = [];

        for (let opt = 0; opt < 4; opt++) {
          const absX = rect.x + cols[ci] + opt * optGap;
          const absY = rect.y + getY(ci, row);
          const ratio = getFillRatio(imageData, imgWidth, imgHeight, absX, absY, bubbleR);
          ratios.push(ratio);
          coords.push({ x: Math.round(absX), y: Math.round(absY) });
        }

        const sorted = ratios.map((r, i) => ({ ratio: r, index: i })).sort((a, b) => b.ratio - a.ratio);
        const maxRatio = sorted[0].ratio;
        const maxIndex = sorted[0].index;
        const baseline = (sorted[1].ratio + sorted[2].ratio + sorted[3].ratio) / 3;
        const gap = maxRatio - baseline;

        if (maxRatio < MIN_FILL) {
          answers[String(q)] = null;
          stats.unanswered++;
        } else if (gap >= MIN_DIFF) {
          answers[String(q)] = String(maxIndex + 1);
          stats.answered++;
          outputCtx.strokeStyle = 'rgb(0, 255, 0)';
          outputCtx.lineWidth = 2;
          outputCtx.beginPath();
          outputCtx.arc(coords[maxIndex].x, coords[maxIndex].y, bubbleR + 3, 0, Math.PI * 2);
          outputCtx.stroke();
        } else if (gap >= MIN_DIFF * 0.4 && maxRatio > MIN_FILL * 1.8) {
          answers[String(q)] = String(maxIndex + 1);
          stats.answered++;
          outputCtx.strokeStyle = 'rgb(255, 180, 0)';
          outputCtx.lineWidth = 2;
          outputCtx.beginPath();
          outputCtx.arc(coords[maxIndex].x, coords[maxIndex].y, bubbleR + 3, 0, Math.PI * 2);
          outputCtx.stroke();
        } else {
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

    // Draw start/end markers
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
      data: { answers, statistics: { ...stats, total_questions: NUM_COLS * QUESTIONS_PER_COL } },
      annotatedImage: `data:image/jpeg;base64,${annotatedImage}`,
      processor: 'javascript',
      processorInfo: is200Q ? '200Q two-section mode with gap' : '180Q standard mode'
    });

  } catch (error) {
    console.error('OMR processing error:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
