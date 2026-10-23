/**
 * "Sign in with GitHub" for Froglet Studio (www.froglet.games/admin/): a Cloudflare Worker that turns a
 * GitHub sign-in into a token and hands it to the Studio window. It stores nothing.
 *
 * It uses a GitHub App (not an OAuth App), so the token can only do what the App may do: read and
 * write the files of the one repository it is installed on (the website), for the signed-in person.
 * Setup: README.md in this folder.
 *
 * Environment (Worker > Settings > Variables and Secrets):
 *   GITHUB_CLIENT_ID      the GitHub App's Client ID
 *   GITHUB_CLIENT_SECRET  a client secret of the App (add it as a Secret, not plain text)
 *   ALLOWED_ORIGIN        https://www.froglet.games (the only page that may receive the token)
 *
 *   GET /auth      -> redirect to GitHub's sign-in, with a one-time state in a cookie
 *   GET /callback  -> check the state, swap the code for a token, post it to the Studio, close
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/auth') return start(url, env);
    if (url.pathname === '/callback') return finish(request, url, env);
    return new Response('Froglet Studio sign-in', { status: 404 });
  },
};

const STATE_COOKIE = 'studio_state';

function start(url, env) {
  const state = crypto.randomUUID();
  const gh = new URL('https://github.com/login/oauth/authorize');
  gh.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  gh.searchParams.set('redirect_uri', url.origin + '/callback');
  gh.searchParams.set('state', state);
  return new Response(null, {
    status: 302,
    headers: {
      Location: gh.toString(),
      'Set-Cookie': `${STATE_COOKIE}=${state}; Path=/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      'Cache-Control': 'no-store',
    },
  });
}

async function finish(request, url, env) {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookie = (request.headers.get('Cookie') || '').match(new RegExp(`(?:^|;\\s*)${STATE_COOKIE}=([^;]+)`));
  if (!code || !state || !cookie || cookie[1] !== state) {
    return page(env, null, 'Sign-in didn’t complete. Close this window and try again.');
  }
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'froglet-studio-auth' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: url.origin + '/callback',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.access_token) return page(env, null, 'GitHub didn’t return a sign-in. Close this window and try again.');
  return page(env, data.access_token, 'Signed in. You can close this window.');
}

// The token goes to the Studio window only, and only if it is on ALLOWED_ORIGIN.
function page(env, token, message) {
  const origin = env.ALLOWED_ORIGIN || 'https://www.froglet.games';
  const script = token
    ? `<script>if (window.opener) { window.opener.postMessage(${JSON.stringify({ type: 'froglet-studio-token', token })}, ${JSON.stringify(origin)}); window.close(); }</script>`
    : '';
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Froglet Studio</title><body style="background:#050810;color:#fff;font:16px system-ui;display:grid;place-items:center;min-height:100vh;margin:0">
<p>${message}</p>${script}`;
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
      'Set-Cookie': `${STATE_COOKIE}=; Path=/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    },
  });
}
