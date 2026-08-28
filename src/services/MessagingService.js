const axios = require('axios');

const EVENT_NAME = 'INDIAMET 2027';

function isConfigured() {
  return Boolean(
    process.env.FAST2SMS_API_KEY ||
    process.env.TWILIO_ACCOUNT_SID ||
    process.env.WHATSAPP_TOKEN ||
    process.env.MSG91_AUTH_KEY
  );
}

function formatPhone(countryCode, phone) {
  const cc = String(countryCode || '+91').replace(/\D/g, '') || '91';
  let local = String(phone || '').replace(/\D/g, '');
  if (local.startsWith(cc)) local = local.slice(cc.length);
  if (local.startsWith('0')) local = local.slice(1);
  return {
    countryCode: `+${cc}`,
    local,
    e164: `+${cc}${local}`,
    digits: `${cc}${local}`
  };
}

async function sendViaTwilio({ toE164, body, channel }) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return false;

  const from = channel === 'whatsapp'
    ? (process.env.TWILIO_WHATSAPP_FROM || process.env.TWILIO_PHONE_NUMBER)
    : process.env.TWILIO_PHONE_NUMBER;
  if (!from) return false;

  const params = new URLSearchParams({
    To: channel === 'whatsapp' ? `whatsapp:${toE164}` : toE164,
    From: channel === 'whatsapp' ? `whatsapp:${from}` : from,
    Body: body
  });

  await axios.post(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    params,
    { auth: { username: sid, password: token }, timeout: 15000 }
  );
  return true;
}

async function sendViaFast2Sms({ local, body }) {
  const key = process.env.FAST2SMS_API_KEY;
  if (!key) return false;

  await axios.get('https://www.fast2sms.com/dev/bulkV2', {
    params: {
      authorization: key,
      route: 'q',
      message: body,
      language: 'english',
      flash: 0,
      numbers: local
    },
    timeout: 15000
  });
  return true;
}

async function sendViaMsg91({ digits, body }) {
  const authkey = process.env.MSG91_AUTH_KEY;
  if (!authkey) return false;

  await axios.post(
    'https://control.msg91.com/api/v5/flow/',
    {
      template_id: process.env.MSG91_TEMPLATE_ID,
      short_url: '0',
      recipients: [{ mobiles: digits, VAR1: body }]
    },
    {
      headers: { authkey, 'Content-Type': 'application/json' },
      timeout: 15000
    }
  );
  return true;
}

async function sendViaWhatsAppCloud({ e164, body }) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return false;

  await axios.post(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      to: e164.replace('+', ''),
      type: 'text',
      text: { preview_url: true, body }
    },
    {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 15000
    }
  );
  return true;
}

async function dispatch({ phone, countryCode, channel, body }) {
  const formatted = formatPhone(countryCode, phone);
  const errors = [];

  if (channel === 'whatsapp') {
    try {
      if (await sendViaWhatsAppCloud({ e164: formatted.e164, body })) return { delivered: true, provider: 'whatsapp-cloud' };
    } catch (error) {
      errors.push(`whatsapp-cloud: ${error.message}`);
    }
    try {
      if (await sendViaTwilio({ toE164: formatted.e164, body, channel: 'whatsapp' })) return { delivered: true, provider: 'twilio-whatsapp' };
    } catch (error) {
      errors.push(`twilio-whatsapp: ${error.message}`);
    }
  }

  try {
    if (await sendViaTwilio({ toE164: formatted.e164, body, channel: 'sms' })) return { delivered: true, provider: 'twilio-sms' };
  } catch (error) {
    errors.push(`twilio-sms: ${error.message}`);
  }
  try {
    if (await sendViaFast2Sms({ local: formatted.local, body })) return { delivered: true, provider: 'fast2sms' };
  } catch (error) {
    errors.push(`fast2sms: ${error.message}`);
  }
  try {
    if (await sendViaMsg91({ digits: formatted.digits, body })) return { delivered: true, provider: 'msg91' };
  } catch (error) {
    errors.push(`msg91: ${error.message}`);
  }

  if (!isConfigured()) {
    console.log(`📱 [DEV ${channel.toUpperCase()}] ${formatted.e164}\n${body}`);
    return { delivered: false, provider: 'console', queued: true };
  }

  const detail = errors.join('; ') || 'No messaging provider accepted the request';
  console.error('Messaging dispatch failed:', detail);
  return { delivered: false, provider: 'none', error: detail };
}

class MessagingService {
  formatPhone = formatPhone;

  otpMessage(otp, channel) {
    return `${EVENT_NAME} verification code: ${otp}. Valid for 10 minutes. Do not share this code.`;
  }

  passMessage({ name, registrationNumber, passUrl, channel }) {
    const greeting = name ? `Hi ${name},` : 'Hi,';
    if (channel === 'whatsapp') {
      return `${greeting} your ${EVENT_NAME} visitor pass is ready.\n\nPass ID: ${registrationNumber}\nShow this QR badge at entry:\n${passUrl}\n\n23–25 April 2027 • Auto Cluster Exhibition Centre, Pune`;
    }
    return `${EVENT_NAME} visitor pass ${registrationNumber}. Show at entry: ${passUrl}`;
  }

  async sendOtp({ phone, countryCode, channel, otp }) {
    return dispatch({
      phone,
      countryCode,
      channel,
      body: this.otpMessage(otp, channel)
    });
  }

  async sendPass({ phone, countryCode, channel, name, registrationNumber, passUrl }) {
    return dispatch({
      phone,
      countryCode,
      channel,
      body: this.passMessage({ name, registrationNumber, passUrl, channel })
    });
  }
}

module.exports = new MessagingService();
