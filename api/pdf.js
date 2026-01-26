// api/pdf.js  (or pages/api/pdf.js)
// Secured PDF endpoint: requires Supabase user JWT (Authorization: Bearer <token>)
// Uses RLS as the security boundary.
// Generates a multi-page PDF using a 3x12 grid and supports an optional braille font.
//
// Requirements:
// - npm i pdf-lib @supabase/supabase-js
// - Vercel env vars: SUPABASE_URL, SUPABASE_ANON_KEY
// - Optional braille font file: public/fonts/NotoSansSymbols2-Regular.ttf

import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const config = { runtime: "nodejs" };

// ------------------------------
// Helpers
// ------------------------------
function getBearerToken(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function fontFile(name) {
  return path.join(process.cwd(), "public", "fonts", name);
}

function wrapToWidth(font, size, text, maxWidth) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";

  for (const w of words) {
    const cand = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(cand, size) <= maxWidth) {
      line = cand;
    } else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// ------------------------------
// Grid config: A4 + 3 columns x 12 rows
// ------------------------------
const PAGE = { w: 595, h: 842 }; // A4 portrait
const M = 48;
const COLS = 3;
const ROWS = 12;
const GUTTER_X = 12;
const GUTTER_Y = 10;
const CELL_PAD = 10;
const SHOW_GRID = false; // set true for design/debug

const contentW = PAGE.w - 2 * M;
const contentH = PAGE.h - 2 * M;
const cellW = (contentW - (COLS - 1) * GUTTER_X) / COLS;
const cellH = (contentH - (ROWS - 1) * GUTTER_Y) / ROWS;

function cellRect(col, row, colSpan = 1, rowSpan = 1) {
  // col: 1..3, row: 1..12 (row 1 is top)
  const c0 = col - 1;
  const r0 = row - 1;

  const x = M + c0 * (cellW + GUTTER_X);
  const topY = PAGE.h - M - r0 * (cellH + GUTTER_Y);

  const w = colSpan * cellW + (colSpan - 1) * GUTTER_X;
  const h = rowSpan * cellH + (rowSpan - 1) * GUTTER_Y;

  return { x, y: topY - h, w, h, topY };
}

function drawRoundedBox(page, rect, opts = {}) {
  const {
    radius = 12,
    fill = rgb(1, 1, 1),
    stroke = rgb(0.85, 0.85, 0.85),
    strokeWidth = 1,
  } = opts;

  page.drawRectangle({
    x: rect.x,
    y: rect.y,
    width: rect.w,
    height: rect.h,
    borderRadius: radius,
    color: fill,
    borderColor: stroke,
    borderWidth: strokeWidth,
  });
}

function drawGridDebug(page, rect) {
  if (!SHOW_GRID) return;
  page.drawRectangle({
    x: rect.x,
    y: rect.y,
    width: rect.w,
    height: rect.h,
    borderColor: rgb(0.9, 0.2, 0.2),
    borderWidth: 0.7,
  });
}

// ------------------------------
// Layout map (EDIT THIS)
// Uses your mpop_items fields as examples.
// Add / remove items freely.
// ------------------------------
const LAYOUT = [
  // Page 1
  { page: 1, type: "text", field: "title", col: 1, row: 1, colSpan: 3, rowSpan: 1, style: "h1", rounded: true },
  { page: 1, type: "labelValue", label: "Code", field: "code", col: 1, row: 2, colSpan: 1, rowSpan: 1, rounded: true },
  { page: 1, type: "labelValue", label: "Status", field: "status", col: 2, row: 2, colSpan: 1, rowSpan: 1, rounded: true },
  { page: 1, type: "labelValue", label: "Version", field: "version", col: 3, row: 2, colSpan: 1, rowSpan: 1, rounded: true },

  { page: 1, type: "text", label: "Verhaal", field: "story_text", col: 1, row: 3, colSpan: 3, rowSpan: 3, style: "body", rounded: true },

  // Page 4 braille fields from your editor (letters + braille)
  { page: 1, type: "text", label: "Titel letters (Pagina 4)", field: "page_a_title_letters", col: 1, row: 6, colSpan: 2, rowSpan: 1, style: "body", rounded: true },
  { page: 1, type: "text", label: "Titel braille (Pagina 4)", field: "page_a_title_braille", col: 3, row: 6, colSpan: 1, rowSpan: 1, style: "braille", rounded: true },

  { page: 1, type: "text", label: "Tekst letters (Pagina 4)", field: "page_a_text", col: 1, row: 7, colSpan: 2, rowSpan: 3, style: "body", rounded: true },
  { page: 1, type: "text", label: "Tekst braille (Pagina 4)", field: "page_a_text_braille", col: 3, row: 7, colSpan: 1, rowSpan: 3, style: "braille", rounded: true },

  { page: 1, type: "text", label: "Opmerkingen", field: "remarks_1", col: 1, row: 10, colSpan: 3, rowSpan: 3, style: "body", rounded: true },

  // Page 2
  { page: 2, type: "text", label: "Object beschrijving", field: "beschrijving_object", col: 1, row: 1, colSpan: 3, rowSpan: 3, style: "body", rounded: true },
  { page: 2, type: "text", label: "Klankzuiver", field: "klankzuiver_text", col: 1, row: 4, colSpan: 3, rowSpan: 2, style: "body", rounded: true },
  { page: 2, type: "text", label: "Opdracht 1", field: "opdracht1_text", col: 1, row: 6, colSpan: 2, rowSpan: 3, style: "body", rounded: true },
  { page: 2, type: "text", label: "Opdracht 2", field: "opdracht2_text", col: 3, row: 6, colSpan: 1, rowSpan: 3, style: "body", rounded: true },
  { page: 2, type: "text", label: "Opmerkingen", field: "remarks_2", col: 1, row: 9, colSpan: 3, rowSpan: 4, style: "body", rounded: true },

  // Page 3
  { page: 3, type: "text", label: "Opdracht 3", field: "opdracht3_text", col: 1, row: 1, colSpan: 2, rowSpan: 3, style: "body", rounded: true },
  { page: 3, type: "text", label: "Opdracht 4", field: "opdracht4_text", col: 3, row: 1, colSpan: 1, rowSpan: 3, style: "body", rounded: true },
  { page: 3, type: "text", label: "Opdracht 5", field: "opdracht5_text", col: 1, row: 4, colSpan: 2, rowSpan: 3, style: "body", rounded: true },
  { page: 3, type: "text", label: "Opdracht 6", field: "opdracht6_text", col: 3, row: 4, colSpan: 1, rowSpan: 3, style: "body", rounded: true },
  { page: 3, type: "text", label: "Opmerkingen", field: "remarks_3", col: 1, row: 7, colSpan: 3, rowSpan: 6, style: "body", rounded: true },
];

// ------------------------------
// Rendering helpers
// ------------------------------
function getField(record, field) {
  return typeof field === "function" ? field(record) : record?.[field];
}

function drawLabelValue(page, rect, fonts, label, value) {
  const x = rect.x + CELL_PAD;
  const yTop = rect.y + rect.h - CELL_PAD;

  page.drawText(String(label ?? ""), {
    x,
    y: yTop - fonts.label.size,
    size: fonts.label.size,
    font: fonts.label.font,
    color: rgb(0, 0, 0),
  });

  page.drawText(String(value ?? "-"), {
    x,
    y: yTop - fonts.label.size - 18,
    size: fonts.body.size,
    font: fonts.body.font,
    color: rgb(0, 0, 0),
  });
}

function drawTextBlock(page, rect, fonts, label, value, styleKey) {
  const style = fonts[styleKey] ?? fonts.body;
  let y = rect.y + rect.h - CELL_PAD;

  if (label) {
    page.drawText(String(label), {
      x: rect.x + CELL_PAD,
      y: y - fonts.label.size,
      size: fonts.label.size,
      font: fonts.label.font,
      color: rgb(0, 0, 0),
    });
    y -= fonts.label.line;
  }

  const maxW = rect.w - 2 * CELL_PAD;
  const lines = wrapToWidth(style.font, style.size, String(value ?? ""), maxW);

  for (const ln of lines) {
    const nextY = y - style.size;
    if (nextY < rect.y + CELL_PAD) break; // clip inside cell
    page.drawText(ln, {
      x: rect.x + CELL_PAD,
      y: nextY,
      size: style.size,
      font: style.font,
      color: rgb(0, 0, 0),
    });
    y -= style.line;
  }
}

// ------------------------------
// Handler
// ------------------------------
export default async function handler(req, res) {
  try {
    // Require authentication
    const token = getBearerToken(req);
    if (!token) {
      res.status(401).json({ error: "Not signed in" });
      return;
    }

    // Require id
    const id = req.query.id;
    if (!id) {
      res.status(400).json({ error: "Missing query param: id" });
      return;
    }

    // Create Supabase client with the user's JWT to enforce RLS
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.authorization } },
    });

    // Fetch record (adjust .select(...) to your needs)
    const { data: record, error } = await supabase
      .from("mpop_items")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      // Return a clean error (avoid leaking internals)
      res.status(403).json({ error: error.message });
      return;
    }

    // Build PDF
    const pdfDoc = await PDFDocument.create();

    // Base fonts
    const bodyFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Optional braille-capable font
    let brailleFont = null;
    const braillePath = fontFile("NotoSansSymbols2-Regular.ttf");
    if (fs.existsSync(braillePath)) {
      brailleFont = await pdfDoc.embedFont(fs.readFileSync(braillePath));
    }

    // Font styles
    const fonts = {
      h1: { font: boldFont, size: 16, line: 18 },
      label: { font: boldFont, size: 8, line: 12 },
      body: { font: bodyFont, size: 10, line: 14 },
      braille: { font: brailleFont ?? bodyFont, size: 22, line: 26 },
    };

    // Create pages
    const maxPage = Math.max(...LAYOUT.map((x) => x.page));
    const pages = [];
    for (let p = 1; p <= maxPage; p++) {
      const page = pdfDoc.addPage([PAGE.w, PAGE.h]);
      pages[p] = page;

      // Footer page number
      page.drawText(`Page ${p} of ${maxPage}`, {
        x: PAGE.w - M - 80,
        y: M - 24,
        size: 8,
        font: bodyFont,
        color: rgb(0.35, 0.35, 0.35),
      });
    }

    // Render layout
    for (const item of LAYOUT) {
      const page = pages[item.page];
      const rect = cellRect(item.col, item.row, item.colSpan ?? 1, item.rowSpan ?? 1);

      drawGridDebug(page, rect);

      if (item.rounded) {
        drawRoundedBox(page, rect, {
          radius: item.style === "h1" ? 14 : 12,
          fill: rgb(1, 1, 1),
          stroke: rgb(0.85, 0.85, 0.85),
          strokeWidth: 1,
        });
      }

      const value = getField(record, item.field);

      if (item.type === "labelValue") {
        drawLabelValue(page, rect, fonts, item.label, value);
      } else if (item.type === "text") {
        drawTextBlock(page, rect, fonts, item.label, value, item.style ?? "body");
      }
    }

    const pdfBytes = await pdfDoc.save();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="mpop-${id}.pdf"`);
    res.send(Buffer.from(pdfBytes));
  } catch (e) {
    res.status(500).json({ error: e?.message ?? "Unknown error" });
  }
}