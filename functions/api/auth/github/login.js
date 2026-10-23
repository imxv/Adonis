import { OAUTH_COOKIE, OAUTH_PATH, callbackUrl, cookie, githubConfigured, guestId, randomToken } from '../../../_lib/session.js';

/**
 * Send the player to GitHub's consent page. No scope is requested: only the public profile is read.
 * `?pid=` names the guest this browser played as, so its runs move to the GitHub account on return.
 */
export async function onRequestGet({ request, env }) {
  if (!githubConfigured(env)) return Response.redirect(new URL('/?login=unavailable', request.url).toString(), 302);
  const state = randomToken(16);
  const pid = guestId(new URL(request.url).searchParams.get('pid'));
  const authorize = new URL('https://github.com/login/oauth/authorize');
  authorize.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  authorize.searchParams.set('redirect_uri', callbackUrl(request));
  authorize.searchParams.set('state', state);
  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      'Set-Cookie': cookie(request, OAUTH_COOKIE, `${state}.${pid}`, 600, OAUTH_PATH),
      'Cache-Control': 'no-store',
    },
  });
}
