<?php
declare(strict_types=1);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header('Content-Type: application/json; charset=utf-8');

function out(int $status, array $data): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES);
    exit;
}

$path = (string)($_GET['path'] ?? '');
$path = str_replace('\\', '/', trim($path));
$path = trim($path, '/');

if ($path === '') {
    out(400, ['ok' => false, 'error' => 'Missing path']);
}

$parts = array_filter(explode('/', $path), fn($p) => $p !== '' && $p !== '.' && $p !== '..');
foreach ($parts as $p) {
    if (!preg_match('/^[A-Za-z0-9._-]+$/', $p)) {
        out(400, ['ok' => false, 'error' => 'Invalid path segment']);
    }
}

$safeRel = implode('/', $parts);
$fullPath = rtrim($_SERVER['DOCUMENT_ROOT'] ?? '', '/') . '/braillestudio/' . $safeRel;
$exists = is_file($fullPath);

out(200, [
    'ok' => true,
    'exists' => $exists,
    'path' => '/' . $safeRel,
    'url' => 'https://www.tastenbraille.com/braillestudio/' . str_replace('%2F', '/', rawurlencode($safeRel)),
]);
