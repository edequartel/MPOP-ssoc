<?php
declare(strict_types=1);

require_once __DIR__ . "/server_auth.php";

cors_preflight("POST, OPTIONS");
if ($_SERVER["REQUEST_METHOD"] !== "POST") {
  json_out(405, ["ok" => false, "error" => "Method not allowed."]);
}

require_allowed_role(["admin", "editor", "soundcreator"]);

$path = (string)($_POST["path"] ?? "");
$audiofile = (string)($_POST["audiofile"] ?? "");
if ($path === "" || $audiofile === "" || !isset($_FILES["file"])) {
  json_out(400, ["ok" => false, "error" => "Missing path, audiofile, or file."]);
}

$uploadToken = getenv("UPLOAD_MP3_TOKEN") ?: getenv("UPLOAD_TOKEN") ?: "een_heel_lang_random_token_hier";
$targetUrl = getenv("BLUEHOST_UPLOAD_MP3_URL") ?: "https://www.tastenbraille.com/mpop/api/upload_mp3.php";
$tmpName = (string)($_FILES["file"]["tmp_name"] ?? "");
$originalName = (string)($_FILES["file"]["name"] ?? $audiofile);
if ($tmpName === "" || !is_uploaded_file($tmpName)) {
  json_out(400, ["ok" => false, "error" => "Invalid uploaded file."]);
}

$postFields = [
  "token" => $uploadToken,
  "path" => $path,
  "audiofile" => $audiofile,
  "file" => new CURLFile($tmpName, "audio/mpeg", $originalName),
];

$ch = curl_init($targetUrl);
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_FOLLOWLOCATION => true,
  CURLOPT_CONNECTTIMEOUT => 10,
  CURLOPT_TIMEOUT => 120,
  CURLOPT_POST => true,
  CURLOPT_POSTFIELDS => $postFields,
  CURLOPT_HTTPHEADER => ["Accept: application/json"],
]);
$body = curl_exec($ch);
$err = curl_error($ch);
$status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$contentType = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
curl_close($ch);

if ($body === false) {
  json_out(502, ["ok" => false, "error" => "Upload request failed.", "detail" => $err]);
}

http_response_code($status ?: 502);
header("Content-Type: " . ($contentType ?: "application/json; charset=utf-8"));
echo $body;
