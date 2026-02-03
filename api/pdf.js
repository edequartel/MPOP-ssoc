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
    .select("id,title,image_path")
    .eq("id", id)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!item) return res.status(404).json({ error: "Item not found" });

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const titleText = item.title ?? "MPOP item";
  page.drawText(titleText, { x: 48, y: 800, size: 16, font });

  const IMAGE_BASE_URL = "https://www.tastenbraille.com/braillestudio";
  const imagePath = item.image_path ?? "";
  const imageUrl = imagePath ? `${IMAGE_BASE_URL}${imagePath}` : "";

  if (imageUrl) {
    page.drawText(imageUrl, { x: 48, y: 780, size: 10, font });

    try {
      const response = await fetch(imageUrl);
      if (response.ok) {
        const imageBytes = await response.arrayBuffer();
        const isPng = imagePath.toLowerCase().endsWith(".png");
        const image = isPng
          ? await pdfDoc.embedPng(imageBytes)
          : await pdfDoc.embedJpg(imageBytes);

        const maxWidth = 500;
        const maxHeight = 680;
        const scale = Math.min(
          maxWidth / image.width,
          maxHeight / image.height,
          1
        );
        const drawWidth = image.width * scale;
        const drawHeight = image.height * scale;
        const imageTopY = 760;
        const imageY = imageTopY - drawHeight;

        page.drawImage(image, {
          x: 48,
          y: Math.max(imageY, 48),
          width: drawWidth,
          height: drawHeight,
        });
      }
    } catch {
      // If image fetch fails, keep the PDF with title + URL only.
    }
  }

  const pdfBytes = await pdfDoc.save();

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="mpop-${id}.pdf"`);
  res.send(Buffer.from(pdfBytes));
}
