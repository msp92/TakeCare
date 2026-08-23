import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Turn thrown values (including pdf.js / worker payloads) into a user-visible message. */
export function formatUnknownError(err: unknown): string {
  if (err instanceof Error) {
    return err.message || err.name || "Error";
  }
  if (typeof err === "string") {
    return err;
  }
  if (err && typeof err === "object") {
    const record = err as Record<string, unknown>;
    if (typeof record.message === "string") {
      return record.message;
    }
    if (typeof record.reason === "string") {
      return record.reason;
    }
    try {
      return JSON.stringify(err);
    } catch {
      return "Non-serializable error";
    }
  }
  return "Unknown error";
}
