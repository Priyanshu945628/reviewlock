// FFprobe metadata extractor conforming to CONTRACT §5

import { spawn } from "node:child_process";

export interface VideoProbeResult {
  durationSeconds: number;
  width: number;
  height: number;
  format: string;
  videoCodec: string;
  audioCodec?: string;
}

export async function probeVideo(filePath: string): Promise<VideoProbeResult> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,codec_name,width,height",
      "-show_entries",
      "format=duration,format_name",
      "-of",
      "json",
      filePath,
    ]);

    let stdoutData = "";
    let stderrData = "";

    ffprobe.stdout.on("data", (chunk) => {
      stdoutData += chunk.toString();
    });

    ffprobe.stderr.on("data", (chunk) => {
      stderrData += chunk.toString();
    });

    ffprobe.on("close", (code) => {
      if (code !== 0) {
        return reject(
          new Error(
            `ffprobe failed with exit code ${code}: ${stderrData.trim() || "Invalid file"}`
          )
        );
      }

      try {
        const parsed = JSON.parse(stdoutData);
        const streams = parsed.streams || [];
        const videoStream = streams.find(
          (s: any) => s.codec_type === "video"
        );

        if (!videoStream) {
          return reject(new Error("No valid video stream detected in file."));
        }

        const audioStream = streams.find(
          (s: any) => s.codec_type === "audio"
        );

        const duration =
          parseFloat(parsed.format?.duration) ||
          parseFloat(videoStream.duration) ||
          0;

        const width = videoStream.width || 0;
        const height = videoStream.height || 0;

        if (width === 0 || height === 0) {
          return reject(new Error("Invalid video dimensions (0x0)."));
        }

        resolve({
          durationSeconds: duration,
          width,
          height,
          format: parsed.format?.format_name || "unknown",
          videoCodec: videoStream.codec_name || "unknown",
          audioCodec: audioStream?.codec_name,
        });
      } catch (err: any) {
        reject(new Error(`Failed to parse ffprobe JSON output: ${err.message}`));
      }
    });

    ffprobe.on("error", (err) => {
      reject(new Error(`Failed to spawn ffprobe process: ${err.message}`));
    });
  });
}
