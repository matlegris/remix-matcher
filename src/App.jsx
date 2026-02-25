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

function SortHeader({ label, sortKey, current, onToggle, align = 'left', invertArrow = false }) {
  const active = current.key === sortKey;
  const isAsc = invertArrow ? current.dir !== 'asc' : current.dir === 'asc';
  const arrow = active ? (isAsc ? ' ↑' : ' ↓') : ' ↕';
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
          {bpmDiff % 1 === 0 ? String(Math.round(bpmDiff)) : bpmDiff.toFixed(1)}
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
  const [keyFilter, setKeyFilter] = useState(null);
  const [keyPickerOpen, setKeyPickerOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef();
  const addFileRef = useRef();
  const toleranceRef = useRef(tolerance);
  toleranceRef.current = tolerance;
  const songListRef = useRef();
  const songItemRefs = useRef({});
  const keyPickerRef = useRef();

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
  const allKeys = [...new Set(songs.map(s => s.key))].sort((a, b) => a.localeCompare(b));
  const filteredSongs = songs
    .map((s, i) => ({ ...s, _idx: i }))
    .filter(s => (!searchTerm || s.song.toLowerCase().includes(searchTerm.toLowerCase()) || s.artist.toLowerCase().includes(searchTerm.toLowerCase())) && (!keyFilter || s.key === keyFilter))
    .sort((a, b) => {
      if (!songSort.key) return a._idx - b._idx; // original order
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

        {/* BPM Tolerance — only shown when songs are loaded */}
        {songs.length > 0 && <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
        </div>}

        {/* Relative keys toggle — only shown when songs loaded */}
        {songs.length > 0 &&
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
        </div>}

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

        {/* Left: Song list — hidden when empty */}
        {songs.length > 0 && <div style={{
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
              alignItems: 'center', position: 'relative',
            }}>
              {[['az','A–Z'],['bpm','BPM'],['key','Key']].map(([k, label]) => {
                const active = songSort.key === k;
                const isKeySort = k === 'key';
                // For key sort: ↓ = A→G (asc), ↑ = G→A (desc) — inverted display
                const arrow = active
                  ? (isKeySort ? (songSort.dir === 'asc' ? '↓' : '↑') : (songSort.dir === 'asc' ? '↑' : '↓'))
                  : '↕';
                return (
                  <div key={k} style={{
                    display: 'flex', alignItems: 'center',
                    background: active ? '#00c26618' : 'transparent',
                    border: `1px solid ${active ? '#00c26640' : '#1e1e28'}`,
                    borderRadius: 4, overflow: 'hidden',
                    transition: 'all 0.15s',
                  }}>
                    {/* Label: click to activate/deactivate */}
                    <span
                      onClick={() => {
                        if (active) {
                          setSongSort({ key: null, dir: 'asc' }); // deactivate
                        } else {
                          setSongSort({ key: k, dir: 'asc' }); // activate
                        }
                      }}
                      style={{
                        padding: '2px 6px 2px 8px',
                        color: active ? '#00c266' : '#444',
                        cursor: 'pointer', fontSize: 10,
                        userSelect: 'none',
                      }}
                    >{label}</span>
                    {/* Arrow: click to cycle direction (only when active) */}
                    <span
                      onClick={() => {
                        if (active) {
                          setSongSort(prev => ({ ...prev, dir: prev.dir === 'asc' ? 'desc' : 'asc' }));
                        } else {
                          setSongSort({ key: k, dir: 'asc' });
                        }
                      }}
                      style={{
                        padding: '2px 6px 2px 2px',
                        color: active ? '#00c266' : '#333',
                        cursor: 'pointer', fontSize: 10,
                        opacity: active ? 1 : 0.3,
                        userSelect: 'none',
                      }}
                    >{arrow}</span>
                  </div>
                );
              })}
              {/* Key filter picker */}
              <div ref={keyPickerRef} style={{ marginLeft: 'auto', position: 'relative' }}>
                <div
                  style={{
                    display: 'flex', alignItems: 'center',
                    background: keyFilter ? '#00c26618' : 'transparent',
                    border: `1px solid ${keyFilter ? '#00c26640' : '#1e1e28'}`,
                    borderRadius: 4, overflow: 'hidden',
                    transition: 'all 0.15s',
                  }}
                >
                  <span
                    onClick={() => setKeyPickerOpen(o => !o)}
                    style={{
                      padding: '2px 4px 2px 8px',
                      color: keyFilter ? '#00c266' : '#444',
                      cursor: 'pointer', fontSize: 10,
                      textTransform: 'uppercase', letterSpacing: 0.8,
                      userSelect: 'none',
                    }}
                  >{keyFilter ? keyFilter : 'Filter Key'}</span>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      if (keyFilter) {
                        setKeyFilter(null);
                      } else {
                        setKeyPickerOpen(o => !o);
                      }
                    }}
                    style={{
                      padding: '2px 8px 2px 2px',
                      color: keyFilter ? '#00c266' : '#333',
                      cursor: 'pointer', fontSize: 10,
                      opacity: keyFilter ? 1 : 0.4,
                      userSelect: 'none',
                    }}
                  >{keyFilter ? '×' : '▾'}</span>
                </div>
                {keyPickerOpen && (
                  <div style={{
                    position: 'absolute', top: '100%', right: 0, marginTop: 4,
                    background: '#13131e', border: '1px solid #2a2a38',
                    borderRadius: 8, padding: 6, zIndex: 100,
                    maxHeight: 260, overflowY: 'auto', width: 130,
                    boxShadow: '0 8px 32px #00000080',
                  }}>
                    <div
                      onClick={() => { setKeyFilter(null); setKeyPickerOpen(false); }}
                      style={{
                        padding: '5px 10px', borderRadius: 4, cursor: 'pointer',
                        fontSize: 11, color: !keyFilter ? '#00c266' : '#888',
                        background: !keyFilter ? '#00c26618' : 'transparent',
                        marginBottom: 4, fontWeight: 600,
                      }}
                    >All keys</div>
                    {allKeys.map(k => {
                      const color = ({
                        'C':'#FF6B6B','C#':'#FF8E53','D':'#FFA940','D#':'#FFD666',
                        'E':'#BAE637','F':'#36CFC9','F#':'#40A9FF','G':'#597EF7',
                        'G#':'#9254DE','A':'#C41D7F','A#':'#EB2F96','B':'#FF85C2',
                        'A min':'#FF6B6B','A# min':'#FF8E53','B min':'#FFA940','C min':'#FFD666',
                        'C# min':'#BAE637','D min':'#36CFC9','D# min':'#40A9FF','E min':'#597EF7',
                        'F min':'#9254DE','F# min':'#C41D7F','G min':'#EB2F96','G# min':'#FF85C2',
                      })[k] || '#888';
                      const isActive = keyFilter === k;
                      return (
                        <div
                          key={k}
                          onClick={() => { setKeyFilter(isActive ? null : k); setKeyPickerOpen(false); }}
                          style={{
                            padding: '5px 10px', borderRadius: 4, cursor: 'pointer',
                            fontSize: 11, display: 'flex', alignItems: 'center', gap: 6,
                            background: isActive ? color + '22' : 'transparent',
                            color: isActive ? color : '#888',
                            fontWeight: isActive ? 700 : 400,
                          }}
                          onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#ffffff08'; }}
                          onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                        >
                          <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0, display: 'inline-block' }} />
                          {k}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
          <div ref={songListRef} style={{ flex: 1, overflowY: 'auto' }}>
            {songs.length === 0 ? (
              <div style={{ padding: '20px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>How to get started</div>
                {[
                  { n: '1', text: 'Go to Exportify and connect your Spotify account' },
                  { n: '2', text: 'Select a playlist and click Export' },
                  { n: '3', text: 'Save the CSV file to your computer' },
                  { n: '4', text: 'Load it here using the button above' },
                ].map(({ n, text }) => (
                  <div key={n} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                      background: '#00c26620', border: '1px solid #00c26640',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, color: '#00c266',
                    }}>{n}</div>
                    <div style={{ fontSize: 12, color: '#666', lineHeight: 1.5, paddingTop: 2 }}>{text}</div>
                  </div>
                ))}
                <a
                  href="https://exportify.net"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    marginTop: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    background: '#1DB954',
                    color: '#000', fontWeight: 700, fontSize: 12,
                    padding: '10px 0', borderRadius: 8,
                    textDecoration: 'none',
                    transition: 'opacity 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  <span style={{ fontSize: 16 }}>♫</span> Open Exportify
                </a>
                <div
                  onDrop={handleDrop}
                  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onClick={() => fileRef.current.click()}
                  style={{
                    borderRadius: 8,
                    border: `2px dashed ${isDragging ? '#00c266' : '#1e1e28'}`,
                    padding: '16px 10px', textAlign: 'center',
                    background: isDragging ? '#00c26608' : 'transparent',
                    transition: 'all 0.2s', cursor: 'pointer',
                    color: '#3a3a4a', fontSize: 11,
                  }}
                >
                  {isDragging ? '✓ Drop to load' : 'or drag & drop CSV here'}
                </div>
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
                      padding: '5px 14px', cursor: 'pointer',
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
                        <div style={{ fontSize: 10, color: '#555', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
        </div>}

        {/* Right: Matches */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Matches header — hidden when no songs */}
          {songs.length > 0 && <div style={{
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
          </div>}

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
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                height: '100%', padding: '32px 40px', textAlign: 'center', overflowY: 'auto',
              }}>
                {/* Hero */}
                <div style={{ fontSize: 44, marginBottom: 12, lineHeight: 1 }}>🎧</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#e8e8ea', marginBottom: 8, letterSpacing: -0.8 }}>
                  Find your perfect mix
                </div>
                <div style={{ fontSize: 14, color: '#555', maxWidth: 340, lineHeight: 1.6, marginBottom: 28 }}>
                  Upload your Spotify playlist. Find matches instantly.
                </div>

                {/* Feature cards */}
                <div style={{ display: 'flex', gap: 12, marginBottom: 32, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {[
                    { icon: '🎵', label: 'Key matching', desc: 'With exact / relative keys' },
                    { icon: '🥁', label: 'BPM matching', desc: 'Half / double time' },
                    { icon: '🔀', label: 'Smart sorting', desc: 'A–Z, BPM, and key' },
                  ].map(({ icon, label, desc }) => (
                    <div key={label} style={{
                      background: '#0d0d16', border: '1px solid #1e1e2e',
                      borderRadius: 12, padding: '16px 20px', minWidth: 130, textAlign: 'left',
                    }}>
                      <div style={{ fontSize: 20, marginBottom: 8 }}>{icon}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#ccc', marginBottom: 3 }}>{label}</div>
                      <div style={{ fontSize: 11, color: '#4a4a5a', lineHeight: 1.4 }}>{desc}</div>
                    </div>
                  ))}
                </div>

                {/* Exportify CTA */}
                <a
                  href="https://exportify.net"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    background: '#1DB954', color: '#000',
                    fontWeight: 800, fontSize: 14,
                    padding: '13px 30px', borderRadius: 50,
                    textDecoration: 'none',
                    boxShadow: '0 4px 24px #1DB95450',
                    transition: 'all 0.2s', marginBottom: 6,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.04)'; e.currentTarget.style.boxShadow = '0 6px 32px #1DB95470'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 24px #1DB95450'; }}
                >
                  <span style={{ fontSize: 16 }}>♫</span> Get your Spotify playlist
                </a>
                <div style={{ fontSize: 11, color: '#333', marginBottom: 28 }}>
                  Free · No account needed
                </div>

                {/* Steps */}
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: 10,
                  marginBottom: 24, width: '100%', maxWidth: 360, textAlign: 'left',
                }}>
                  {[
                    'Open Exportify and connect Spotify',
                    'Choose your playlist and export the CSV',
                    'Upload the CSV below',
                  ].map((text, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                        background: '#00c26618', border: '1px solid #00c26640',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 800, color: '#00c266',
                      }}>{i + 1}</div>
                      <div style={{ fontSize: 13, color: '#666' }}>{text}</div>
                    </div>
                  ))}
                </div>

                {/* Drop zone */}
                <div
                  onDrop={handleDrop}
                  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onClick={() => fileRef.current.click()}
                  style={{
                    width: '100%', maxWidth: 440,
                    borderRadius: 16,
                    border: `2px dashed ${isDragging ? '#00c266' : '#1e1e30'}`,
                    padding: '36px 30px',
                    textAlign: 'center',
                    background: isDragging ? '#00c26610' : '#09090f',
                    transition: 'all 0.2s', cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{isDragging ? '✓' : '☁'}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: isDragging ? '#00c266' : '#2e2e48', marginBottom: 4 }}>
                    {isDragging ? 'Drop to load' : 'Drag & drop CSV here'}
                  </div>
                  {!isDragging && <div style={{ fontSize: 11, color: '#1e1e30' }}>or click Load CSV in the top right</div>}
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
