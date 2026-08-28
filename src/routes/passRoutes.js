const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const messagingService = require('../services/MessagingService');

const router = express.Router();
const otpStore = new Map();
const sendLog = new Map();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_GAP_MS = 45 * 1000;

const EVENT = {
  name: 'INDIAMET 2027',
  dates: '23–25 April 2027',
  venue: 'Auto Cluster Exhibition Centre, Pune, India'
};

function generateOtp() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function siteUrlFrom(req) {
  return (
    req.get('origin') ||
    process.env.PUBLIC_SITE_URL ||
    process.env.FRONTEND_URL ||
    'http://localhost:3001'
  ).replace(/\/$/, '');
}

function signVerification(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '45m' });
}

function readVerification(token) {
  return jwt.verify(token, JWT_SECRET);
}

async function getPassModel() {
  const modelFactory = require('../models');
  try {
    return modelFactory.getModel('VisitorPass');
  } catch (error) {
    await modelFactory.init();
    return modelFactory.getModel('VisitorPass');
  }
}

async function ensurePassTable(Pass) {
  try {
    await Pass.sync();
  } catch (error) {
    console.warn('VisitorPass sync warning:', error.message);
    const sequelize = require('../config/database').getConnection('mysql');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS visitor_passes (
        id UUID PRIMARY KEY,
        "registrationNumber" VARCHAR(50) UNIQUE NOT NULL,
        "qrToken" VARCHAR(64) UNIQUE NOT NULL,
        phone VARCHAR(20) NOT NULL,
        "countryCode" VARCHAR(8) DEFAULT '+91',
        channel VARCHAR(20) NOT NULL,
        name VARCHAR(255),
        company VARCHAR(255),
        "pinCode" VARCHAR(20),
        area VARCHAR(255),
        city VARCHAR(100),
        state VARCHAR(100),
        country VARCHAR(100) DEFAULT 'India',
        source VARCHAR(255),
        interests JSONB,
        status VARCHAR(30) DEFAULT 'verified',
        "passSentAt" TIMESTAMP,
        "verifiedAt" TIMESTAMP,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }
}

function serializePass(pass, siteUrl) {
  const json = pass.toJSON ? pass.toJSON() : pass;
  return {
    id: json.id,
    registrationNumber: json.registrationNumber,
    qrToken: json.qrToken,
    phone: json.phone,
    countryCode: json.countryCode,
    channel: json.channel,
    name: json.name,
    company: json.company,
    pinCode: json.pinCode,
    area: json.area,
    city: json.city,
    state: json.state,
    country: json.country,
    source: json.source,
    interests: json.interests || [],
    status: json.status,
    passUrl: `${siteUrl}/passes/badge/${json.qrToken}`,
    event: EVENT
  };
}

function canSend(phone) {
  const now = Date.now();
  const record = sendLog.get(phone) || { count: 0, lastSent: 0, windowStart: now };
  if (now - record.windowStart > 60 * 60 * 1000) {
    record.count = 0;
    record.windowStart = now;
  }
  if (now - record.lastSent < RESEND_GAP_MS) {
    return { ok: false, error: 'Please wait before requesting another OTP' };
  }
  if (record.count >= 8) {
    return { ok: false, error: 'Too many OTP requests. Try again later.' };
  }
  sendLog.set(phone, record);
  return { ok: true, record };
}

router.post('/send-otp', sendOtp);
router.post('/resend-otp', sendOtp);

async function sendOtp(req, res) {
  try {
    const channel = String(req.body.channel || 'whatsapp').toLowerCase() === 'sms' ? 'sms' : 'whatsapp';
    const countryCode = req.body.countryCode || '+91';
    const formatted = messagingService.formatPhone(countryCode, req.body.phone);

    if (formatted.local.length < 8 || formatted.local.length > 15) {
      return res.status(400).json({ success: false, error: 'Enter a valid mobile number' });
    }
    if (formatted.countryCode === '+91' && !/^[6-9]\d{9}$/.test(formatted.local)) {
      return res.status(400).json({ success: false, error: 'Enter a valid 10-digit Indian mobile number' });
    }

    const gate = canSend(formatted.e164);
    if (!gate.ok) {
      return res.status(429).json({ success: false, error: gate.error });
    }

    const otp = generateOtp();
    otpStore.set(formatted.e164, {
      otp,
      channel,
      countryCode: formatted.countryCode,
      phone: formatted.local,
      expiresAt: Date.now() + OTP_TTL_MS
    });

    const delivery = await messagingService.sendOtp({
      phone: formatted.local,
      countryCode: formatted.countryCode,
      channel,
      otp
    });

    gate.record.count += 1;
    gate.record.lastSent = Date.now();
    sendLog.set(formatted.e164, gate.record);

    const payload = {
      success: true,
      message: `OTP sent via ${channel === 'sms' ? 'SMS' : 'WhatsApp'}`,
      expiresIn: 600,
      phone: formatted.e164,
      channel,
      delivered: Boolean(delivery.delivered)
    };

    if (process.env.NODE_ENV !== 'production') {
      payload.devOtp = otp;
    }

    res.json(payload);
  } catch (error) {
    console.error('Send pass OTP error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to send OTP' });
  }
}

router.post('/verify-otp', async (req, res) => {
  try {
    const otp = String(req.body.otp || '').trim();
    const formatted = messagingService.formatPhone(req.body.countryCode, req.body.phone);
    const stored = otpStore.get(formatted.e164);

    if (!/^\d{4}$/.test(otp)) {
      return res.status(400).json({ success: false, error: 'Enter the 4-digit OTP' });
    }
    if (!stored) {
      return res.status(400).json({ success: false, error: 'No OTP found. Please request a new code.' });
    }
    if (stored.expiresAt < Date.now()) {
      otpStore.delete(formatted.e164);
      return res.status(400).json({ success: false, error: 'OTP has expired. Please request a new code.' });
    }
    if (stored.otp !== otp) {
      return res.status(400).json({ success: false, error: 'Invalid OTP. Please try again.' });
    }

    otpStore.delete(formatted.e164);
    const verificationToken = signVerification({
      phone: formatted.local,
      countryCode: formatted.countryCode,
      e164: formatted.e164,
      channel: stored.channel,
      verified: true
    });

    res.json({
      success: true,
      message: 'Phone number verified',
      data: {
        verificationToken,
        phone: formatted.e164,
        countryCode: formatted.countryCode,
        channel: stored.channel
      }
    });
  } catch (error) {
    console.error('Verify pass OTP error:', error);
    res.status(500).json({ success: false, error: 'Failed to verify OTP' });
  }
});

router.post('/register', async (req, res) => {
  try {
    const {
      verificationToken,
      name,
      company,
      pinCode,
      area,
      city,
      state,
      country = 'India',
      source,
      interests = []
    } = req.body;

    if (!verificationToken) {
      return res.status(401).json({ success: false, error: 'Please verify your mobile number first' });
    }

    let verified;
    try {
      verified = readVerification(verificationToken);
    } catch {
      return res.status(401).json({ success: false, error: 'Verification expired. Please verify your number again.' });
    }

    if (!verified?.verified || !verified.phone) {
      return res.status(401).json({ success: false, error: 'Please verify your mobile number first' });
    }
    if (!name || !company || !pinCode || !city || !state || !source) {
      return res.status(400).json({ success: false, error: 'Please fill in all required fields' });
    }
    if (!Array.isArray(interests) || interests.length < 1) {
      return res.status(400).json({ success: false, error: 'Select at least one interest' });
    }

    const Pass = await getPassModel();
    await ensurePassTable(Pass);

    const existing = await Pass.findOne({ where: { phone: verified.e164 || verified.phone } });
    const now = new Date();
    const stamp = now.toISOString().slice(0, 10).replace(/-/g, '');
    const count = await Pass.count();
    const registrationNumber = existing?.registrationNumber
      || `REG-IM-${stamp}-${String(count + 1).padStart(6, '0')}`;
    const qrToken = existing?.qrToken || crypto.randomBytes(16).toString('hex');
    const siteUrl = siteUrlFrom(req);

    const payload = {
      registrationNumber,
      qrToken,
      phone: verified.e164 || verified.phone,
      countryCode: verified.countryCode,
      channel: verified.channel,
      name: String(name).trim(),
      company: String(company).trim(),
      pinCode: String(pinCode).trim(),
      area: area || null,
      city: String(city).trim(),
      state: String(state).trim(),
      country,
      source,
      interests,
      status: 'registered',
      verifiedAt: now
    };

    const pass = existing
      ? await existing.update(payload)
      : await Pass.create({ id: crypto.randomUUID(), ...payload });

    const serialized = serializePass(pass, siteUrl);
    const delivery = await messagingService.sendPass({
      phone: verified.phone,
      countryCode: verified.countryCode,
      channel: verified.channel,
      name: payload.name,
      registrationNumber: serialized.registrationNumber,
      passUrl: serialized.passUrl
    });

    if (delivery.delivered || delivery.queued) {
      await pass.update({ passSentAt: new Date() });
    }

    res.json({
      success: true,
      message: delivery.delivered
        ? `Visitor pass sent via ${verified.channel === 'sms' ? 'SMS' : 'WhatsApp'}`
        : 'Visitor pass created. Delivery is queued from the server.',
      data: {
        ...serialized,
        delivered: Boolean(delivery.delivered),
        channel: verified.channel
      }
    });
  } catch (error) {
    console.error('Register visitor pass error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to complete registration' });
  }
});

router.get('/badge/:token', async (req, res) => {
  try {
    const Pass = await getPassModel();
    await ensurePassTable(Pass);
    const pass = await Pass.findOne({ where: { qrToken: req.params.token } });
    if (!pass) {
      return res.status(404).json({ success: false, error: 'Visitor pass not found' });
    }
    res.json({ success: true, data: serializePass(pass, siteUrlFrom(req)) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
