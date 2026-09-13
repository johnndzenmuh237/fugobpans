const axios = require('axios');

/**
 * Campay (https://www.campay.net) is a Cameroon payment aggregator that
 * routes to BOTH MTN Mobile Money and Orange Money automatically based
 * on the phone number's carrier prefix — one integration satisfies the
 * "MTN + Orange Money only" requirement without two separate SDKs.
 *
 * Same integrity rule as before: a payment is NEVER marked successful
 * from the frontend's word alone. Every webhook re-verifies against
 * Campay's own status endpoint before the database is touched
 * (see paymentController.js#webhook).
 */
const BASE_URL = process.env.CAMPAY_BASE_URL || 'https://www.campay.net/api';

let cachedToken = null;
let cachedTokenExpiry = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiry) return cachedToken;
  const { data } = await axios.post(`${BASE_URL}/token/`, {
    username: process.env.CAMPAY_USERNAME,
    password: process.env.CAMPAY_PASSWORD,
  });
  cachedToken = data.token;
  cachedTokenExpiry = now + 50 * 60 * 1000;
  return cachedToken;
}

async function initiateCollection({ amount, phone, externalReference, description }) {
  const token = await getAccessToken();
  const { data } = await axios.post(
    `${BASE_URL}/collect/`,
    { amount: String(Math.round(amount)), currency: 'XAF', from: phone, description, external_reference: externalReference },
    { headers: { Authorization: `Token ${token}` } }
  );
  return { providerReference: data.reference, raw: data };
}

async function checkTransactionStatus(providerReference) {
  const token = await getAccessToken();
  const { data } = await axios.get(`${BASE_URL}/transaction/status/${providerReference}/`, {
    headers: { Authorization: `Token ${token}` },
  });
  return {
    status: (data.status || '').toUpperCase(), // PENDING | SUCCESSFUL | FAILED
    amount: Number(data.amount),
    reference: data.reference,
    externalReference: data.external_reference,
    operator: (data.operator || '').toUpperCase(), // MTN | ORANGE
    raw: data,
  };
}

/** Maps Campay's operator field to our payment_method enum. */
function mapMethod(operator) {
  if ((operator || '').includes('ORANGE')) return 'ORANGE_MONEY';
  return 'MTN_MOMO';
}

module.exports = { initiateCollection, checkTransactionStatus, mapMethod };
