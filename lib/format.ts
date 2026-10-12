/**
 * Formats duration in seconds into standard mono timecode:
 * - mm:ss for durations under 1 hour (e.g. 252 -> "4:12", 7 -> "0:07")
 * - h:mm:ss for durations of 1 hour or more (e.g. 3665 -> "1:01:05")
 */
export function formatTimecode(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0:00";

  const totalSec = Math.floor(seconds);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  const paddedSecs = secs.toString().padStart(2, "0");

  if (hrs > 0) {
    const paddedMins = mins.toString().padStart(2, "0");
    return `${hrs}:${paddedMins}:${paddedSecs}`;
  }

  return `${mins}:${paddedSecs}`;
}

/**
 * Formats byte size into human-readable compact notation (B, KB, MB, GB, TB):
 * (e.g. 0 -> "0 B", 1048576 -> "1.0 MB", 3113851289 -> "2.9 GB")
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (isNaN(bytes) || bytes <= 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  if (i === 0) return `${bytes} B`;

  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(decimals)} ${sizes[i]}`;
}

/**
 * Formats a timestamp into compact relative time:
 * (e.g. "just now", "2m ago", "3h ago", "2d ago", "3w ago", "2mo ago")
 */
export function formatRelative(date: Date | string | number): string {
  const d = new Date(date);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);

  if (isNaN(diffSec) || diffSec < 0) return "just now";
  if (diffSec < 60) return "just now";

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}d ago`;

  const diffWeek = Math.floor(diffDay / 7);
  if (diffWeek < 4) return `${diffWeek}w ago`;

  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}mo ago`;

  const diffYear = Math.floor(diffDay / 365);
  return `${diffYear}y ago`;
}
