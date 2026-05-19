const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');

function getTransporter() {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: 'amalaquierpro@gmail.com',
      pass: process.env.GMAIL_APP_PASSWORD
    },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000
  });
}

// Route de diagnostic (à supprimer après confirmation)
router.get('/test', (req, res) => {
  res.json({
    configured: !!process.env.GMAIL_APP_PASSWORD,
    passLength: process.env.GMAIL_APP_PASSWORD?.replace(/\s/g,'').length ?? 0
  });
});

router.post('/', async (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !message) return res.status(400).json({ error: 'Champs manquants' });

  if (!process.env.GMAIL_APP_PASSWORD) {
    console.warn('GMAIL_APP_PASSWORD non configuré');
    return res.status(503).json({ error: 'Email non configuré' });
  }

  try {
    await getTransporter().sendMail({
      from: '"Atlas Coach" <amalaquierpro@gmail.com>',
      to: 'amalaquierpro@gmail.com',
      replyTo: email || undefined,
      subject: `Demande de coaching — ${name}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;color:#111;">
          <h2 style="color:#ff7a00;margin-bottom:4px;">Nouvelle demande de coaching</h2>
          <p style="color:#888;font-size:13px;margin-top:0;">Via le formulaire Atlas Coach</p>
          <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">
          <p><strong>Nom :</strong> ${name}</p>
          <p><strong>Email :</strong> ${email || '<em>non renseigné</em>'}</p>
          <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">
          <p><strong>Message :</strong></p>
          <p style="background:#f9f9f9;padding:14px;border-radius:8px;line-height:1.6;">
            ${message.replace(/\n/g, '<br>')}
          </p>
        </div>
      `
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('Contact mail error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
