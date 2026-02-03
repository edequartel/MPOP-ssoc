import { createClient } from "@supabase/supabase-js";
import fontkit from "@pdf-lib/fontkit";
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
    .select("id,title,image1_path,image2_path,image3_path")
    .eq("id", id)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!item) return res.status(404).json({ error: "Item not found" });

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const IMAGE_BASE_URL = "https://www.tastenbraille.com/braillestudio";
  const LOGO_URL =
    "https://www.tastenbraille.com/braillestudio/resources/assets/pen_dot.png";
  const BRAILLE_FONT_URL =
    "https://www.tastenbraille.com/braillestudio/resources/fonts/bartimeus6dots.ttf";

  let logoImage = null;
  try {
    const logoResponse = await fetch(LOGO_URL);
    if (logoResponse.ok) {
      const logoBytes = await logoResponse.arrayBuffer();
      logoImage = await pdfDoc.embedPng(logoBytes);
    }
  } catch {
    // If logo fetch fails, continue without it.
  }

  let brailleFont = null;
  try {
    const brailleResponse = await fetch(BRAILLE_FONT_URL);
    if (brailleResponse.ok) {
      const brailleBytes = await brailleResponse.arrayBuffer();
      brailleFont = await pdfDoc.embedFont(brailleBytes);
    }
  } catch {
    // If font fetch fails, continue without it.
  }

  const addImagePage = async (imagePath, pageTitle, showTitle, pageNumber) => {
    const page = pdfDoc.addPage([595, 842]);
    if (showTitle) {
      const titleSize = 16;
      const titleWidth = font.widthOfTextAtSize(pageTitle, titleSize);
      const titleX = (595 - titleWidth) / 2;
      page.drawText(pageTitle, { x: titleX, y: 800, size: titleSize, font });

      if (brailleFont) {
        const brailleSize = 32;
        const brailleWidth = brailleFont.widthOfTextAtSize(
          pageTitle,
          brailleSize
        );
        const brailleX = (595 - brailleWidth) / 2;
        page.drawText(pageTitle, {
          x: brailleX,
          y: 760,
          size: brailleSize,
          font: brailleFont,
        });
      }
    }

    if (logoImage) {
      const maxLogoSize = 32;
      const scale = Math.min(
        maxLogoSize / logoImage.width,
        maxLogoSize / logoImage.height,
        1
      );
      const logoWidth = logoImage.width * scale;
      const logoHeight = logoImage.height * scale;
      const leftX = 48;
      const rightX = 595 - 48 - logoWidth;
      const topY = 842 - 48 - logoHeight;
      const bottomY = 48;

      page.drawImage(logoImage, {
        x: leftX,
        y: topY,
        width: logoWidth,
        height: logoHeight,
      });
      page.drawImage(logoImage, {
        x: rightX,
        y: topY,
        width: logoWidth,
        height: logoHeight,
      });
      page.drawImage(logoImage, {
        x: rightX,
        y: bottomY,
        width: logoWidth,
        height: logoHeight,
      });
      page.drawImage(logoImage, {
        x: leftX,
        y: bottomY,
        width: logoWidth,
        height: logoHeight,
      });

      const pageNumberText = String(pageNumber);
      const pageNumberSize = 10;
      const pageNumberWidth = font.widthOfTextAtSize(
        pageNumberText,
        pageNumberSize
      );
      const pageNumberX = rightX + logoWidth - pageNumberWidth;
      const pageNumberY = topY - 14;
      page.drawText(pageNumberText, {
        x: pageNumberX,
        y: pageNumberY,
        size: pageNumberSize,
        font,
      });
    }

    const imageUrl = imagePath ? `${IMAGE_BASE_URL}${imagePath}` : "";
    if (!imageUrl) {
      page.drawText("Afbeelding bestaat niet", {
        x: 48,
        y: 780,
        size: 12,
        font,
      });
      return;
    }

    try {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        page.drawText("Afbeelding bestaat niet", {
          x: 48,
          y: 760,
          size: 12,
          font,
        });
        return;
      }
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
      const pageWidth = 595;
      const pageHeight = 842;
      const centerX = (pageWidth - drawWidth) / 2;
      const centerY = (pageHeight - drawHeight) / 2;

      page.drawImage(image, {
        x: centerX,
        y: centerY,
        width: drawWidth,
        height: drawHeight,
      });
    } catch {
      page.drawText("Afbeelding bestaat niet", {
        x: 48,
        y: 760,
        size: 12,
        font,
      });
    }
  };

  const titleText = item.title ?? "MPOP item";
  await addImagePage(item.image1_path ?? "", titleText, true, 1);
  await addImagePage(item.image2_path ?? "", titleText, false, 2);
  await addImagePage(item.image3_path ?? "", titleText, false, 3);

  const pdfBytes = await pdfDoc.save();

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="mpop-${id}.pdf"`);
  res.send(Buffer.from(pdfBytes));
}
