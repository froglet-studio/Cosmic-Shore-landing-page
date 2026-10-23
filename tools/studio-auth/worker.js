/**
 * "Sign in with GitHub" for Froglet Studio (www.froglet.games/admin/): a Cloudflare Worker that turns a
 * GitHub sign-in into a token and sends the developer back to the Studio with it. It stores nothing.
 *
 * It uses a GitHub App (not an OAuth App), so the token can only do what the App may do: read and
 * write the files of the one repository it is installed on (the website), for the signed-in person.
 * Setup: README.md in this folder.
 *
 * Environment (Worker > Settings > Variables and Secrets):
 *   GITHUB_CLIENT_ID      the GitHub App's Client ID
 *   GITHUB_CLIENT_SECRET  a client secret of the App (add it as a Secret, not plain text)
 *   ALLOWED_ORIGIN        the sites the Studio runs on, comma-separated. A leading "*." allows any
 *                         subdomain, for branch previews, e.g.:
 *                         https://www.froglet.games,https://*.cosmic-shore-landing-page.pages.dev
 *
 *   GET /auth?return=<Studio URL> -> remember where to return (only an allowed site) and a one-time
 *                                    state in a cookie, then go to GitHub's sign-in
 *   GET /callback                 -> check the state, swap the code for a token, and go back to the
 *                                    Studio with the token in the URL fragment (#studio_token=…),
 *                                    which browsers never send to any server
 *   GET /check                    -> whether each setting is present and looks right (never a value
 *                                    of the secret), for fixing a setup
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/auth') return start(url, env);
    if (url.pathname === '/callback') return finish(request, url, env);
    if (url.pathname === '/check') return check(url, env);
    return new Response('Froglet Studio sign-in', { status: 404 });
  },
};

const COOKIE = 'studio_signin';

// Settings pasted into the dashboard often carry a stray space or line break; GitHub then refuses them.
const clientId = (env) => String(env.GITHUB_CLIENT_ID || '').trim();
const clientSecret = (env) => String(env.GITHUB_CLIENT_SECRET || '').trim();

function check(url, env) {
  const id = clientId(env), secret = clientSecret(env);
  const report = {
    worker: 'froglet-studio-auth',
    callback_url_to_use_in_the_github_app: url.origin + '/callback',
    client_id_set: !!id,
    client_id: id,
    client_id_had_extra_spaces: !!env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_ID !== id,
    client_id_looks_like_a_github_app: /^Iv[0-9a-z]{2}[A-Za-z0-9]{14,}$/.test(id),
    client_secret_set: !!secret,
    client_secret_had_extra_spaces: !!env.GITHUB_CLIENT_SECRET && env.GITHUB_CLIENT_SECRET !== secret,
    client_secret_looks_right: /^[0-9a-f]{40}$/.test(secret),
    allowed_origin: String(env.ALLOWED_ORIGIN || ''),
  };
  return new Response(JSON.stringify(report, null, 2), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

function allowedReturn(value, env) {
  let u;
  try { u = new URL(value); } catch (e) { return null; }
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  const allowed = String(env.ALLOWED_ORIGIN || 'https://www.froglet.games').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = allowed.some((a) => {
    if (a.startsWith('https://*.')) return u.hostname.endsWith('.' + a.slice('https://*.'.length));
    return u.origin === a.replace(/\/$/, '');
  });
  if (!ok) return null;
  u.hash = '';
  return u.toString();
}

function start(url, env) {
  const back = allowedReturn(url.searchParams.get('return') || '', env);
  if (!back) return page('This sign-in link isn’t from a Froglet site. Open the Studio and try again.', 400);
  const state = crypto.randomUUID();
  const gh = new URL('https://github.com/login/oauth/authorize');
  gh.searchParams.set('client_id', clientId(env));
  gh.searchParams.set('redirect_uri', url.origin + '/callback');
  gh.searchParams.set('state', state);
  return new Response(null, {
    status: 302,
    headers: {
      Location: gh.toString(),
      'Set-Cookie': `${COOKIE}=${state}.${encodeURIComponent(back)}; Path=/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      'Cache-Control': 'no-store',
    },
  });
}

async function finish(request, url, env) {
  const raw = ((request.headers.get('Cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`)) || [])[1] || '';
  const dot = raw.indexOf('.');
  const saved = dot > 0 ? raw.slice(0, dot) : '';
  const back = dot > 0 ? allowedReturn(decodeURIComponent(raw.slice(dot + 1)), env) : null;
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!back) return page('This sign-in expired. Open the Studio and press Sign in with GitHub again.', 400);
  if (!code || !state || state !== saved) return returnTo(back, 'studio_error', 'Sign-in didn’t complete. Please try again.');

  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'froglet-studio-auth' },
    body: JSON.stringify({
      client_id: clientId(env),
      client_secret: clientSecret(env),
      code,
      redirect_uri: url.origin + '/callback',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.access_token) {
    const why = data.error === 'incorrect_client_credentials' ? 'The sign-in helper’s client ID or secret is wrong.'
      : data.error === 'redirect_uri_mismatch' ? 'The GitHub App’s callback URL doesn’t match the sign-in helper.'
      : 'GitHub didn’t return a sign-in (' + (data.error || res.status) + ').';
    return returnTo(back, 'studio_error', why);
  }
  return returnTo(back, 'studio_token', data.access_token);
}

function returnTo(back, key, value) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: back + '#' + key + '=' + encodeURIComponent(value),
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'Set-Cookie': `${COOKIE}=; Path=/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    },
  });
}

function page(message, status) {
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Froglet Studio</title><body style="background:#050810;color:#fff;font:16px system-ui;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;text-align:center"><p>${message}</p>`, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" },
  });
}
