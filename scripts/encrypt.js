function xorEncrypt(text, key) {
    let output = '';
    for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i) ^ key.charCodeAt(i % key.length);
        output += String.fromCharCode(charCode);
    }
    // Конвертируем в base64, чтобы избежать проблем с кодировкой и непечатаемыми символами
    return Buffer.from(output).toString('base64');
}

// Простой метод для декодирования base64 и дешифрования
function xorDecrypt(encodedText, key) {
    const decodedText = Buffer.from(encodedText, 'base64').toString('utf8');
    let output = '';
    for (let i = 0; i < decodedText.length; i++) {
        const charCode = decodedText.charCodeAt(i) ^ key.charCodeAt(i % key.length);
        output += String.fromCharCode(charCode);
    }
    return output;
}

const text = process.argv[2]; // Текст для шифрования
const cipherKey = process.argv[3]; // Ключ шифрования (кодовая фраза) как второй аргумент

if (!text || !cipherKey) {
    console.error('Usage: node encrypt.js "<TEXT>" "<YOUR_CIPHER_KEY>"');
    process.exit(1);
}

const encryptedTextBase64 = xorEncrypt(text, cipherKey);
console.log('Encrypted Text (Base64):', encryptedTextBase64);

// Для проверки:
// const decryptedText = xorDecrypt(encryptedTextBase64, cipherKey);
// console.log('Decrypted Text (for verification):', decryptedText);
// if (decryptedText === text) {
//     console.log('Decryption successful!');
// } else {
//     console.error('Decryption failed!');
// }
