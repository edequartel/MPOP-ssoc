<?php
declare(strict_types=1);

ini_set("display_errors", "0");

require_once __DIR__ . "/server_auth.php";
require_once __DIR__ . "/../vendor/autoload.php";

use Dompdf\Dompdf;
use Dompdf\Options;

cors_preflight("GET, OPTIONS");
if ($_SERVER["REQUEST_METHOD"] !== "GET") {
  json_out(405, ["ok" => false, "error" => "Method not allowed."]);
}

$auth = require_allowed_role(["admin", "editor", "soundcreator"]);
$id = trim((string)($_GET["id"] ?? ""));
if ($id === "" || $id === "undefined" || $id === "null") {
  json_out(400, ["ok" => false, "error" => "Missing id."]);
}

$itemUrl = rtrim($SUPABASE_URL, "/")
  . "/rest/v1/mpop_items?select=id,code,title,image1_path,image2_path,image3_path&id=eq."
  . rawurlencode($id)
  . "&limit=1";
$items = supabase_get_json($itemUrl, $auth["jwt"]);
$item = $items[0] ?? null;
if (!is_array($item)) {
  json_out(404, ["ok" => false, "error" => "Item not found."]);
}

function pdf_escape(string $value): string {
  return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, "UTF-8");
}

function pdf_fetch_data_uri(string $url): string {
  if ($url === "" || !function_exists("curl_init")) return "";

  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_USERAGENT => "MPOP-Dompdf/1.0",
  ]);
  $body = curl_exec($ch);
  $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
  $contentType = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
  if (!is_string($body) || $body === "" || $status < 200 || $status >= 300) {
    return "";
  }

  $mime = strtolower(trim(explode(";", $contentType)[0] ?? ""));
  if (!str_starts_with($mime, "image/") && !str_starts_with($mime, "font/")) {
    $info = @getimagesizefromstring($body);
    $mime = is_array($info) ? (string)($info["mime"] ?? "") : "";
  }
  if ($mime === "") return "";

  return "data:" . $mime . ";base64," . base64_encode($body);
}

function pdf_local_data_uri(string $path): string {
  $normalized = str_replace("\\", "/", trim($path));
  if ($normalized === "") return "";
  if (preg_match('~^https?://~i', $normalized)) {
    $url = parse_url($normalized);
    $normalized = (string)($url["path"] ?? "");
  }
  foreach (["/braillestudio-data/", "/braillestudio/"] as $prefix) {
    $pos = strpos($normalized, $prefix);
    if ($pos !== false) {
      $normalized = substr($normalized, $pos + strlen($prefix));
      break;
    }
  }

  $documentRoot = rtrim((string)($_SERVER["DOCUMENT_ROOT"] ?? ""), "/");
  $base = realpath($documentRoot . "/braillestudio-data");
  if ($base === false) return "";
  $file = realpath($base . "/" . ltrim($normalized, "/"));
  if ($file === false || !is_file($file) || !str_starts_with($file, $base . DIRECTORY_SEPARATOR)) {
    return "";
  }

  $body = file_get_contents($file);
  if (!is_string($body) || $body === "") return "";
  $mime = mime_content_type($file) ?: "";
  return $mime !== "" ? "data:" . $mime . ";base64," . base64_encode($body) : "";
}

function pdf_public_url(string $path): string {
  $path = trim($path);
  if ($path === "") return "";

  $normalized = str_replace("\\", "/", $path);
  if (preg_match('~^https?://~i', $normalized)) {
    $url = parse_url($normalized);
    $host = strtolower((string)($url["host"] ?? ""));
    if (!in_array($host, ["tastenbraille.com", "www.tastenbraille.com"], true)) {
      return "";
    }
    $normalized = (string)($url["path"] ?? "");
  }
  foreach (["/braillestudio-data/", "/braillestudio/"] as $prefix) {
    $pos = strpos($normalized, $prefix);
    if ($pos !== false) {
      $normalized = substr($normalized, $pos + strlen($prefix));
      break;
    }
  }
  return "https://www.tastenbraille.com/braillestudio-data/" . ltrim($normalized, "/");
}

function pdf_image_markup(string $path): string {
  $url = pdf_public_url($path);
  $src = pdf_local_data_uri($path);
  if ($src === "") $src = pdf_fetch_data_uri($url);
  if ($src === "") {
    return '<div class="missing">Afbeelding bestaat niet</div>';
  }
  return '<img class="main-image" src="' . pdf_escape($src) . '" alt="" />';
}

$title = trim((string)($item["title"] ?? "")) ?: "MPOP item";
$code = trim((string)($item["code"] ?? ""));
$markerPath = "/resources/assets/pen_dot.png";
$markerImage = pdf_local_data_uri($markerPath);
if ($markerImage === "") $markerImage = pdf_fetch_data_uri(pdf_public_url($markerPath));
$documentRoot = rtrim((string)($_SERVER["DOCUMENT_ROOT"] ?? ""), "/");
$brailleFontFs = $documentRoot . "/braillestudio-data/resources/fonts/bartimeus6dotszwelpapier.ttf";
$brailleFont = is_file($brailleFontFs)
  ? "file://" . $brailleFontFs
  : "https://www.tastenbraille.com/braillestudio-data/resources/fonts/bartimeus6dotszwelpapier.ttf";

$pages = [];
foreach ([1, 2, 3] as $pageNumber) {
  $imagePath = (string)($item["image{$pageNumber}_path"] ?? "");
  $qr = $code === ""
    ? ""
    : pdf_fetch_data_uri(
        "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data="
        . rawurlencode("M" . $code . str_pad((string)$pageNumber, 4, "0", STR_PAD_LEFT))
      );
  $pages[] = [
    "number" => $pageNumber,
    "image" => pdf_image_markup($imagePath),
    "qr" => $qr,
  ];
}

$logoMarkup = $markerImage !== "" ? '<img class="marker-image" src="' . pdf_escape($markerImage) . '" alt="" />' : "";
$htmlPages = "";
foreach ($pages as $page) {
  $pageNumber = (int)$page["number"];
  $showTitle = $pageNumber === 1;
  $qrMarkup = $page["qr"] !== ""
    ? '<img class="qr" src="' . pdf_escape((string)$page["qr"]) . '" alt="" />'
    : "";
  $htmlPages .= '
    <div class="pdf-page' . ($pageNumber > 1 ? ' page-break' : '') . '">
      <div class="page-number">' . $pageNumber . '<span class="braille-page">#' . $pageNumber . '&nbsp;&nbsp;</span></div>
      ' . ($showTitle ? '<div class="title">' . pdf_escape($title) . '</div><div class="braille-title">' . pdf_escape($title) . '</div>' : '') . '
      <div class="marker top-left">' . $logoMarkup . '</div>
      <div class="marker top-right">' . $logoMarkup . '</div>
      <div class="marker bottom-left">' . $logoMarkup . '</div>
      <div class="marker bottom-right">' . $logoMarkup . '</div>
      <div class="qr-wrap">' . $qrMarkup . '</div>
      <div class="image-area image-area-' . $pageNumber . '">
        <div class="image-cell">' . $page["image"] . '</div>
      </div>
    </div>';
}

$html = '<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<style>
  @page { margin: 0; size: A4 portrait; }
  @font-face {
    font-family: "BartimeusBraille";
    src: url("' . pdf_escape($brailleFont) . '") format("truetype");
  }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: DejaVu Sans, sans-serif; color: #000; }
  .pdf-page {
    position: relative;
    width: 210mm;
    height: 296mm;
    overflow: hidden;
  }
  .page-break { page-break-before: always; }
  .title {
    position: absolute;
    top: 12mm;
    left: 18mm;
    right: 18mm;
    text-align: center;
    font-size: 32pt;
    line-height: 1;
  }
  .braille-title {
    position: absolute;
    top: 27mm;
    left: 18mm;
    right: 18mm;
    text-align: center;
    font-family: "BartimeusBraille", DejaVu Sans, sans-serif;
    font-size: 32pt;
    line-height: 1;
  }
  .page-number {
    position: absolute;
    top: 6mm;
    right: 3mm;
    font-size: 12pt;
    white-space: nowrap;
  }
  .braille-page {
    margin-left: 3mm;
    font-family: "BartimeusBraille", DejaVu Sans, sans-serif;
    font-size: 32pt;
    vertical-align: middle;
  }
  .marker {
    position: absolute;
    width: 11.3mm;
    height: 11.3mm;
  }
  .marker-image { width: 11.3mm; height: 11.3mm; object-fit: contain; }
  .top-left { top: 27mm; left: 17mm; }
  .top-right { top: 27mm; right: 17mm; }
  .bottom-left { bottom: 17mm; left: 17mm; }
  .bottom-right { bottom: 17mm; right: 17mm; }
  .qr-wrap {
    position: absolute;
    right: 17mm;
    bottom: 30mm;
    width: 14mm;
    height: 14mm;
  }
  .qr { width: 14mm; height: 14mm; }
  .image-area {
    position: absolute;
    left: 17mm;
    top: 34mm;
    display: table;
    width: 176mm;
    height: 229mm;
    text-align: center;
  }
  .image-cell {
    display: table-cell;
    width: 176mm;
    height: 229mm;
    vertical-align: middle;
    text-align: center;
  }
  .main-image {
    max-width: 176mm;
    max-height: 229mm;
  }
  .missing { color: #555; font-size: 12pt; }
</style>
</head>
<body>' . $htmlPages . '</body>
</html>';

$options = new Options();
$options->set("isRemoteEnabled", true);
$options->set("isHtml5ParserEnabled", true);
$options->set("defaultFont", "DejaVu Sans");
if ($documentRoot !== "") {
  $options->setChroot($documentRoot);
}

$dompdf = new Dompdf($options);
$dompdf->loadHtml($html, "UTF-8");
$dompdf->setPaper("A4", "portrait");
$dompdf->render();

$safeTitle = preg_replace('/[^A-Za-z0-9_-]+/', '-', $title) ?: "item";
$safeTitle = trim($safeTitle, "-") ?: "item";

header("Content-Type: application/pdf");
header('Content-Disposition: inline; filename="mpop-mm-' . $safeTitle . '.pdf"');
header("Cache-Control: no-store");
echo $dompdf->output();
