// Public, unauthenticated: hosted landing pages for experiments. Visits, signups, survey answers and
// pricing-tier clicks become experiment_events that the Experiment Analyst later reads.
import express, { Router } from 'express'
import { db } from '../db.js'

const r = Router()
r.use(express.urlencoded({ extended: false, limit: '20kb' }))

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/

async function find(slug) {
  return (await db.list('experiments', { slug: String(slug) }, { limit: 1 }))[0]
}
const track = (e, type, payload = {}) => db.insert('experiment_events', { user_id: e.user_id, experiment_id: e.id, type, payload })

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=Instrument+Serif&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0}body{font-family:'Instrument Sans',system-ui,sans-serif;color:#1f1f1f;background:#fcfcfc;line-height:1.55}
.wrap{max-width:1040px;margin:0 auto;padding:0 20px}.hero{position:relative;text-align:center;padding:120px 0 90px;overflow:hidden}
.hero:before{content:'';position:absolute;inset:-40% -20% 20%;background:radial-gradient(50% 40% at 50% 20%,#ec8a44 0%,#f2b58a 35%,transparent 70%),radial-gradient(60% 50% at 50% 60%,#c7d2fe 0%,transparent 70%);filter:blur(30px);z-index:-1;opacity:.9}
.eyebrow{display:inline-block;color:#212191;font-size:14px;padding:8px 0;border-top:1px solid #d7d9f5;border-bottom:1px solid #d7d9f5;letter-spacing:.02em}
h1{font-family:'Instrument Serif',serif;font-weight:400;font-size:clamp(40px,7vw,68px);line-height:1.05;letter-spacing:-.02em;margin:22px auto 16px;max-width:820px}
h2{font-family:'Instrument Serif',serif;font-weight:400;font-size:38px;letter-spacing:-.01em;text-align:center;margin-bottom:28px}
.sub{font-size:18px;color:#444;max-width:620px;margin:0 auto 30px}.btn{display:inline-block;border:0;border-radius:999px;padding:11px 22px;font:500 15px 'Instrument Sans',sans-serif;cursor:pointer;text-decoration:none}
.dark{background:#2a2c33;color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.4),inset 0 -2px 0 rgba(0,0,0,.2)}.light{background:#f5f5f5;color:#1f1f1f;box-shadow:inset 0 -1px 0 rgba(0,0,0,.05)}
section{padding:70px 0}.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.card{background:#fff;border:1px solid #f0f0f0;border-radius:16px;padding:24px}.card h3{font-weight:500;font-size:18px;margin-bottom:6px}.card p{color:#666;font-size:15px}
.tier.hl{border-color:#a7c0f1;box-shadow:0 10px 40px -20px #6a88e2}.price{font-family:'Instrument Serif',serif;font-size:44px}.tier ul{padding-left:18px;color:#555;margin:14px 0 20px;font-size:14px}
.vp{font-size:22px;text-align:center;max-width:720px;margin:0 auto;color:#333}
form{display:flex;flex-direction:column;gap:10px;max-width:460px;margin:0 auto}input,textarea{font:inherit;padding:12px 16px;border:1px solid #e6e6e6;border-radius:12px;background:#fff}
details{border-bottom:1px solid #eee;padding:16px 0}summary{cursor:pointer;font-weight:500}details p{color:#555;margin-top:8px}
.wl{background:linear-gradient(#fafcff,#e8effc);border:1px solid #e8effc;border-radius:24px;padding:56px 24px;text-align:center}
footer{text-align:center;color:#999;font-size:13px;padding:40px 0}
</style></head><body>${body}</body></html>`

r.get('/p/:slug', async (req, res) => {
  const e = await find(req.params.slug)
  if (!e || !e.landing || e.status === 'draft') return res.status(404).send(page('Not found', '<div class="hero"><h1>Page not found</h1></div>'))
  if (e.status === 'running') await track(e, 'visit', { ref: String(req.get('referer') || '').slice(0, 200) })
  const L = e.landing
  res.send(page(L.seo_title || L.hero.headline, `
<div class="hero"><div class="wrap"><span class="eyebrow">${esc(L.hero.eyebrow)}</span><h1>${esc(L.hero.headline)}</h1>
<p class="sub">${esc(L.hero.subheadline)}</p><a class="btn dark" href="#waitlist">${esc(L.hero.primary_cta)}</a>
<a class="btn light" href="#features" style="margin-left:8px">${esc(L.hero.secondary_cta)}</a></div></div>
<section><div class="wrap"><p class="vp">${esc(L.value_proposition)}</p></div></section>
<section id="features"><div class="wrap"><div class="grid">${L.features.map((f) => `<div class="card"><h3>${esc(f.title)}</h3><p>${esc(f.description)}</p></div>`).join('')}</div></div></section>
<section><div class="wrap"><h2>Pricing</h2><div class="grid">${L.pricing.map((t) => `<div class="card tier${t.highlighted ? ' hl' : ''}"><h3>${esc(t.name)}</h3><p>${esc(t.description)}</p>
<div class="price">${esc(t.price)}<span style="font-size:15px;color:#888"> ${esc(t.period)}</span></div><ul>${t.features.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
<a class="btn ${t.highlighted ? 'dark' : 'light'}" href="#waitlist" onclick="fetch('/p/${esc(e.slug)}/tier',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tier:${esc(JSON.stringify(t.name))}})})">Choose ${esc(t.name)}</a></div>`).join('')}</div></div></section>
<section id="waitlist"><div class="wrap"><div class="wl"><h2 style="margin-bottom:8px">${esc(L.waitlist.headline)}</h2><p class="sub">${esc(L.waitlist.subheadline)}</p>
<form method="post" action="/p/${esc(e.slug)}/signup"><input type="email" name="email" required placeholder="you@example.com" maxlength="200">
<textarea name="answer" rows="3" maxlength="1500" placeholder="${esc(L.waitlist.survey_question)} (optional)"></textarea>
<button class="btn dark" type="submit">${esc(L.waitlist.button)}</button></form></div></div></section>
<section><div class="wrap" style="max-width:720px"><h2>FAQ</h2>${L.faqs.map((f) => `<details><summary>${esc(f.question)}</summary><p>${esc(f.answer)}</p></details>`).join('')}</div></section>
<footer>Validation experiment · built with Foundry AI</footer>`))
})

r.post('/p/:slug/signup', async (req, res) => {
  const e = await find(req.params.slug)
  if (!e || e.status !== 'running') return res.status(404).send(page('Closed', '<div class="hero"><h1>This waitlist is closed</h1></div>'))
  const email = String(req.body.email || '').trim().toLowerCase()
  if (!EMAIL.test(email)) return res.status(400).send(page('Invalid email', '<div class="hero"><h1>Please enter a valid email</h1><a class="btn dark" href="javascript:history.back()">Go back</a></div>'))
  // ponytail: dedupe scans this experiment's signups in memory; fine to a few thousand, index payload->>email beyond that.
  const signups = await db.list('experiment_events', { experiment_id: e.id, type: 'signup' }, { limit: 10000 })
  if (!signups.some((s) => s.payload.email === email)) {
    await track(e, 'signup', { email })
    const answer = String(req.body.answer || '').trim().slice(0, 1500)
    if (answer) await track(e, 'feedback', { text: answer, email })
  }
  res.send(page("You're on the list", `<div class="hero"><div class="wrap"><span class="eyebrow">Confirmed</span><h1>You're on the list.</h1>
<p class="sub">Thanks — we'll reach out as soon as early access opens.</p><a class="btn light" href="/p/${esc(e.slug)}">Back</a></div></div>`))
})

r.post('/p/:slug/tier', express.json({ limit: '2kb' }), async (req, res) => {
  const e = await find(req.params.slug)
  if (e?.status === 'running') await track(e, 'survey', { pricing_tier: String(req.body.tier || '').slice(0, 40), text: `Clicked pricing tier: ${String(req.body.tier || '').slice(0, 40)}` })
  res.json({ ok: true })
})

export default r
