<?php
declare(strict_types=1);

ini_set('display_errors', '0');

/*
 * Verwacht multipart/form-data:
 * - token
 * - path       (bv. sounds/nl/stories)
 * - audiofile  (bv. bal-001.mp3)
 * - file       (de geuploade mp3 blob)
 */

// CORS (browser fetch)
header('Access-Control-Allow-Origin: *'); // of exact origin
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Max-Age: 86400');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header('Content-Type: application/json; charset=utf-8');

function json_out(int $status, array $data): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES);
    exit;
}

function sanitize_path(string $path): string {
    $path = trim($path);
    $path = str_replace('\\', '/', $path);
    $path = trim($path, '/');

    if ($path === '') {
        return '';
    }

    $parts = explode('/', $path);
    $safeParts = [];

    foreach ($parts as $part) {
        if ($part === '' || $part === '.' || $part === '..') {
            continue;
        }
        // Alleen veilige tekens per mapnaam
        if (!preg_match('/^[A-Za-z0-9._-]+$/', $part)) {
            json_out(400, ['ok' => false, 'error' => "Invalid path segment: {$part}"]);
        }
        $safeParts[] = $part;
    }

    return implode('/', $safeParts);
}

function sanitize_filename(string $name): string {
    $name = trim($name);
    $name = basename($name); // voorkomt path traversal via bestandsnaam
    $name = preg_replace('/[^A-Za-z0-9._-]/', '_', $name) ?: 'temp.mp3';

    if (!preg_match('/\.mp3$/i', $name)) {
        $name .= '.mp3';
    }

    return $name;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_out(405, ['ok' => false, 'error' => 'Method not allowed']);
}

// Pas aan naar je echte token
$expectedToken = 'een_heel_lang_random_token_hier';

$token = (string)($_POST['token'] ?? '');
if (!hash_equals($expectedToken, $token)) {
    json_out(401, ['ok' => false, 'error' => 'Invalid token']);
}

$path = sanitize_path((string)($_POST['path'] ?? ''));
$audiofile = sanitize_filename((string)($_POST['audiofile'] ?? ''));

if ($audiofile === '') {
    json_out(400, ['ok' => false, 'error' => 'Missing audiofile']);
}

if (!isset($_FILES['file'])) {
    json_out(400, ['ok' => false, 'error' => 'Missing file field']);
}

$file = $_FILES['file'];

if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    json_out(400, [
        'ok' => false,
        'error' => 'Upload failed',
        'code' => $file['error'] ?? null,
    ]);
}

$tmpPath = (string)($file['tmp_name'] ?? '');
if ($tmpPath === '' || !is_uploaded_file($tmpPath)) {
    json_out(400, ['ok' => false, 'error' => 'Invalid uploaded file']);
}

// Basis pad op server (filesystem)
$documentRoot = rtrim((string)($_SERVER['DOCUMENT_ROOT'] ?? ''), '/');
if ($documentRoot === '') {
    json_out(500, ['ok' => false, 'error' => 'DOCUMENT_ROOT not available']);
}

$baseFsDir = $documentRoot . '/braillestudio-data';
$targetDir = $baseFsDir . ($path !== '' ? '/' . $path : '');
$targetPath = $targetDir . '/' . $audiofile;

// Maak doelmap aan indien nodig
if (!is_dir($targetDir) && !mkdir($targetDir, 0775, true)) {
    json_out(500, ['ok' => false, 'error' => 'Cannot create target directory']);
}

// Verplaats upload
if (!move_uploaded_file($tmpPath, $targetPath)) {
    json_out(500, ['ok' => false, 'error' => 'Failed to move uploaded file']);
}

// MIME + grootte
$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mime = $finfo ? (finfo_file($finfo, $targetPath) ?: 'application/octet-stream') : 'application/octet-stream';
if ($finfo) {
    finfo_close($finfo);
}

$bytes = filesize($targetPath);
if ($bytes === false) {
    $bytes = 0;
}

// Publieke URL
$basePublicUrl = 'https://www.tastenbraille.com/braillestudio-data';
$urlPath = $path !== '' ? $path . '/' . $audiofile : $audiofile;
$fileUrl = $basePublicUrl . '/' . str_replace('%2F', '/', rawurlencode($urlPath));

json_out(200, [
    'ok' => true,
    'file' => $audiofile,
    'path' => $path,
    'url' => $fileUrl,
    'mime' => $mime,
    'bytes' => $bytes,
]);
