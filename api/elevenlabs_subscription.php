<?php
declare(strict_types=1);

ini_set('display_errors', '0');

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Authorization, Content-Type');
header('Access-Control-Max-Age: 86400');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header('Content-Type: application/json; charset=utf-8');

function json_out(int $status, array $data): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES);
    exit;
}

function env_value(string $key): string {
    $value = getenv($key);
    return is_string($value) ? trim($value) : '';
}

function bearer_token(): string {
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['Authorization'] ?? '';
    if (!is_string($header)) {
        return '';
    }
    if (!preg_match('/^\s*Bearer\s+(.+?)\s*$/i', $header, $m)) {
        return '';
    }
    return trim((string)$m[1]);
}

function curl_json(string $method, string $url, array $headers = [], ?string $body = null): array {
    $ch = curl_init($url);
    if ($ch === false) {
        throw new RuntimeException('curl_init failed');
    }

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 20,
    ]);

    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }

    $response = curl_exec($ch);
    if ($response === false) {
        $err = curl_error($ch);
        curl_close($ch);
        throw new RuntimeException($err ?: 'Unknown cURL error');
    }

    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    $decoded = json_decode($response, true);
    return [
        'status' => $status,
        'body_raw' => $response,
        'body_json' => is_array($decoded) ? $decoded : null,
    ];
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    json_out(405, ['ok' => false, 'error' => 'Method not allowed']);
}

$jwt = bearer_token();
if ($jwt === '') {
    json_out(401, ['ok' => false, 'error' => 'Missing Bearer token']);
}

$supabaseUrl = rtrim(env_value('SUPABASE_URL'), '/');
$supabaseAnonKey = env_value('SUPABASE_ANON_KEY');
$supabaseServiceKey = env_value('SUPABASE_SERVICE_ROLE_KEY');
$elevenLabsApiKey = env_value('ELEVENLABS_API_KEY');

if ($supabaseUrl === '' || $supabaseAnonKey === '') {
    json_out(500, ['ok' => false, 'error' => 'Supabase env not configured']);
}
if ($supabaseServiceKey === '') {
    json_out(500, ['ok' => false, 'error' => 'SUPABASE_SERVICE_ROLE_KEY missing']);
}
if ($elevenLabsApiKey === '') {
    json_out(500, ['ok' => false, 'error' => 'ELEVENLABS_API_KEY missing']);
}

try {
    $userRes = curl_json('GET', $supabaseUrl . '/auth/v1/user', [
        'apikey: ' . $supabaseAnonKey,
        'Authorization: Bearer ' . $jwt,
        'Accept: application/json',
    ]);
} catch (Throwable $e) {
    json_out(502, ['ok' => false, 'error' => 'Supabase auth check failed', 'details' => $e->getMessage()]);
}

if ($userRes['status'] < 200 || $userRes['status'] >= 300 || !is_array($userRes['body_json'])) {
    json_out(401, [
        'ok' => false,
        'error' => 'Invalid Supabase session',
        'details' => $userRes['body_json']['msg'] ?? $userRes['body_raw'] ?? '',
    ]);
}

$userId = trim((string)($userRes['body_json']['id'] ?? ''));
if ($userId === '') {
    json_out(401, ['ok' => false, 'error' => 'Supabase user id missing']);
}

$profileUrl = $supabaseUrl . '/rest/v1/profiles?select=role&user_id=eq.' . rawurlencode($userId) . '&limit=1';

try {
    $profileRes = curl_json('GET', $profileUrl, [
        'apikey: ' . $supabaseServiceKey,
        'Authorization: Bearer ' . $supabaseServiceKey,
        'Accept: application/json',
    ]);
} catch (Throwable $e) {
    json_out(502, ['ok' => false, 'error' => 'Profile lookup failed', 'details' => $e->getMessage()]);
}

$profileRows = $profileRes['body_json'];
$role = '';
if (is_array($profileRows) && isset($profileRows[0]) && is_array($profileRows[0])) {
    $role = trim((string)($profileRows[0]['role'] ?? ''));
}

if (!in_array($role, ['admin', 'editor'], true)) {
    json_out(403, ['ok' => false, 'error' => 'Forbidden', 'role' => $role]);
}

try {
    $subscriptionRes = curl_json('GET', 'https://api.elevenlabs.io/v1/user/subscription', [
        'xi-api-key: ' . $elevenLabsApiKey,
        'Accept: application/json',
    ]);
} catch (Throwable $e) {
    json_out(502, ['ok' => false, 'error' => 'ElevenLabs request failed', 'details' => $e->getMessage()]);
}

if ($subscriptionRes['status'] < 200 || $subscriptionRes['status'] >= 300 || !is_array($subscriptionRes['body_json'])) {
    json_out($subscriptionRes['status'] ?: 502, [
        'ok' => false,
        'error' => 'ElevenLabs request failed',
        'details' => $subscriptionRes['body_raw'] ?? '',
    ]);
}

$sub = $subscriptionRes['body_json'];
json_out(200, [
    'ok' => true,
    'tier' => $sub['tier'] ?? null,
    'status' => $sub['status'] ?? null,
    'character_count' => $sub['character_count'] ?? null,
    'character_limit' => $sub['character_limit'] ?? null,
    'next_character_count_reset_unix' => $sub['next_character_count_reset_unix'] ?? null,
]);
