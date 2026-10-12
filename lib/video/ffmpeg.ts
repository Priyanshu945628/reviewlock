// FFmpeg transcoding, preview cutting, watermarking, and sprite generation conforming to CONTRACT §5 and B3

import { spawn } from "node:child_process";
import path from "node:path";
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";

export interface HlsPreviewOptions {
  inputPath: string;
  outputDir: string;
  startSeconds?: number;
  endSeconds?: number;
  watermarkText?: string;
  maxHeight?: number;
}

export interface Mp4PreviewOptions {
  inputPath: string;
  outputPath: string;
  startSeconds?: number;
  endSeconds?: number;
  watermarkText?: string;
  maxHeight?: number;
}

export interface SpriteOptions {
  inputPath: string;
  outputDir: string;
  durationSeconds: number;
  frameCount?: number;
  thumbWidth?: number;
  thumbHeight?: number;
}

export interface SpriteResult {
  spritePath: string;
  vttPath: string;
  frameCount: number;
  thumbWidth: number;
  thumbHeight: number;
}

// Find a system font file that exists for ffmpeg drawtext
function resolveFontFilePath(): string | null {
  const candidates = [
    "C:/Windows/Fonts/arial.ttf",
    "C:/Windows/Fonts/segoeui.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
    "/usr/share/fonts/TTF/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
  ];

  for (const c of candidates) {
    if (existsSync(c)) {
      return c.replace(":", "\\:");
    }
  }
  return null;
}

function buildWatermarkFilter(text: string): string {
  const cleanText = text.replace(/[:\\']/g, " ").trim() || "PREVIEW";
  const fontPath = resolveFontFilePath();

  // Watermark text styling (DESIGN §4.9, CONTRACT §5)
  // Subtle white text with slight background box for contrast
  if (fontPath) {
    return `drawtext=fontfile='${fontPath}':text='${cleanText}':fontcolor=white@0.35:fontsize=h/16:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.25:boxborderw=8`;
  } else {
    return `drawtext=text='${cleanText}':fontcolor=white@0.35:fontsize=h/16:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.25:boxborderw=8`;
  }
}

function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });

    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `${command} exited with code ${code}: ${stderr.trim() || "Process error"}`
          )
        );
      }
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 * 1. Generates HLS cut with 4s segments, AAC audio, H.264, burned-in drawtext, scaled down.
 */
export async function generatePreviewHls(
  opts: HlsPreviewOptions
): Promise<{ playlistPath: string; duration: number }> {
  await fs.mkdir(opts.outputDir, { recursive: true });

  const start = opts.startSeconds ?? 0;
  const end = opts.endSeconds ?? (start + 60);
  const duration = Math.max(1, end - start);
  const maxHeight = opts.maxHeight ?? 720;
  const watermarkText = opts.watermarkText || "PREVIEW · NOT PAID";

  const scaleFilter = `scale='min(iw, -2)':'min(ih, ${maxHeight})'`;
  const watermarkFilter = buildWatermarkFilter(watermarkText);
  const filterGraph = `${scaleFilter},${watermarkFilter}`;

  const playlistPath = path.join(opts.outputDir, "master.m3u8");
  const segmentPattern = path.join(opts.outputDir, "seg_%03d.ts");

  const args = [
    "-y",
    "-ss",
    start.toString(),
    "-t",
    duration.toString(),
    "-i",
    opts.inputPath,
    "-vf",
    filterGraph,
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "23",
    "-g",
    "96",
    "-keyint_min",
    "96",
    "-sc_threshold",
    "0",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "48000",
    "-hls_time",
    "4",
    "-hls_playlist_type",
    "vod",
    "-hls_segment_filename",
    segmentPattern,
    playlistPath,
  ];

  await runCommand("ffmpeg", args);
  return { playlistPath, duration };
}

/**
 * 2. Generates standalone watermarked preview MP4 with faststart.
 */
export async function generatePreviewMp4(
  opts: Mp4PreviewOptions
): Promise<{ mp4Path: string; duration: number }> {
  await fs.mkdir(path.dirname(opts.outputPath), { recursive: true });

  const start = opts.startSeconds ?? 0;
  const end = opts.endSeconds ?? (start + 60);
  const duration = Math.max(1, end - start);
  const maxHeight = opts.maxHeight ?? 720;
  const watermarkText = opts.watermarkText || "PREVIEW · NOT PAID";

  const scaleFilter = `scale='min(iw, -2)':'min(ih, ${maxHeight})'`;
  const watermarkFilter = buildWatermarkFilter(watermarkText);
  const filterGraph = `${scaleFilter},${watermarkFilter}`;

  const args = [
    "-y",
    "-ss",
    start.toString(),
    "-t",
    duration.toString(),
    "-i",
    opts.inputPath,
    "-vf",
    filterGraph,
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "23",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    opts.outputPath,
  ];

  await runCommand("ffmpeg", args);
  return { mp4Path: opts.outputPath, duration };
}

/**
 * 3. Generates thumbnail sprite sheet and WebVTT indexing file.
 */
export async function generateThumbnailSprite(
  opts: SpriteOptions
): Promise<SpriteResult> {
  await fs.mkdir(opts.outputDir, { recursive: true });

  const frameCount = opts.frameCount ?? 10;
  const thumbWidth = opts.thumbWidth ?? 160;
  const thumbHeight = opts.thumbHeight ?? 90;
  const duration = Math.max(1, opts.durationSeconds);

  const spritePath = path.join(opts.outputDir, "sprite.jpg");
  const vttPath = path.join(opts.outputDir, "thumbs.vtt");

  // Calculate fps: frameCount frames across entire duration
  const fpsExpr = `${frameCount}/${duration}`;
  const filterGraph = `fps=${fpsExpr},scale=${thumbWidth}:${thumbHeight},tile=${frameCount}x1`;

  const args = [
    "-y",
    "-i",
    opts.inputPath,
    "-vf",
    filterGraph,
    "-frames:v",
    "1",
    spritePath,
  ];

  await runCommand("ffmpeg", args);

  // Generate WebVTT file indexing each horizontal slice
  const stepDuration = duration / frameCount;
  let vttContent = "WEBVTT\n\n";

  for (let i = 0; i < frameCount; i++) {
    const startSec = i * stepDuration;
    const endSec = (i + 1) * stepDuration;
    const startFormatted = formatVttTimestamp(startSec);
    const endFormatted = formatVttTimestamp(endSec);
    const xOffset = i * thumbWidth;

    vttContent += `${startFormatted} --> ${endFormatted}\n`;
    vttContent += `sprite.jpg#xywh=${xOffset},0,${thumbWidth},${thumbHeight}\n\n`;
  }

  await fs.writeFile(vttPath, vttContent, "utf-8");

  return {
    spritePath,
    vttPath,
    frameCount,
    thumbWidth,
    thumbHeight,
  };
}

function formatVttTimestamp(sec: number): string {
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = Math.floor(sec % 60);
  const millis = Math.floor((sec % 1) * 1000);

  const hh = hours.toString().padStart(2, "0");
  const mm = minutes.toString().padStart(2, "0");
  const ss = seconds.toString().padStart(2, "0");
  const mmm = millis.toString().padStart(3, "0");

  return `${hh}:${mm}:${ss}.${mmm}`;
}
