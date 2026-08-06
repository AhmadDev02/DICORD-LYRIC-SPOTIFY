import dotenv from 'dotenv';
dotenv.config();

export default function handler(req, res) {
  const clientId = process.env.SPOTIFY_CLIENT_ID || '';
  
  if (!clientId) {
    res.status(500).send('<h1>Configuration Error</h1><p>SPOTIFY_CLIENT_ID is missing in environment variables (.env or Vercel Settings).</p>');
    return;
  }

  const host = req.headers.host || 'localhost:8888';
  const protocol = req.headers['x-forwarded-proto'] || (host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https');
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI || `${protocol}://${host}/api/spotify/callback`;
  const scope = 'user-read-currently-playing user-read-playback-state user-read-email';

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: scope,
    redirect_uri: redirectUri,
  });

  res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
}
