import { useState, useEffect } from "react";

// --- SPOTIFY CONFIG ---
const CLIENT_ID = 'ecfe79d42f4c4d36b42cca9522223e01'; 
const REDIRECT_URI = 'https://music-matcher.netlify.app/';
const AUTH_ENDPOINT = "https://accounts.spotify.com/authorize";
const SCOPES = "playlist-read-private user-library-read";

const KEY_MAP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

// --- UI COMPONENTS ---
function LoadingOverlay({ progress, status }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'rgba(15,15,18,0.95)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div style={{ width: 300, background: '#1a1a22', height: 12, borderRadius: 6, overflow: 'hidden', border: '1px solid #333' }}>
        <div style={{ width: `${progress}%`, background: '#00c266', height: '100%', transition: 'width 0.4s ease', boxShadow: '0 0 10px #00c266' }} />
      </div>
      <p style={{ marginTop: 20, color: '#00c266', fontWeight: 'bold', letterSpacing: '1px' }}>{status.toUpperCase()}</p>
      <p style={{ color: '#555', fontSize: '12px' }}>{progress}% Complete</p>
    </div>
  );
}

export default function RemixMatcher() {
  const [token, setToken] = useState("");
  const [playlists, setPlaylists] = useState([]);
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const hash = window.location.hash;
    let _token = window.localStorage.getItem("spotify_token");
    if (!_token && hash) {
      const tokenMatch = hash.match(/access_token=([^&]*)/);
      if (tokenMatch) {
        _token = tokenMatch[1];
        window.location.hash = "";
        window.localStorage.setItem("spotify_token", _token);
      }
    }
    setToken(_token);
    if (_token) fetchPlaylists(_token);
  }, []);

  const fetchPlaylists = async (t) => {
    try {
      const res = await fetch("https://api.spotify.com/v1/me/playlists", {
        headers: { Authorization: `Bearer ${t}` }
      });
      const data = await res.json();
      setPlaylists(data.items || []);
    } catch (e) { console.error("Session expired", e); setToken(""); }
  };

  const loadPlaylist = async (playlistId) => {
    setLoading(true);
    setProgress(5);
    setStatus("Connecting to Spotify...");
    let allTracks = [];
    let nextUrl = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;

    try {
      while (nextUrl) {
        const res = await fetch(nextUrl, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        allTracks = [...allTracks, ...data.items];
        nextUrl = data.next;
        const fetchProgress = Math.min(45, Math.round((allTracks.length / 500) * 45));
        setProgress(fetchProgress);
        setStatus(`Downloading Track List... (${allTracks.length} songs)`);
      }

      setStatus("Analyzing Audio DNA...");
      const trackIds = allTracks.map(t => t.track.id).filter(id => id !== null);
      let features = [];
      for (let i = 0; i < trackIds.length; i += 100) {
        const batch = trackIds.slice(i, i + 100).join(',');
        const fRes = await fetch(`https://api.spotify.com/v1/audio-features?ids=${batch}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const fData = await fRes.json();
        features = [...features, ...fData.audio_features];
        setProgress(45 + Math.round((i / trackIds.length) * 55));
      }

      const processed = allTracks.map((item, idx) => {
        const f = features[idx];
        if (!f) return null;
        return {
          song: item.track.name,
          artist: item.track.artists[0].name,
          bpm: Math.round(f.tempo),
          key: f.mode === 0 ? `${KEY_MAP[f.key]} min` : KEY_MAP[f.key]
        };
      }).filter(Boolean);

      setSongs(processed);
    } catch (err) {
      alert("Error loading tracks. Session might be expired.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0f0f12', color: '#e8e8ea', fontFamily: 'sans-serif' }}>
      {loading && <LoadingOverlay progress={progress} status={status} />}
      
      {/* Sidebar */}
      <div style={{ width: 300, borderRight: '1px solid #1a1a22', display: 'flex', flexDirection: 'column', background: '#0a0a0d' }}>
        <div style={{ padding: 25 }}>
          <h2 style={{ color: '#00c266', margin: 0 }}>Remix Matcher</h2>
          {!token ? (
            <button 
              onClick={() => window.location.href = `${AUTH_ENDPOINT}?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=token&scope=${encodeURIComponent(SCOPES)}`}
              style={{ background: '#00c266', border: 'none', padding: '12px 20px', borderRadius: 25, cursor: 'pointer', fontWeight: 'bold', width: '100%', marginTop: 20 }}
            >CONNECT SPOTIFY</button>
          ) : (
            <button onClick={() => { window.localStorage.removeItem("spotify_token"); setToken(""); }} style={{ color: '#555', background: 'none', border: 'none', cursor: 'pointer', marginTop: 10 }}>Logout</button>
          )}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 15 }}>
          {playlists.map(p => (
            <div key={p.id} onClick={() => loadPlaylist(p.id)} style={{ padding: '12px', cursor: 'pointer', borderRadius: 8, fontSize: 13, borderBottom: '1px solid #111' }} onMouseEnter={e => e.currentTarget.style.background = '#ffffff05'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              {p.name} <span style={{ color: '#00c266', float: 'right' }}>{p.tracks.total}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, padding: 30, overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 }}>
            <h1 style={{ margin: 0 }}>{songs.length > 0 ? `Library: ${songs.length} Tracks` : "Select a Playlist"}</h1>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 15 }}>
          {songs.map((s, i) => (
            <div key={i} style={{ background: '#16161d', padding: 15, borderRadius: 10, border: '1px solid #222' }}>
              <div style={{ fontWeight: 'bold', color: '#fff', marginBottom: 5 }}>{s.song}</div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>{s.artist}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#00c266', fontWeight: 'bold' }}>{s.bpm} BPM</span>
                <span style={{ color: '#aaa' }}>{s.key}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}