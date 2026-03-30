import { NextRequest, NextResponse } from 'next/server';
import { createCanvas, loadImage, ImageData } from 'canvas';

interface Settings {
  rect: { x: number; y: number; w: number; h: number };
  cols: number[];
  optGap: number;
  startY: number;
  endY: number;
  bubbleR: number;
  colYOffsets?: number[]; // per-column Y offset adjustments
}

// Get darkness ratio of a circular region (0=white, 1=black)
function getFillRatio(imageData: ImageData, imgWidth: number, imgHeight: number, x: number, y: number, r: number): number {
  const centerX = Math.round(x);
  const centerY = Math.round(y);
  const radius = Math.max(1, Math.round(r));

  // Clamp to image bounds
  const clampedX = Math.max(radius, Math.min(imgWidth - radius - 1, centerX));
  const clampedY = Math.max(radius, Math.min(imgHeight - radius - 1, centerY));

  let totalPixels = 0;
  let totalDarkness = 0;

  // Sample pixels in a circular region
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      // Check if point is inside circle
      if (dx * dx + dy * dy <= radius * radius) {
        const px = clampedX + dx;
        const py = clampedY + dy;

        // Bounds check
        if (px >= 0 && px < imgWidth && py >= 0 && py < imgHeight) {
          const idx = (py * imgWidth + px) * 4;
          // Get grayscale value from RGBA
          const red = imageData.data[idx];
          const green = imageData.data[idx + 1];
          const blue = imageData.data[idx + 2];
          // Convert to grayscale using luminosity method
          const gray = 0.299 * red + 0.587 * green + 0.114 * blue;
          // Darkness = 1 - brightness/255
          totalDarkness += (255 - gray) / 255;
          totalPixels++;
        }
      }
    }
  }

  if (totalPixels === 0) return 0;
  return totalDarkness / totalPixels;
}

// Get Y position with interpolation
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
    const { rect, cols, optGap, startY, endY, bubbleR, colYOffsets } = settings;
    const colOffsets = colYOffsets || cols.map(() => 0); // default to 0 if not provided

    // Load image
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const img = await loadImage(buffer);

    const imgWidth = img.width;
    const imgHeight = img.height;

    // Create canvas and get image data
    const canvas = createCanvas(imgWidth, imgHeight);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, imgWidth, imgHeight);

    // Create output canvas for annotation
    const outputCanvas = createCanvas(imgWidth, imgHeight);
    const outputCtx = outputCanvas.getContext('2d');
    outputCtx.drawImage(img, 0, 0);

    const QUESTIONS_PER_COL = 45;
    const NUM_COLS = cols.length;
    const FILL_THRESHOLD = 0.30;

    const answers: Record<string, string | null> = {};
    const stats = { answered: 0, unanswered: 0, invalid: 0 };

    // Draw gray dots for all check positions
    outputCtx.fillStyle = 'rgb(180, 180, 180)';
    for (let ci = 0; ci < NUM_COLS; ci++) {
      const colStartY = startY + (colOffsets[ci] || 0);
      const colEndY = endY + (colOffsets[ci] || 0);
      for (let row = 0; row < QUESTIONS_PER_COL; row++) {
        for (let opt = 0; opt < 4; opt++) {
          const absX = rect.x + cols[ci] + opt * optGap;
          const absY = rect.y + getRowY(colStartY, colEndY, row, QUESTIONS_PER_COL);
          outputCtx.beginPath();
          outputCtx.arc(absX, absY, 2, 0, Math.PI * 2);
          outputCtx.fill();
        }
      }
    }

    // Process each column and row
    for (let ci = 0; ci < NUM_COLS; ci++) {
      for (let row = 0; row < QUESTIONS_PER_COL; row++) {
        const q = ci * QUESTIONS_PER_COL + row + 1;
        const colStartY = startY + (colOffsets[ci] || 0);
        const colEndY = endY + (colOffsets[ci] || 0);

        const ratios: number[] = [];
        const coords: { x: number; y: number }[] = [];

        for (let opt = 0; opt < 4; opt++) {
          const absX = rect.x + cols[ci] + opt * optGap;
          const absY = rect.y + getRowY(colStartY, colEndY, row, QUESTIONS_PER_COL);

          const ratio = getFillRatio(imageData, imgWidth, imgHeight, absX, absY, bubbleR);
          ratios.push(ratio);
          coords.push({ x: Math.round(absX), y: Math.round(absY) });
        }

        // Find filled bubbles
        const filled = ratios.map((r, i) => r > FILL_THRESHOLD ? i : -1).filter(i => i >= 0);

        if (filled.length === 0) {
          answers[String(q)] = null;
          stats.unanswered++;
        } else if (filled.length === 1) {
          answers[String(q)] = String(filled[0] + 1);
          stats.answered++;
          // Draw green circle
          const coord = coords[filled[0]];
          outputCtx.strokeStyle = 'rgb(0, 255, 0)';
          outputCtx.lineWidth = 2;
          outputCtx.beginPath();
          outputCtx.arc(coord.x, coord.y, bubbleR + 3, 0, Math.PI * 2);
          outputCtx.stroke();
        } else {
          answers[String(q)] = 'INVALID';
          stats.invalid++;
          // Draw red circles for invalid
          outputCtx.strokeStyle = 'rgb(255, 50, 50)';
          outputCtx.lineWidth = 2;
          for (const idx of filled) {
            const coord = coords[idx];
            outputCtx.beginPath();
            outputCtx.arc(coord.x, coord.y, bubbleR + 3, 0, Math.PI * 2);
            outputCtx.stroke();
          }
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
    for (const colX of cols) {
      const x = rect.x + colX;
      outputCtx.beginPath();
      outputCtx.moveTo(x, rect.y);
      outputCtx.lineTo(x, rect.y + rect.h);
      outputCtx.stroke();
    }

    // Draw start/end Y markers
    outputCtx.fillStyle = 'rgb(0, 200, 0)';
    outputCtx.beginPath();
    outputCtx.arc(rect.x - 10, rect.y + startY, 5, 0, Math.PI * 2);
    outputCtx.fill();

    outputCtx.fillStyle = 'rgb(0, 0, 200)';
    outputCtx.beginPath();
    outputCtx.arc(rect.x - 10, rect.y + endY, 5, 0, Math.PI * 2);
    outputCtx.fill();

    // Convert to base64
    const annotatedImage = outputCanvas.toBuffer('image/jpeg').toString('base64');

    return NextResponse.json({
      success: true,
      data: {
        answers,
        statistics: { ...stats, total_questions: NUM_COLS * QUESTIONS_PER_COL }
      },
      annotatedImage: `data:image/jpeg;base64,${annotatedImage}`,
      processor: 'javascript',
      processorInfo: 'Pure JavaScript using canvas package - Vercel compatible'
    });

  } catch (error) {
    console.error('OMR processing error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
