const express = require('express');
const router = express.Router();
const { Resend } = require('resend');

router.get('/test', (req, res) => {
  res.json({
    configured: !!process.env.RESEND_API_KEY,
    keyPrefix: process.env.RESEND_API_KEY?.slice(0, 8) ?? 'absent'
  });
});

router.post('/', async (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !message) return res.status(400).json({ error: 'Champs manquants' });

  if (!process.env.RESEND_API_KEY) {
    return res.status(503).json({ error: 'Email non configuré' });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    const { error } = await resend.emails.send({
      from: 'Atlas Coach <onboarding@resend.dev>',
      to: 'amalaquierpro@gmail.com',
      reply_to: email || undefined,
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

    if (error) {
      console.error('Resend error:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Contact error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
