/*
 * Extract searchable plain text from an uploaded file.
 * ---------------------------------------------------------------------------
 * Best-effort: returns "" for unknown/unreadable types, which simply means the
 * document has no text to search (the original file is still stored in Blob).
 */
import mammoth from "mammoth";
// Import the implementation directly: pdf-parse's package entry runs a debug
// harness that reads a bundled sample PDF when loaded as the main module.
import pdf from "pdf-parse/lib/pdf-parse.js";

const CAP = 60000; // keep parity with the old 60k-character paste limit

export async function extractText(buffer, contentType = "", filename = "") {
  const ct = String(contentType).toLowerCase();
  const name = String(filename).toLowerCase();
  try {
    if (ct.includes("pdf") || name.endsWith(".pdf")) {
      const r = await pdf(buffer);
      return (r.text || "").slice(0, CAP);
    }
    if (ct.includes("wordprocessingml") || name.endsWith(".docx")) {
      const r = await mammoth.extractRawText({ buffer });
      return (r.value || "").slice(0, CAP);
    }
    if (ct.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md")) {
      return buffer.toString("utf8").slice(0, CAP);
    }
  } catch {
    return "";
  }
  return "";
}
