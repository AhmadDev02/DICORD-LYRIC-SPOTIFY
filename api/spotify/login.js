export default function handler(req, res) {
  const clientId = process.env.SPOTIFY_CLIENT_ID || '';
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}/api/spotify/callback`;
  const scope = 'user-read-currently-playing user-read-playback-state user-read-email';

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: scope,
    redirect_uri: redirectUri,
  });

  res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
}
