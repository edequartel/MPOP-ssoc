<?php
declare(strict_types=1);

header("Content-Type: application/json; charset=utf-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
  http_response_code(204);
  exit;
}

function fail(int $code, string $message, array $extra = []): void {
  http_response_code($code);
  echo json_encode(["ok" => false, "error" => $message] + $extra, JSON_UNESCAPED_SLASHES);
  exit;
}

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
  fail(405, "Method not allowed.");
}

if (!function_exists("curl_init")) {
  fail(500, "PHP cURL extension is not available.");
}

if (!function_exists("proc_open")) {
  fail(500, "proc_open is disabled on this server.");
}

$supabaseUrl = "https://zrcdyzcfsdlmqqwdhctk.supabase.co";
$supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyY2R5emNmc2RsbXFxd2RoY3RrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxOTgyNzUsImV4cCI6MjA4Mzc3NDI3NX0.voT1eh_FbBkrv7ZMN7B8VRRbrab7tyx3eV6JuXy4ySs";

function bearerToken(): string {
  $auth = $_SERVER["HTTP_AUTHORIZATION"] ?? "";
  if (!preg_match('/^Bearer\s+(.+)$/i', $auth, $m)) {
    fail(401, "Missing bearer token.");
  }
  return trim($m[1]);
}

function getJson(string $url, array $headers): array {
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT => 20,
    CURLOPT_HTTPHEADER => $headers,
  ]);
  $body = curl_exec($ch);
  $err = curl_error($ch);
  $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
  curl_close($ch);

  if ($body === false) {
    fail(502, "Supabase request failed.", ["detail" => $err]);
  }
  $data = json_decode((string)$body, true);
  if ($status < 200 || $status >= 300 || !is_array($data)) {
    fail(502, "Supabase request returned an invalid response.", [
      "status" => $status,
      "body" => is_string($body) ? substr($body, 0, 500) : "",
    ]);
  }
  return $data;
}

function requireAdmin(string $jwt, string $supabaseUrl, string $anonKey): void {
  $commonHeaders = [
    "apikey: {$anonKey}",
    "Authorization: Bearer {$jwt}",
    "Accept: application/json",
  ];

  $user = getJson(rtrim($supabaseUrl, "/") . "/auth/v1/user", $commonHeaders);
  $userId = (string)($user["id"] ?? "");
  if ($userId === "") {
    fail(401, "Invalid Supabase session.");
  }

  $profileUrl = rtrim($supabaseUrl, "/")
    . "/rest/v1/profiles?select=role&user_id=eq."
    . rawurlencode($userId)
    . "&limit=1";
  $profiles = getJson($profileUrl, $commonHeaders);
  $role = (string)($profiles[0]["role"] ?? "");
  if ($role !== "admin") {
    fail(403, "Only admin users may run git pull.");
  }
}

function runGitPull(string $repoDir): array {
  $path = getenv("PATH") ?: "/usr/local/bin:/usr/bin:/bin";
  $home = getenv("HOME") ?: null;
  $env = [
    "GIT_TERMINAL_PROMPT" => "0",
    "PATH" => $path,
  ];
  if ($home) {
    $env["HOME"] = $home;
  }

  $descriptors = [
    0 => ["pipe", "r"],
    1 => ["pipe", "w"],
    2 => ["pipe", "w"],
  ];

  $process = proc_open("git pull", $descriptors, $pipes, $repoDir, $env);
  if (!is_resource($process)) {
    fail(500, "Could not start git pull.");
  }

  fclose($pipes[0]);
  stream_set_blocking($pipes[1], false);
  stream_set_blocking($pipes[2], false);

  $stdout = "";
  $stderr = "";
  $started = time();
  $timedOut = false;

  while (true) {
    $stdout .= stream_get_contents($pipes[1]) ?: "";
    $stderr .= stream_get_contents($pipes[2]) ?: "";

    $status = proc_get_status($process);
    if (!$status["running"]) {
      break;
    }

    if (time() - $started > 120) {
      $timedOut = true;
      proc_terminate($process);
      break;
    }

    usleep(100000);
  }

  $stdout .= stream_get_contents($pipes[1]) ?: "";
  $stderr .= stream_get_contents($pipes[2]) ?: "";
  fclose($pipes[1]);
  fclose($pipes[2]);
  $exitCode = proc_close($process);

  if ($timedOut) {
    fail(504, "git pull timed out.", [
      "stdout" => $stdout,
      "stderr" => $stderr,
    ]);
  }

  return [
    "exitCode" => $exitCode,
    "stdout" => $stdout,
    "stderr" => $stderr,
  ];
}

$jwt = bearerToken();
requireAdmin($jwt, $supabaseUrl, $supabaseAnonKey);

$repoDir = realpath(__DIR__ . "/..");
if (!$repoDir || !is_dir($repoDir . "/.git")) {
  fail(500, "Repository directory could not be resolved.");
}

$result = runGitPull($repoDir);
$output = trim($result["stdout"] . ($result["stderr"] !== "" ? "\n" . $result["stderr"] : ""));

if ((int)$result["exitCode"] !== 0) {
  fail(500, "git pull failed.", [
    "command" => "git pull",
    "exitCode" => $result["exitCode"],
    "output" => $output,
  ]);
}

echo json_encode([
  "ok" => true,
  "command" => "git pull",
  "exitCode" => $result["exitCode"],
  "output" => $output,
], JSON_UNESCAPED_SLASHES);
