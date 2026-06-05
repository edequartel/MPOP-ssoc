<?php
declare(strict_types=1);

require_once __DIR__ . "/server_auth.php";

cors_preflight("POST, OPTIONS");
if ($_SERVER["REQUEST_METHOD"] !== "POST") {
  json_out(405, ["ok" => false, "error" => "Method not allowed."]);
}

require_allowed_role(["admin", "editor", "soundcreator"]);

$raw = file_get_contents("php://input") ?: "";
if ($raw === "" || json_decode($raw, true) === null) {
  json_out(400, ["ok" => false, "error" => "Invalid JSON body."]);
}

$uploadToken = getenv("UPLOAD_TOKEN") ?: "een_heel_lang_random_token_hier";
$targetUrl = getenv("BLUEHOST_MERGE_URL") ?: "https://www.tastenbraille.com/api/mixedmerge_mp3.php";

$ch = curl_init($targetUrl);
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_FOLLOWLOCATION => true,
  CURLOPT_CONNECTTIMEOUT => 10,
  CURLOPT_TIMEOUT => 180,
  CURLOPT_POST => true,
  CURLOPT_POSTFIELDS => $raw,
  CURLOPT_HTTPHEADER => [
    "Authorization: Bearer {$uploadToken}",
    "Content-Type: application/json",
    "Accept: application/json",
  ],
]);
$body = curl_exec($ch);
$err = curl_error($ch);
$status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$contentType = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
curl_close($ch);

if ($body === false) {
  json_out(502, ["ok" => false, "error" => "Merge request failed.", "detail" => $err]);
}

http_response_code($status ?: 502);
header("Content-Type: " . ($contentType ?: "application/json; charset=utf-8"));
echo $body;
