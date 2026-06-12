import nodemailer from 'npm:nodemailer@6'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { email, name } = await req.json()
    if (!email) {
      return new Response(JSON.stringify({ error: 'email required' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const transporter = nodemailer.createTransport({
      host: Deno.env.get('SMTP_HOST'),
      port: Number(Deno.env.get('SMTP_PORT') ?? 587),
      secure: false,
      auth: {
        user: Deno.env.get('SMTP_USER'),
        pass: Deno.env.get('SMTP_PASS'),
      },
    })

    const firstName = name?.trim().split(' ')[0] || null
    const greeting = firstName ? `Hoi ${firstName},` : 'Hoi,'

    await transporter.sendMail({
      from: '"HupheAI" <hallo@hupheai.app>',
      to: email,
      subject: 'Aanvraag ontvangen — HupheAI',
      html: `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Aanvraag ontvangen</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    We hebben je aanvraag ontvangen en nemen zo snel mogelijk contact op.
  </div>
  <main style="width:100%;background:#0a0a0a;padding:32px 16px;">
    <section style="max-width:600px;margin:0 auto;background:#141414;border:1px solid rgba(255,255,255,0.07);border-radius:20px;overflow:hidden;">
      <div style="padding:28px 28px 18px 28px;border-bottom:1px solid rgba(255,255,255,0.07);">
        <div style="display:inline-block;width:34px;height:34px;line-height:34px;text-align:center;background:#facc15;color:#000;border-radius:12px;font-weight:700;font-size:15px;">
          H
        </div>
        <h1 style="margin:18px 0 0 0;color:#fff;font-size:22px;line-height:1.25;font-weight:700;">
          Aanvraag ontvangen
        </h1>
      </div>
      <div style="padding:28px;">
        <p style="margin:0 0 16px 0;color:rgba(255,255,255,0.78);font-size:15px;line-height:1.6;">
          ${greeting}
        </p>
        <p style="margin:0 0 16px 0;color:rgba(255,255,255,0.78);font-size:15px;line-height:1.6;">
          We hebben je aanvraag voor de HupheAI beta ontvangen.
          We bekijken alle aanvragen handmatig en sturen je een uitnodiging zodra je aan de beurt bent.
        </p>
        <p style="margin:0;color:rgba(255,255,255,0.72);font-size:15px;line-height:1.6;">
          Groet,<br>
          Tom<br>
          HupheAI
        </p>
      </div>
      <div style="padding:18px 28px 28px 28px;">
        <p style="margin:0;color:rgba(255,255,255,0.25);font-size:12px;line-height:1.5;">
          Je ontvangt deze mail omdat je een aanvraag hebt ingediend via de HupheAI app.
        </p>
      </div>
    </section>
  </main>
</body>
</html>`,
    })

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('notify-join-request error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
