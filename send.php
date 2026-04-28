<?php
// send.php — обробник форми
// Приймає POST-дані і проксює на Dr Tracker API через cURL

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    die(json_encode(['success' => false, 'message' => 'Method not allowed']));
}

// Конфіг API
define('API_URL',      'https://tracker.doctor-mailer.com/repost.php?act=register');
define('API_KEY',      'TVRjNU56aGZOelkyWHpFM09UYzRYdz09');
define('API_PASSWORD', 'DVc4pw2xlm');
define('CAMPAIGN_ID',  '22909');

// Honeypot — якщо заповнено, це бот
$hp = isset($_POST['website']) ? trim($_POST['website']) : '';
if (!empty($hp)) {
    die(json_encode(['success' => true, 'message' => 'OK']));
}

// Збираємо та чистимо дані
$firstName   = isset($_POST['fname']) ? htmlspecialchars(trim($_POST['fname']), ENT_QUOTES, 'UTF-8') : '';
$lastName    = isset($_POST['lname']) ? htmlspecialchars(trim($_POST['lname']), ENT_QUOTES, 'UTF-8') : '';
$emailAddr   = isset($_POST['email']) ? filter_var(trim($_POST['email']), FILTER_SANITIZE_EMAIL) : '';
$phoneNumber = isset($_POST['phone']) ? preg_replace('/[^\d\+\s\-()]/', '', trim($_POST['phone'])) : '';

// Серверна валідація
$errors = [];
if (empty($firstName) || mb_strlen($firstName) < 2) $errors[] = 'Invalid first name';
if (empty($lastName) || mb_strlen($lastName) < 2)    $errors[] = 'Invalid last name';
if (empty($emailAddr) || !filter_var($emailAddr, FILTER_VALIDATE_EMAIL)) $errors[] = 'Invalid email';

$digits = preg_replace('/\D/', '', $phoneNumber);
if (strlen($digits) < 7 || strlen($digits) > 15) $errors[] = 'Invalid phone';

if (!empty($errors)) {
    http_response_code(400);
    die(json_encode(['success' => false, 'message' => implode('; ', $errors)]));
}

// Збираємо параметри для API
$postData = [
    'ApiKey'      => API_KEY,
    'ApiPassword' => API_PASSWORD,
    'CampaignID'  => CAMPAIGN_ID,
    'FirstName'   => $firstName,
    'LastName'    => $lastName,
    'Email'       => $emailAddr,
    'PhoneNumber' => $phoneNumber,
    'Language'    => 'es',
    'IP'          => $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0',
    'Page'        => $_SERVER['HTTP_REFERER'] ?? '',
    'Description' => 'Lead from landing page',
    'Note'        => '',
    'SubSource'   => 'landing_form',
];

// Відправляємо через cURL
$ch = curl_init(API_URL);
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => http_build_query($postData),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 30,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/x-www-form-urlencoded',
        'Accept: application/json',
    ],
]);

$response  = curl_exec($ch);
$curlError = curl_error($ch);
curl_close($ch);

if ($curlError) {
    error_log('Dr Tracker cURL error: ' . $curlError);
    http_response_code(500);
    die(json_encode(['success' => false, 'message' => 'Error de conexión. Inténtalo más tarde.']));
}

$result = json_decode($response, true);

if (!$result || !isset($result['ret_code'])) {
    // Check if we got HTML instead of JSON (wrong API URL)
    if (stripos($response, '<html') !== false || stripos($response, '<!DOCTYPE') !== false) {
        error_log('Dr Tracker returned HTML instead of JSON. Check API_URL is correct. Response: ' . substr($response, 0, 200));
    } else {
        error_log('Dr Tracker bad response: ' . substr($response, 0, 500));
    }
    http_response_code(502);
    die(json_encode(['success' => false, 'message' => 'Error inesperado. Inténtalo más tarde.']));
}

$code = (int)$result['ret_code'];

// Успіх
if ($code === 200 || $code === 201) {
    $out = ['success' => true, 'message' => 'OK'];
    if (!empty($result['url'])) $out['redirect_url'] = $result['url'];
    echo json_encode($out);
    exit;
}

// Дублікат email
if ($code === 409) {
    die(json_encode(['success' => false, 'message' => 'Este correo electrónico ya está registrado.']));
}

// Інші помилки — перекладаємо
$apiMsg = $result['ret_message'] ?? '';
$msg = 'Error al procesar la solicitud. Inténtalo de nuevo.';

if (stripos($apiMsg, 'Invalid Phone') !== false)  $msg = 'El número de teléfono no es válido.';
if (stripos($apiMsg, 'Invalid Email') !== false)   $msg = 'El correo electrónico no es válido.';
if (stripos($apiMsg, 'No brand found') !== false)  $msg = 'Problema temporal. Inténtalo más tarde.';

error_log('Dr Tracker error: ' . $apiMsg);
echo json_encode(['success' => false, 'message' => $msg]);
