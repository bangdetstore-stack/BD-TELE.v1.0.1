const axios = require('axios');
require('dotenv').config();

const BASE_URL = 'https://app.pakasir.com/api';
const PROJECT = process.env.PAKASIR_PROJECT;
const API_KEY = process.env.PAKASIR_API_KEY;

/**
 * Buat transaksi pembayaran
 * method: 'qris' | 'bri_va' | 'bni_va' | 'cimb_niaga_va' | 'permata_va' dll.
 */
async function createTransaction(orderId, amount, method = 'qris') {
    try {
        const res = await axios.post(`${BASE_URL}/transactioncreate/${method}`, {
            project: PROJECT,
            order_id: orderId,
            amount: amount,
            api_key: API_KEY
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000
        });
        return { success: true, data: res.data.payment };
    } catch (err) {
        const msg = err.response?.data?.message || err.message;
        return { success: false, error: msg };
    }
}

/**
 * Cek status transaksi
 */
async function checkTransaction(orderId, amount) {
    try {
        const res = await axios.get(`${BASE_URL}/transactiondetail`, {
            params: {
                project: PROJECT,
                order_id: orderId,
                amount: amount,
                api_key: API_KEY
            },
            timeout: 10000
        });
        return { success: true, data: res.data.transaction };
    } catch (err) {
        const msg = err.response?.data?.message || err.message;
        return { success: false, error: msg };
    }
}

/**
 * Cancel transaksi
 */
async function cancelTransaction(orderId, amount) {
    try {
        const res = await axios.post(`${BASE_URL}/transactioncancel`, {
            project: PROJECT,
            order_id: orderId,
            amount: amount,
            api_key: API_KEY
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });
        return { success: true, data: res.data };
    } catch (err) {
        const msg = err.response?.data?.message || err.message;
        return { success: false, error: msg };
    }
}

module.exports = { createTransaction, checkTransaction, cancelTransaction };
