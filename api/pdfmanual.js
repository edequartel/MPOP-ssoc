import { createClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts } from "pdf-lib";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  const idRaw = req.query.id;
  const id = Array.isArray(idRaw) ? idRaw[0] : idRaw;
  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "Missing id" });
  }
  if (id === "undefined" || id === "null") {
    return res.status(400).json({ error: "Missing id" });
  }

  const authHeader = req.headers?.authorization || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const supabaseKey = serviceKey || anonKey;
  if (!process.env.SUPABASE_URL || !supabaseKey) {
    return res.status(500).json({ error: "Supabase env not configured" });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    supabaseKey,
    authHeader
      ? { global: { headers: { Authorization: authHeader } } }
      : undefined
  );

  const { data: item, error } = await supabase
    .from("mpop_items")
    .select("id,title,handleidig_text")
    .eq("id", id)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!item) return res.status(404).json({ error: "Item not found" });

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const MARGIN = 48;
  const LINE_HEIGHT = 14;
  const TITLE_SIZE = 18;
  const BODY_SIZE = 12;
  const PAGE_W = 595;
  const PAGE_H = 842;

  let y = PAGE_H - MARGIN - TITLE_SIZE;
  page.drawText(item.title ?? "MPOP item", {
    x: MARGIN,
    y,
    size: TITLE_SIZE,
    font: fontBold,
  });
  y -= TITLE_SIZE + 12;

  const maxWidth = PAGE_W - MARGIN * 2;
  const raw = (item.handleidig_text ?? "").toString();
  const lines = raw.split(/\r?\n/);
  for (const lineText of lines) {
    if (!lineText) {
      y -= LINE_HEIGHT;
      continue;
    }
    const words = lineText.split(/\s+/);
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      const w = font.widthOfTextAtSize(test, BODY_SIZE);
      if (w <= maxWidth) {
        line = test;
      } else {
        if (y < MARGIN) break;
        page.drawText(line, { x: MARGIN, y, size: BODY_SIZE, font });
        y -= LINE_HEIGHT;
        line = word;
      }
    }
    if (line && y >= MARGIN) {
      page.drawText(line, { x: MARGIN, y, size: BODY_SIZE, font });
      y -= LINE_HEIGHT;
    }
    if (y < MARGIN) break;
  }

  const pdfBytes = await pdfDoc.save();

  const safeTitle = (item.title ?? "item")
    .toString()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-_]/g, "");

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="mpop-manual-${safeTitle}.pdf"`
  );
  res.send(Buffer.from(pdfBytes));
}
