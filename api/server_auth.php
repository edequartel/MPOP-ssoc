<?php
declare(strict_types=1);

$SUPABASE_URL = "https://zrcdyzcfsdlmqqwdhctk.supabase.co";
$SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyY2R5emNmc2RsbXFxd2RoY3RrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxOTgyNzUsImV4cCI6MjA4Mzc3NDI3NX0.voT1eh_FbBkrv7ZMN7B8VRRbrab7tyx3eV6JuXy4ySs";

function json_out(int $code, array $body): void {
  http_response_code($code);
  echo json_encode($body, JSON_UNESCAPED_SLASHES);
  exit;
}

function cors_preflight(string $methods = "POST, OPTIONS"): void {
  header("Content-Type: application/json; charset=utf-8");
  header("Access-Control-Allow-Origin: *");
  header("Access-Control-Allow-Methods: {$methods}");
  header("Access-Control-Allow-Headers: Content-Type, Authorization, Accept");
  if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(204);
    exit;
  }
}

function bearer_token(): string {
  $auth = $_SERVER["HTTP_AUTHORIZATION"] ?? "";
  if (!preg_match('/^Bearer\s+(.+)$/i', $auth, $m)) {
    json_out(401, ["ok" => false, "error" => "Missing bearer token."]);
  }
  return trim($m[1]);
}

function supabase_get_json(string $url, string $jwt): array {
  global $SUPABASE_ANON_KEY;
  if (!function_exists("curl_init")) {
    json_out(500, ["ok" => false, "error" => "PHP cURL extension is not available."]);
  }

  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT => 20,
    CURLOPT_HTTPHEADER => [
      "apikey: {$SUPABASE_ANON_KEY}",
      "Authorization: Bearer {$jwt}",
      "Accept: application/json",
    ],
  ]);
  $body = curl_exec($ch);
  $err = curl_error($ch);
  $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
  curl_close($ch);

  if ($body === false) {
    json_out(502, ["ok" => false, "error" => "Supabase request failed.", "detail" => $err]);
  }

  $data = json_decode((string)$body, true);
  if ($status < 200 || $status >= 300 || !is_array($data)) {
    json_out(502, [
      "ok" => false,
      "error" => "Supabase request returned an invalid response.",
      "status" => $status,
      "body" => is_string($body) ? substr($body, 0, 500) : "",
    ]);
  }
  return $data;
}

function require_allowed_role(array $allowedRoles): array {
  global $SUPABASE_URL;
  $jwt = bearer_token();
  $user = supabase_get_json(rtrim($SUPABASE_URL, "/") . "/auth/v1/user", $jwt);
  $userId = (string)($user["id"] ?? "");
  if ($userId === "") {
    json_out(401, ["ok" => false, "error" => "Invalid Supabase session."]);
  }

  $profileUrl = rtrim($SUPABASE_URL, "/")
    . "/rest/v1/profiles?select=role&user_id=eq."
    . rawurlencode($userId)
    . "&limit=1";
  $profiles = supabase_get_json($profileUrl, $jwt);
  $role = (string)($profiles[0]["role"] ?? "");
  if (!in_array($role, $allowedRoles, true)) {
    json_out(403, ["ok" => false, "error" => "Forbidden.", "role" => $role]);
  }

  return ["jwt" => $jwt, "userId" => $userId, "role" => $role];
}
