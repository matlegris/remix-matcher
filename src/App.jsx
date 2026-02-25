import { useState, useCallback, useRef, useEffect } from "react";

const RELATIVE_KEYS = {
  'C': 'A min', 'C#': 'A# min', 'D': 'B min', 'D#': 'C min',
  'E': 'C# min', 'F': 'D min', 'F#': 'D# min', 'G': 'E min',
  'G#': 'F min', 'A': 'F# min', 'A#': 'G min', 'B': 'G# min',
  'A min': 'C', 'A# min': 'C#', 'B min': 'D', 'C min': 'D#',
  'C# min': 'E', 'D min': 'F', 'D# min': 'F#', 'E min': 'G',
  'F min': 'G#', 'F# min': 'A', 'G min': 'A#', 'G# min': 'B',
};

const KEY_COLORS = {
  'C': '#FF6B6B', 'C#': '#FF8E53', 'D': '#FFA940', 'D#': '#FFD666',
  'E': '#BAE637', 'F': '#36CFC9', 'F#': '#40A9FF', 'G': '#597EF7',
  'G#': '#9254DE', 'A': '#C41D7F', 'A#': '#EB2F96', 'B': '#FF85C2',
  'A min': '#FF6B6B', 'A# min': '#FF8E53', 'B min': '#FFA940', 'C min': '#FFD666',
  'C# min': '#BAE637', 'D min': '#36CFC9', 'D# min': '#40A9FF', 'E min': '#597EF7',
  'F min': '#9254DE', 'F# min': '#C41D7F', 'G min': '#EB2F96', 'G# min': '#FF85C2',
};

function parseCSV(text) {
  const lines = text.split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    // Handle quoted fields
    const cells = [];
    let inQuote = false, cell = '';
    for (let c = 0; c < line.length; c++) {
      if (line[c] === '"') { inQuote = !inQuote; continue; }
      if (line[c] === ',' && !inQuote) { cells.push(cell); cell = ''; continue; }
      cell += line[c];
    }
    cells.push(cell);
    const row = {};
    headers.forEach((h, idx) => { row[h] = cells[idx] || ''; });
    rows.push(row);
  }
  return rows;
}

function convertKey(keyNum, mode) {
  const keyMap = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const k = parseInt(keyNum);
  const m = parseInt(mode);
  if (isNaN(k) || k < 0 || k > 11) return null;
  return m === 0 ? `${keyMap[k]} min` : keyMap[k];
}

function processCSV(rows) {
  return rows
    .map(r => {
      const bpm = parseFloat(r['Tempo']);
      const key = convertKey(r['Key'], r['Mode']);
      if (!bpm || !key) return null;
      if ((r['Track Name'] || '').includes('#') || (r['Artist Name(s)'] || '').includes('#')) return null;
      return {
        song: (r['Track Name'] || '').trim(),
        artist: (r['Artist Name(s)'] || '').trim(),
        bpm: Math.round(bpm),
        key,
        relativeKey: RELATIVE_KEYS[key] || null,
      };
    })
    .filter(Boolean)
    .filter(r => r.song && r.artist);
}

function matchBPM(bpm1, bpm2, tolerance) {
  if (Math.abs(bpm1 - bpm2) <= tolerance) return { ok: true, type: 'exact', adjusted: bpm2 };
  if (Math.abs(bpm1 - bpm2 / 2) <= tolerance) return { ok: true, type: '½×', adjusted: bpm2 / 2 };
  if (Math.abs(bpm1 - bpm2 * 2) <= tolerance) return { ok: true, type: '2×', adjusted: bpm2 * 2 };
  return { ok: false };
}

function matchKey(s1, s2, allowRelative) {
  if (s1.key === s2.key) return { ok: true, type: 'exact' };
  if (allowRelative && (s1.relativeKey === s2.key || s2.relativeKey === s1.key))
    return { ok: true, type: 'relative' };
  return { ok: false };
}

function findAllMatches(songs, tolerance, allowRelative) {
  const matches = [];
  const seen = new Set();
  for (let i = 0; i < songs.length; i++) {
    for (let j = i + 1; j < songs.length; j++) {
      const s1 = songs[i], s2 = songs[j];
      const km = matchKey(s1, s2, allowRelative);
      const bm = matchBPM(s1.bpm, s2.bpm, tolerance);
      if (km.ok && bm.ok) {
        const pair = [s1.song, s2.song].sort().join('|||');
        if (!seen.has(pair)) {
          seen.add(pair);
          const diff = Math.abs(s1.bpm - bm.adjusted);
          matches.push({ a: s1, b: s2, bpmDiff: diff, keyMatch: km.type, bpmMatch: bm.type });
        }
      }
    }
  }
  matches.sort((a, b) => a.bpmDiff - b.bpmDiff);
  return matches;
}

function SortHeader({ label, sortKey, current, onToggle, align = 'left' }) {
  const active = current.key === sortKey;
  const arrow = active ? (current.dir === 'asc' ? ' ↑' : ' ↓') : ' ↕';
  return (
    <span
      onClick={() => onToggle(sortKey)}
      style={{
        cursor: 'pointer',
        userSelect: 'none',
        textAlign: align,
        display: 'block',
        color: active ? '#00c266' : '#444',
        transition: 'color 0.15s',
        letterSpacing: 0.8,
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#666'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.color = '#444'; }}
    >
      {label}<span style={{ opacity: active ? 1 : 0.4 }}>{arrow}</span>
    </span>
  );
}

function KeyBadge({ keyName }) {
  const color = KEY_COLORS[keyName] || '#666';
  return (
    <span style={{
      display: 'inline-block',
      background: color + '22',
      color,
      border: `1px solid ${color}44`,
      borderRadius: 4,
      padding: '1px 7px',
      fontSize: 11,
      fontFamily: 'monospace',
      fontWeight: 700,
      letterSpacing: 0.5,
      whiteSpace: 'nowrap',
    }}>{keyName}</span>
  );
}

function MatchTypeBadge({ type }) {
  const cfg = {
    exact: { bg: '#00c26622', color: '#00c266', label: 'exact key' },
    relative: { bg: '#f5a62322', color: '#f5a623', label: 'relative key' },
  };
  const c = cfg[type] || cfg.exact;
  return (
    <span style={{
      display: 'inline-block',
      background: c.bg, color: c.color,
      border: `1px solid ${c.color}44`,
      borderRadius: 4, padding: '1px 7px',
      fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
    }}>{c.label}</span>
  );
}

function BpmBadge({ type }) {
  if (type === 'exact') return null;
  return (
    <span style={{
      display: 'inline-block',
      background: '#ffffff11', color: '#aaa',
      border: '1px solid #ffffff22',
      borderRadius: 4, padding: '1px 7px',
      fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
    }}>{type} BPM</span>
  );
}

// Card shown at the top when a song is selected
function AnchorCard({ song }) {
  return (
    <div style={{
      margin: '16px 20px 0',
      padding: '14px 18px',
      background: '#00c26610',
      border: '1px solid #00c26630',
      borderRadius: 10,
    }}>
      <div style={{ fontSize: 16, fontWeight: 600, color: '#f0f0f0' }}>{song.song}</div>
      <div style={{ fontSize: 12, color: '#777', marginTop: 2 }}>{song.artist}</div>
      <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#aaa', fontFamily: 'monospace' }}>{song.bpm} BPM</span>
        <KeyBadge keyName={song.key} />
        {song.relativeKey && <span style={{ fontSize: 11, color: '#555' }}>rel. <KeyBadge keyName={song.relativeKey} /></span>}
      </div>
    </div>
  );
}

// A single match row — just the "other" track
function MatchRow({ match, anchor, selected, onClick, onNavigate }) {
  const other = match.a.song === anchor?.song ? match.b : match.a;
  const { bpmDiff, keyMatch, bpmMatch } = match;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 90px 90px',
        alignItems: 'center',
        gap: 12,
        padding: '10px 20px',
        borderBottom: '1px solid #ffffff07',
        background: selected ? '#ffffff0a' : 'transparent',
        transition: 'background 0.12s',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = '#ffffff05'; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent'; }}
    >
      <div>
        <div
          onClick={onNavigate ? (e) => { e.stopPropagation(); onNavigate(other); } : onClick}
          style={{
            fontSize: 13, color: '#f0f0f0', fontWeight: 500,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            cursor: 'pointer',
            display: 'inline-block', maxWidth: '100%',
          }}
          title={onNavigate ? `View matches for: ${other.song}` : undefined}
          onMouseEnter={e => { e.currentTarget.style.color = '#00c266'; e.currentTarget.style.textDecoration = 'underline'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#f0f0f0'; e.currentTarget.style.textDecoration = 'none'; }}
        >{other.song}</div>
        <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{other.artist}</div>
        <div style={{ marginTop: 4, display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#888', fontFamily: 'monospace' }}>{other.bpm} BPM</span>
          <KeyBadge keyName={other.key} />
          <BpmBadge type={bpmMatch} />
        </div>
      </div>
      <div style={{ textAlign: 'center', cursor: 'pointer' }} onClick={onClick}>
        <div style={{ fontSize: 13, color: bpmDiff === 0 ? '#00c266' : bpmDiff < 4 ? '#00c266' : bpmDiff < 8 ? '#f5a623' : '#aaa', fontFamily: 'monospace', fontWeight: 700 }}>
          {bpmDiff === 0 ? '0' : bpmDiff.toFixed(1)}
        </div>
      </div>
      <div style={{ textAlign: 'right', cursor: 'pointer' }} onClick={onClick}>
        <MatchTypeBadge type={keyMatch} />
      </div>
    </div>
  );
}

// Group header for "all matches" mode
function GroupHeader({ song, count, expanded, onToggle }) {
  return (
    <div
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 20px',
        background: '#13131a',
        borderBottom: '1px solid #1e1e28',
        borderTop: '1px solid #1e1e28',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <span style={{ fontSize: 11, color: '#444', transition: 'transform 0.15s', display: 'inline-block', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#d8d8e0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.song}</span>
        <span style={{ fontSize: 11, color: '#555', marginLeft: 8 }}>{song.artist}</span>
      </div>
      <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: '#666', fontFamily: 'monospace' }}>{song.bpm} BPM</span>
        <KeyBadge keyName={song.key} />
        <span style={{ fontSize: 11, color: '#00c26699', fontWeight: 700 }}>{count} match{count !== 1 ? 'es' : ''}</span>
      </div>
    </div>
  );
}

export default function RemixMatcher() {
  const [songs, setSongs] = useState([]);
  const [matches, setMatches] = useState([]);
  const [tolerance, setTolerance] = useState(10);
  const [allowRelative, setAllowRelative] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTerm, setFilterTerm] = useState('');
  const [selectedSong, setSelectedSong] = useState(null);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [history, setHistory] = useState([]);
  const [songSort, setSongSort] = useState({ key: 'az', dir: 'asc' });
  const [matchSort, setMatchSort] = useState({ key: 'bpm', dir: 'asc' });
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef();
  const addFileRef = useRef();
  const toleranceRef = useRef(tolerance);
  toleranceRef.current = tolerance;
  const songListRef = useRef();
  const songItemRefs = useRef({});

  const recompute = useCallback((songList, tol, relKeys) => {
    const m = findAllMatches(songList, tol, relKeys);
    setMatches(m);
  }, []);

  const loadSongs = useCallback((csvText, name, replace = true) => {
    const rows = parseCSV(csvText);
    const required = ['Track Name', 'Artist Name(s)', 'Key', 'Mode', 'Tempo'];
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    const missing = required.filter(r => !headers.includes(r));
    if (missing.length > 0) {
      alert(`Missing columns: ${missing.join(', ')}\n\nMake sure this is an Exportify CSV!`);
      return;
    }
    const processed = processCSV(rows);
    setSongs(prev => {
      const base = replace ? [] : prev;
      const merged = [...base, ...processed].reduce((acc, s) => {
        const key = `${s.song}|||${s.artist}`;
        if (!acc.map[key]) { acc.map[key] = true; acc.list.push(s); }
        return acc;
      }, { map: {}, list: [] }).list;
      recompute(merged, toleranceRef.current, allowRelative);
      return merged;
    });
    setFileName(name);
    setSelectedSong(null);
    setSelectedMatch(null);
  }, [allowRelative, recompute]);

  const handleFile = useCallback((file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => loadSongs(e.target.result, file.name);
    reader.readAsText(file);
  }, [loadSongs]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleTolerance = useCallback((val) => {
    const n = Math.max(1, Math.min(50, val));
    setTolerance(n);
    setSongs(prev => { recompute(prev, n, allowRelative); return prev; });
  }, [allowRelative, recompute]);

  const handleRelative = useCallback((val) => {
    setAllowRelative(val);
    setSongs(prev => { recompute(prev, toleranceRef.current, val); return prev; });
  }, [recompute]);

  // Navigate to a song, pushing current to history
  const selectSong = useCallback((song) => {
    setHistory(prev => selectedSong ? [...prev, selectedSong] : prev);
    setSelectedSong(song);
    setSelectedMatch(null);
  }, [selectedSong]);

  const undoSelection = useCallback(() => {
    setHistory(prev => {
      if (prev.length === 0) {
        setSelectedSong(null);
        setSelectedMatch(null);
        return prev;
      }
      const next = [...prev];
      const last = next.pop();
      setSelectedSong(last);
      setSelectedMatch(null);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setHistory([]);
    setSelectedSong(null);
    setSelectedMatch(null);
  }, []);

  // Scroll sidebar to selected song whenever selectedSong changes
  useEffect(() => {
    if (selectedSong && songItemRefs.current[selectedSong.song]) {
      songItemRefs.current[selectedSong.song].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedSong]);

  // Sort helper
  const toggleSort = (current, key, setter) => {
    if (current.key === key) {
      setter({ key, dir: current.dir === 'asc' ? 'desc' : 'asc' });
    } else {
      setter({ key, dir: 'asc' });
    }
  };

  // Filtered + sorted song list
  const filteredSongs = songs
    .filter(s => !searchTerm || s.song.toLowerCase().includes(searchTerm.toLowerCase()) || s.artist.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      let cmp = 0;
      if (songSort.key === 'az') cmp = a.song.localeCompare(b.song);
      else if (songSort.key === 'bpm') cmp = a.bpm - b.bpm;
      else if (songSort.key === 'key') cmp = a.key.localeCompare(b.key);
      return songSort.dir === 'asc' ? cmp : -cmp;
    });

  // Filtered + sorted matches
  const displayedMatches = matches
    .filter(m => {
      if (selectedSong) return m.a.song === selectedSong.song || m.b.song === selectedSong.song;
      if (!filterTerm) return true;
      const f = filterTerm.toLowerCase();
      return m.a.song.toLowerCase().includes(f) || m.b.song.toLowerCase().includes(f) ||
             m.a.artist.toLowerCase().includes(f) || m.b.artist.toLowerCase().includes(f);
    })
    .sort((a, b) => {
      const getOther = m => m.a.song === selectedSong?.song ? m.b : m.a;
      let cmp = 0;
      if (matchSort.key === 'az') cmp = getOther(a).song.localeCompare(getOther(b).song);
      else if (matchSort.key === 'bpm') cmp = a.bpmDiff - b.bpmDiff;
      else if (matchSort.key === 'key') cmp = getOther(a).key.localeCompare(getOther(b).key);
      return matchSort.dir === 'asc' ? cmp : -cmp;
    });

  const matchCountForSong = (song) =>
    matches.filter(m => m.a.song === song.song || m.b.song === song.song).length;

  const scrollbarStyle = `
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #2e2e38; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #3e3e4a; }
    * { scrollbar-width: thin; scrollbar-color: #2e2e38 transparent; }
  `;

  return (
    <div style={{
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      background: '#0f0f12',
      color: '#e8e8ea',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      position: 'fixed',
      inset: 0,
    }}>
      <style>{scrollbarStyle}</style>
      {/* Header */}
      <div style={{
        padding: '16px 24px',
        borderBottom: '1px solid #1e1e26',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        background: '#0a0a0d',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32,
            background: 'linear-gradient(135deg, #00c266, #007a42)',
            borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16,
          }}>♫</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.3 }}>Remix Matcher</div>
            <div style={{ fontSize: 11, color: '#555', marginTop: -1 }}>Exportify Edition</div>
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {/* BPM Tolerance */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: '#666' }}>BPM Tolerance</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => handleTolerance(tolerance - 1)} style={{ ...btnStyle, width: 24, height: 24, padding: 0 }}>−</button>
            <div style={{
              background: '#1a1a22', border: '1px solid #2a2a35',
              borderRadius: 6, padding: '4px 12px',
              fontSize: 14, fontWeight: 700, fontFamily: 'monospace',
              color: '#00c266', minWidth: 42, textAlign: 'center',
            }}>±{tolerance}</div>
            <button onClick={() => handleTolerance(tolerance + 1)} style={{ ...btnStyle, width: 24, height: 24, padding: 0 }}>+</button>
          </div>
          <input
            type="range" min={1} max={50} value={tolerance}
            onChange={e => handleTolerance(parseInt(e.target.value))}
            style={{ width: 90, accentColor: '#00c266' }}
          />
        </div>

        {/* Relative keys toggle */}
        <div
          onClick={() => handleRelative(!allowRelative)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            cursor: 'pointer', padding: '6px 12px',
            background: allowRelative ? '#00c26618' : '#1a1a22',
            border: `1px solid ${allowRelative ? '#00c26644' : '#2a2a35'}`,
            borderRadius: 6, transition: 'all 0.2s',
          }}
        >
          <div style={{
            width: 28, height: 16, borderRadius: 8,
            background: allowRelative ? '#00c266' : '#333',
            position: 'relative', transition: 'background 0.2s',
          }}>
            <div style={{
              position: 'absolute', top: 2, left: allowRelative ? 14 : 2,
              width: 12, height: 12, borderRadius: 6,
              background: '#fff', transition: 'left 0.2s',
            }} />
          </div>
          <span style={{ fontSize: 12, color: allowRelative ? '#00c266' : '#666' }}>Relative Keys</span>
        </div>

        {/* Load buttons */}
        <div style={{ display: 'flex', gap: 6 }}>
          {songs.length > 0 && (
            <button onClick={() => addFileRef.current.click()} style={{
              ...btnStyle,
              fontSize: 12,
            }}>
              + Add More
            </button>
          )}
          <button onClick={() => fileRef.current.click()} style={{
            ...btnStyle,
            background: '#00c266', color: '#000',
            fontWeight: 700, fontSize: 12,
          }}>
            Load CSV
          </button>
        </div>
        <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }}
          onChange={e => { handleFile(e.target.files[0]); fileRef.current.value = ''; }} />
        <input ref={addFileRef} type="file" accept=".csv" multiple style={{ display: 'none' }}
          onChange={e => {
            Array.from(e.target.files).forEach((file, idx) => {
              const reader = new FileReader();
              reader.onload = ev => {
                const rows = parseCSV(ev.target.result);
                const processed = processCSV(rows);
                setSongs(prev => {
                  const merged = [...prev, ...processed].reduce((acc, s) => {
                    const key = `${s.song}|||${s.artist}`;
                    if (!acc.map[key]) { acc.map[key] = true; acc.list.push(s); }
                    return acc;
                  }, { map: {}, list: [] }).list;
                  recompute(merged, toleranceRef.current, allowRelative);
                  return merged;
                });
              };
              reader.readAsText(file);
            });
            addFileRef.current.value = '';
          }} />
      </div>

      {/* Main layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', height: 'calc(100vh - 65px)' }}>

        {/* Left: Song list */}
        <div style={{
          width: 280, minWidth: 220,
          borderRight: '1px solid #1a1a22',
          display: 'flex', flexDirection: 'column',
          background: '#0a0a0d',
        }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #1a1a22' }}>
            <input
              placeholder="Search songs…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: '#1a1a22', border: '1px solid #2a2a35',
                borderRadius: 6, padding: '7px 10px',
                color: '#e8e8ea', fontSize: 12, outline: 'none',
              }}
            />
          </div>
          <div style={{ padding: '6px 14px', borderBottom: '1px solid #1a1a22', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#555' }}>{songs.length} songs loaded</span>
            <div style={{ display: 'flex', gap: 5 }}>
              {history.length > 0 && (
                <button onClick={undoSelection}
                  title={`Back to: ${history[history.length-1]?.song}`}
                  style={{ ...btnStyle, fontSize: 10, padding: '3px 8px', color: '#888', gap: 4 }}>
                  ← back
                </button>
              )}
              {selectedSong && (
                <button onClick={clearSelection}
                  style={{ ...btnStyle, fontSize: 10, padding: '3px 8px', color: '#666' }}>
                  show all
                </button>
              )}
            </div>
          </div>
          {songs.length > 0 && (
            <div style={{
              display: 'flex', gap: 4, padding: '5px 14px',
              borderBottom: '1px solid #1a1a22',
              background: '#080810',
              fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8,
            }}>
              {[['az','A–Z'],['bpm','BPM'],['key','Key']].map(([k, label]) => {
                const active = songSort.key === k;
                return (
                  <button key={k} onClick={() => toggleSort(songSort, k, setSongSort)} style={{
                    background: active ? '#00c26618' : 'transparent',
                    border: `1px solid ${active ? '#00c26640' : '#1e1e28'}`,
                    borderRadius: 4, padding: '2px 8px',
                    color: active ? '#00c266' : '#444',
                    cursor: 'pointer', fontSize: 10,
                    display: 'flex', alignItems: 'center', gap: 3,
                    transition: 'all 0.15s',
                  }}>
                    {label}
                    <span style={{ opacity: active ? 1 : 0.3 }}>{active ? (songSort.dir === 'asc' ? '↑' : '↓') : '↕'}</span>
                  </button>
                );
              })}
            </div>
          )}
          <div ref={songListRef} style={{ flex: 1, overflowY: 'auto' }}>
            {songs.length === 0 ? (
              <div
                onDrop={handleDrop}
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                style={{
                  margin: 16, borderRadius: 10,
                  border: `2px dashed ${isDragging ? '#00c266' : '#2a2a35'}`,
                  padding: '40px 20px', textAlign: 'center',
                  background: isDragging ? '#00c26608' : 'transparent',
                  transition: 'all 0.2s', cursor: 'pointer',
                }}
                onClick={() => fileRef.current.click()}
              >
                <div style={{ fontSize: 28, marginBottom: 10 }}>🎵</div>
                <div style={{ fontSize: 13, color: '#555', lineHeight: 1.5 }}>Drop an Exportify CSV here or click to browse</div>
              </div>
            ) : (
              filteredSongs.map((song, i) => {
                const isSelected = selectedSong?.song === song.song;
                const count = matchCountForSong(song);
                return (
                  <div
                    key={`${song.song}-${i}`}
                    ref={el => { songItemRefs.current[song.song] = el; }}
                    onClick={() => { isSelected ? clearSelection() : selectSong(song); }}
                    style={{
                      padding: '9px 14px', cursor: 'pointer',
                      background: isSelected ? '#00c26612' : 'transparent',
                      borderLeft: `2px solid ${isSelected ? '#00c266' : 'transparent'}`,
                      transition: 'all 0.1s',
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#ffffff05'; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: isSelected ? '#00c266' : '#d0d0d8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {song.song}
                        </div>
                        <div style={{ fontSize: 10, color: '#555', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {song.artist}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <KeyBadge keyName={song.key} />
                        <div style={{ fontSize: 10, color: '#555', marginTop: 3, fontFamily: 'monospace' }}>{song.bpm}</div>
                        {count > 0 && <div style={{ fontSize: 10, color: '#00c26688', marginTop: 1 }}>{count}✓</div>}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Matches */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Matches header */}
          <div style={{
            padding: '12px 20px',
            borderBottom: '1px solid #1a1a22',
            display: 'flex', alignItems: 'center', gap: 16,
            background: '#0c0c10',
          }}>
            <div>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#d0d0d8' }}>
                {selectedSong ? `Matches for "${selectedSong.song}"` : 'All Matches'}
              </span>
              <span style={{ fontSize: 11, color: '#555', marginLeft: 10 }}>
                {displayedMatches.length} match{displayedMatches.length !== 1 ? 'es' : ''}
              </span>
            </div>
            <div style={{ flex: 1 }}>
              <input
                placeholder="Filter matches…"
                value={filterTerm}
                onChange={e => setFilterTerm(e.target.value)}
                style={{
                  width: '100%', maxWidth: 300, boxSizing: 'border-box',
                  background: '#1a1a22', border: '1px solid #2a2a35',
                  borderRadius: 6, padding: '6px 10px',
                  color: '#e8e8ea', fontSize: 12, outline: 'none',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#555' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#00c26622', border: '1px solid #00c26644' }}/>
                exact key
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#f5a62322', border: '1px solid #f5a62344' }}/>
                relative key
              </span>
            </div>
          </div>

          {/* Column headers */}
          {displayedMatches.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 90px 90px',
              gap: 12, padding: '6px 20px',
              background: '#0a0a0d',
              borderBottom: '1px solid #1a1a22',
              fontSize: 10, textTransform: 'uppercase',
            }}>
              <SortHeader label="Matching Track" sortKey="az" current={matchSort} onToggle={k => toggleSort(matchSort, k, setMatchSort)} />
              <SortHeader label="BPM Diff" sortKey="bpm" current={matchSort} onToggle={k => toggleSort(matchSort, k, setMatchSort)} align="center" />
              <SortHeader label="Key" sortKey="key" current={matchSort} onToggle={k => toggleSort(matchSort, k, setMatchSort)} align="right" />
            </div>
          )}

          {/* Match rows */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {songs.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#444' }}>
                <div style={{ fontSize: 36, marginBottom: 16 }}>🎚️</div>
                <div style={{ fontSize: 16, fontWeight: 500, color: '#555' }}>Load an Exportify CSV to find matches</div>
                <div style={{ fontSize: 12, marginTop: 8, color: '#3a3a3a', maxWidth: 400, margin: '8px auto 0' }}>
                  Export your Spotify playlist with Exportify, then load the CSV here to find harmonically and rhythmically compatible tracks.
                </div>
              </div>
            ) : displayedMatches.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#444' }}>
                <div style={{ fontSize: 30, marginBottom: 12 }}>∅</div>
                <div style={{ fontSize: 13 }}>No matches found with current settings</div>
                <div style={{ fontSize: 11, marginTop: 6, color: '#3a3a3a' }}>Try increasing the BPM tolerance or enabling relative keys</div>
              </div>
            ) : selectedSong ? (
              // Anchor mode: card at top, then flat list of matches
              <>
                <AnchorCard song={selectedSong} />
                <div style={{
                  padding: '6px 20px 4px',
                  fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: 0.8,
                  marginTop: 12,
                }}>
                  {displayedMatches.length} compatible track{displayedMatches.length !== 1 ? 's' : ''}
                </div>
                {displayedMatches.map((match, i) => (
                  <MatchRow
                    key={i}
                    match={match}
                    anchor={selectedSong}
                    selected={selectedMatch === i}
                    onClick={() => setSelectedMatch(selectedMatch === i ? null : i)}
                    onNavigate={selectSong}
                  />
                ))}
              </>
            ) : (
              // All matches mode: grouped by anchor song
              (() => {
                // Build groups: for each song that has matches, list its matches
                const groupMap = new Map();
                displayedMatches.forEach(match => {
                  [match.a, match.b].forEach(anchor => {
                    if (!groupMap.has(anchor.song)) groupMap.set(anchor.song, { song: anchor, matches: [] });
                  });
                  // Assign match to a (the first song in sorted pair)
                  const key = match.a.song;
                  if (groupMap.has(key)) groupMap.get(key).matches.push({ match, anchor: match.a });
                });
                // Only show groups that have matches assigned to them (as anchor a)
                const groups = [...groupMap.values()].filter(g => g.matches.length > 0);
                return groups.map(({ song, matches: groupMatches }) => {
                  const isExpanded = expandedGroups[song.song] !== false; // default expanded
                  return (
                    <div key={song.song}>
                      <GroupHeader
                        song={song}
                        count={groupMatches.length}
                        expanded={isExpanded}
                        onToggle={() => setExpandedGroups(prev => ({ ...prev, [song.song]: !isExpanded }))}
                      />
                      {isExpanded && groupMatches.map(({ match }, i) => (
                        <MatchRow
                          key={i}
                          match={match}
                          anchor={song}
                          selected={selectedMatch === `${song.song}-${i}`}
                          onClick={() => setSelectedMatch(selectedMatch === `${song.song}-${i}` ? null : `${song.song}-${i}`)}
                          onNavigate={selectSong}
                        />
                      ))}
                    </div>
                  );
                });
              })()
            )}
          </div>

          {/* Status bar */}
          <div style={{
            padding: '6px 20px',
            borderTop: '1px solid #1a1a22',
            background: '#0a0a0d',
            display: 'flex', gap: 20, alignItems: 'center',
            fontSize: 11, color: '#444',
          }}>
            <span>{songs.length} songs</span>
            <span>·</span>
            <span>{matches.length} total matches</span>
            {fileName && <><span>·</span><span style={{ color: '#555' }}>{fileName}</span></>}
            <div style={{ flex: 1 }}/>
            <span>BPM ±{tolerance}</span>
            <span>·</span>
            <span>relative keys {allowRelative ? 'on' : 'off'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const btnStyle = {
  background: '#1a1a22',
  border: '1px solid #2a2a35',
  borderRadius: 6,
  color: '#aaa',
  cursor: 'pointer',
  padding: '6px 12px',
  fontSize: 12,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'all 0.15s',
};
