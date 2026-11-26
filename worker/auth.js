// Password gate for the Workers deployment. The password lives in the SITE_PASSWORD secret
// (`npx wrangler secret put SITE_PASSWORD`); without it the site is locked for everyone.
// A correct password sets a long-lived HttpOnly cookie holding an HMAC derived from the password,
// so changing the secret signs everyone out.

const COOKIE = 'site_auth';
const MAX_AGE = 60 * 60 * 24 * 365; // one year
const enc = new TextEncoder();

async function sessionToken(password) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('site-session-v1'));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Compares digests of both values, so timing reveals nothing about the secret.
async function safeEqual(a, b) {
  const [da, db] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  return crypto.subtle.timingSafeEqual(da, db);
}

function readCookie(request, name) {
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return '';
}

function loginPage(error = '', status = 200) {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Instagram 2.0 — Sign in</title>
<style>
  :root { color-scheme: light dark; --bg:#fafafa; --card:#fff; --text:#111; --muted:#666; --border:#dbdbdb; --err:#d33; }
  @media (prefers-color-scheme: dark) { :root { --bg:#000; --card:#121212; --text:#f5f5f5; --muted:#a8a8a8; --border:#363636; --err:#ff6b6b; } }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; padding:16px; background:var(--bg); color:var(--text);
         font: 15px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  form { width:100%; max-width:340px; background:var(--card); border:1px solid var(--border); border-radius:12px; padding:32px 24px; }
  h1 { margin:0 0 24px; text-align:center; font-size:28px; font-weight:700;
       background:linear-gradient(90deg,#c13584,#833ab4); -webkit-background-clip:text; background-clip:text; color:transparent; }
  input { width:100%; padding:11px 12px; font-size:16px; border:1px solid var(--border); border-radius:8px; background:transparent; color:inherit; }
  button { width:100%; margin-top:12px; padding:10px; font-size:15px; font-weight:600; border:0; border-radius:8px; background:#0095f6; color:#fff; cursor:pointer; }
  p { margin:12px 0 0; text-align:center; color:var(--err); font-size:14px; }
</style></head>
<body><form method="post" action="/__login">
  <h1>Instagram 2.0</h1>
  <input type="password" name="password" placeholder="Password" autocomplete="current-password" autofocus required aria-label="Password">
  <button type="submit">Sign in</button>
  ${error ? `<p role="alert">${error}</p>` : ''}
</form></body></html>`;
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
  });
}

/** Returns a Response to send instead of the app, or null when the request is signed in. */
export async function gate(request, env) {
  const url = new URL(request.url);
  const password = env.SITE_PASSWORD;
  if (!password) return new Response('Site locked: SITE_PASSWORD is not configured.', { status: 503 });
  const expected = await sessionToken(password);

  if (url.pathname === '/__login' && request.method === 'POST') {
    const form = await request.formData().catch(() => null);
    const given = String(form?.get('password') ?? '');
    if (!(await safeEqual(given, password))) return loginPage('Incorrect password.', 401);
    return new Response(null, {
      status: 303,
      headers: {
        location: '/',
        'set-cookie': `${COOKIE}=${expected}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
        'cache-control': 'no-store',
      },
    });
  }

  if (url.pathname === '/__logout') {
    return new Response(null, {
      status: 303,
      headers: { location: '/', 'set-cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` },
    });
  }

  if (await safeEqual(readCookie(request, COOKIE), expected)) return null;
  if (url.pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401, headers: { 'content-type': 'application/json' } });
  }
  return loginPage();
}
