import { currentPlayer, githubConfigured, json, publicPlayer } from '../../_lib/session.js';

/** Who this browser is signed in as, and whether GitHub sign-in is set up on this deployment. */
export async function onRequestGet({ request, env }) {
  let player = null;
  try {
    player = await currentPlayer(request, env.DB);
  } catch (error) {
    console.error('Session lookup failed', error);
  }
  return json({ player: publicPlayer(player), github: githubConfigured(env) });
}
