// Parser for the CSV export from Google Business Profile
// (business.google.com → Reviews → Download). Tolerant of column naming and
// order differences across locales/updates. Zero dependencies.

export interface CsvReviewRow {
  reviewerName: string;
  starRating: number;
  comment: string | null;
  createTime: string | null;
}

function parseRating(v: string): number {
  const cleaned = v.trim().replace(/stars?/gi, "").replace(/\/5.*$/, "");
  const n = Number(cleaned);
  if (!isFinite(n)) return 0;
  return Math.max(1, Math.min(5, Math.round(n)));
}

// Minimal RFC-4180-ish CSV parser: quoted fields with "" escapes, commas,
// newlines (CRLF or LF).
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, ""); // strip BOM

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

const NAME_MATCH = /name|reviewer|author|naam|klant/i;
const RATING_MATCH = /rating|stars|ster|score/i;
const COMMENT_MATCH = /comment|review|text|reactie|bericht|opmerking/i;
const DATE_MATCH = /date|time|datum|created|posted/i;

export function parseGbpReviewsCsv(text: string): CsvReviewRow[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];

  // Locate the header row (first row with recognizable column names).
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    if (rows[i].some((h) => NAME_MATCH.test(h))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    throw new Error("Geen herkenbare header gevonden — klopt dit CSV-bestand van Google?");
  }

  const header = rows[headerIdx].map((h) => h.trim());
  const col = (re: RegExp) => header.findIndex((h) => re.test(h));

  const nameCol = col(NAME_MATCH);
  const ratingCol = col(RATING_MATCH);
  const commentCol = col(COMMENT_MATCH);
  const dateCol = col(DATE_MATCH);

  if (nameCol === -1 || ratingCol === -1) {
    throw new Error("CSV moet minstens een naam- en sterrenkolom bevatten.");
  }

  const out: CsvReviewRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const name = (r[nameCol] ?? "").trim();
    const rating = parseRating(r[ratingCol] ?? "");
    if (!name || rating === 0) continue;
    const commentRaw = commentCol === -1 ? "" : (r[commentCol] ?? "").trim();
    const dateRaw = dateCol === -1 ? "" : (r[dateCol] ?? "").trim();
    let createTime: string | null = null;
    if (dateRaw) {
      const d = new Date(dateRaw);
      if (!isNaN(d.getTime())) createTime = d.toISOString();
    }
    out.push({
      reviewerName: name.slice(0, 120),
      starRating: rating,
      comment: commentRaw ? commentRaw.slice(0, 5000) : null,
      createTime,
    });
  }
  return out;
}
