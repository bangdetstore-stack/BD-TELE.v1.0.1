const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * Generate QR image dari QRIS string
 * Returns path ke file PNG sementara
 */
async function generateQRImage(qrisString, filename = 'qris_temp') {
    const tmpDir = os.tmpdir();
    const filePath = path.join(tmpDir, `${filename}_${Date.now()}.png`);

    await QRCode.toFile(filePath, qrisString, {
        type: 'png',
        width: 400,
        margin: 2,
        color: {
            dark: '#1a1a2e',
            light: '#ffffff'
        }
    });

    return filePath;
}

/**
 * Generate QR sebagai Buffer (untuk langsung send ke Telegram)
 */
async function generateQRBuffer(qrisString) {
    const buffer = await QRCode.toBuffer(qrisString, {
        type: 'png',
        width: 400,
        margin: 2,
        color: {
            dark: '#1a1a2e',
            light: '#ffffff'
        }
    });
    return buffer;
}

/**
 * Hapus file QR sementara (cleanup)
 */
function deleteFile(filePath) {
    try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (e) { /* ignore */ }
}

module.exports = { generateQRImage, generateQRBuffer, deleteFile };
