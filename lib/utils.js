/**
 * Format angka ke Rupiah
 */
function formatRupiah(amount) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

/**
 * Generate Order ID unik
 */
function generateOrderId(prefix = 'ORD') {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `${prefix}-${date}-${random}`;
}

/**
 * Format tanggal ke WIB - Menggunakan format yang aman dari escaping
 */
function formatDate(isoString) {
    if (!isoString) return '-';
    const date = new Date(isoString);
    const d = date.toLocaleDateString('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });
    const t = date.toLocaleTimeString('id-ID', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).replace('.', ':'); // pastikan pakai : bukan .
    return `${d} pukul ${t} WIB`;
}


/**
 * Format durasi expired countdown
 */
function formatCountdown(expiredAt) {
    const now = new Date();
    const exp = new Date(expiredAt);
    const diff = exp - now;
    if (diff <= 0) return 'Sudah Expired';
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
}

/**
 * Emoji status order
 */
function statusEmoji(status) {
    const map = {
        pending: '⏳',
        paid: '✅',
        completed: '✅',
        cancelled: '❌',
        failed: '❌',
        processing: '🔄'
    };
    return map[status] || '❓';
}

/**
 * Nama metode pembayaran
 */
function methodName(method) {
    const map = {
        qris: 'QRIS',
        bri_va: 'BRI Virtual Account',
        bni_va: 'BNI Virtual Account',
        cimb_niaga_va: 'CIMB Niaga VA',
        permata_va: 'Permata VA',
        maybank_va: 'Maybank VA',
        bnc_va: 'BNC VA',
        saldo: 'Saldo'
    };
    return map[method] || method;
}

/**
 * Truncate text
 */
function truncate(str, max = 30) {
    if (!str) return '';
    return str.length > max ? str.substring(0, max) + '...' : str;
}

/**
 * Escape karakter Markdown untuk Telegram
 */
function escMd(text) {
    if (!text) return '';
    return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

module.exports = {
    formatRupiah,
    generateOrderId,
    formatDate,
    formatCountdown,
    statusEmoji,
    methodName,
    truncate,
    escMd
};
