import React, { useState, useCallback, useRef, useEffect } from "react";

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
        mode: parseInt(r['Mode']) || 0,
        energy: r['Energy'] != null && r['Energy'] !== '' ? parseFloat(r['Energy']) : null,
        danceability: r['Danceability'] != null && r['Danceability'] !== '' ? parseFloat(r['Danceability']) : null,
        valence: r['Valence'] != null && r['Valence'] !== '' ? parseFloat(r['Valence']) : null,
        loudness: r['Loudness'] != null && r['Loudness'] !== '' ? parseFloat(r['Loudness']) : null,
        instrumentalness: r['Instrumentalness'] != null && r['Instrumentalness'] !== '' ? parseFloat(r['Instrumentalness']) : null,
        speechiness: r['Speechiness'] != null && r['Speechiness'] !== '' ? parseFloat(r['Speechiness']) : null,
        acousticness: r['Acousticness'] != null && r['Acousticness'] !== '' ? parseFloat(r['Acousticness']) : null,
        popularity: r['Popularity'] != null && r['Popularity'] !== '' ? parseInt(r['Popularity']) : null,
        timeSignature: r['Time Signature'] != null && r['Time Signature'] !== '' ? parseInt(r['Time Signature']) : null,
        genres: (r['Genres'] || '').trim(),
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

// Score a match 0-100 based on slider weights. Key+BPM are prerequisites (already filtered).
function scoreMatch(a, b, matchMood, matchEnergy, matchMix) {
  if (!matchMood && !matchEnergy && !matchMix) return null;
  let total = 0, maxTotal = 0;

  const delta = (va, vb, w) => {
    if (va == null || vb == null) return;
    total += Math.max(0, 1 - Math.abs(va - vb)) * w; maxTotal += w;
  };
  const deltaLoud = (va, vb, w) => {
    if (va == null || vb == null) return;
    total += Math.max(0, 1 - Math.abs(va - vb) / 20) * w; maxTotal += w;
  };
  const deltaPop = (va, vb, w) => {
    if (va == null || vb == null) return;
    total += Math.max(0, 1 - Math.abs(va - vb) / 100) * w; maxTotal += w;
  };

  if (matchMood) {
    delta(a.valence, b.valence, 8);
    const modeMatch = a.mode === b.mode ? 1 : 0;
    total += modeMatch * 5; maxTotal += 5;
    const ag = a.genres ? a.genres.toLowerCase().split(/[,;]/).map(g => g.trim()).filter(Boolean) : [];
    const bg = b.genres ? b.genres.toLowerCase().split(/[,;]/).map(g => g.trim()).filter(Boolean) : [];
    if (ag.length && bg.length) {
      const overlap = ag.filter(g => bg.some(x => x.includes(g) || g.includes(x))).length;
      total += Math.min(1, overlap / Math.min(ag.length, bg.length)) * 10; maxTotal += 10;
    }
  }

  if (matchEnergy) {
    delta(a.energy, b.energy, 10);
    delta(a.danceability, b.danceability, 5);
    deltaLoud(a.loudness, b.loudness, 5);
    deltaPop(a.popularity, b.popularity, 4);
  }

  if (matchMix) {
    delta(a.instrumentalness, b.instrumentalness, 5);
    delta(a.speechiness, b.speechiness, 5);
    delta(a.acousticness, b.acousticness, 2);
  }

  if (maxTotal === 0) return null;
  return Math.round((total / maxTotal) * 100);
}

function SliderTooltip({ label, color, metrics, children }) {
  const [show, setShow] = React.useState(false);
  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div style={{
          position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
          marginTop: 8, zIndex: 200,
          background: '#141a28', border: `1px solid ${color}44`,
          borderRadius: 10, padding: '10px 14px',
          minWidth: 230, boxShadow: '0 8px 32px #00000080',
          pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, color, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
          {metrics.map(({ name, desc }) => (
            <div key={name} style={{ display: 'flex', gap: 6, marginBottom: 5, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color, minWidth: 90, flexShrink: 0 }}>{name}</span>
              <span style={{ fontSize: 10, color: '#6a7a9a', lineHeight: 1.4 }}>{desc}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScoreBar({ score }) {
  if (score == null) return <div style={{ width: '100%' }} />;
  const color = score >= 80 ? '#00c266' : score >= 55 ? '#f5a623' : '#e05555';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, width: '100%', padding: '0 6px', boxSizing: 'border-box' }}>
      <div style={{ width: '100%', height: 4, borderRadius: 2, background: '#1c2235', overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 9, color, fontWeight: 800, fontFamily: 'monospace' }}>{score}%</span>
    </div>
  );
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

function KeyBadge({ keyName, onDoubleClick }) {
  const color = KEY_COLORS[keyName] || '#666';
  return (
    <span
      onDoubleClick={onDoubleClick}
      style={{
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
        cursor: onDoubleClick ? 'pointer' : 'default',
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
      background: '#3a4a6622', color: '#aaa',
      border: '1px solid #ffffff22',
      borderRadius: 4, padding: '1px 7px',
      fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
    }}>{type} BPM</span>
  );
}

// Card shown at the top when a song is selected
function AnchorCard({ song, onArtistFilter, artistFilter, onJumpToKey, onScrollTo }) {
  return (
    <div style={{
      margin: '12px 20px 8px',
      padding: '12px 16px',
      background: '#00c26610',
      border: '1px solid #00c26650',
      borderRadius: 10,
      boxShadow: '0 0 0 1px #00c26620',
    }}>
      <div
        onClick={onScrollTo ? () => onScrollTo(song) : undefined}
        title={onScrollTo ? 'Scroll to in column A' : undefined}
        style={{ fontSize: 16, fontWeight: 600, color: '#f0f0f0', cursor: onScrollTo ? 'pointer' : 'default', display: 'inline-block' }}
        onMouseEnter={onScrollTo ? e => { e.currentTarget.style.color = '#00c266'; e.currentTarget.style.textDecoration = 'underline'; } : undefined}
        onMouseLeave={onScrollTo ? e => { e.currentTarget.style.color = '#f0f0f0'; e.currentTarget.style.textDecoration = 'none'; } : undefined}
      >{song.song}</div>
      <div style={{ marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: '0 4px' }}>
        {song.artist.split(/;\s*|,\s+(?=[A-Z])/).map((a, ai, arr) => (
          <span key={ai} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            <span
              onClick={e => { e.stopPropagation(); onArtistFilter(a.trim()); }}
              style={{ fontSize: 12, color: artistFilter === a.trim() ? '#00c266' : '#7a8aaa', cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#00c266'; e.currentTarget.style.textDecoration = 'underline'; }}
              onMouseLeave={e => { e.currentTarget.style.color = artistFilter === a.trim() ? '#00c266' : '#7a8aaa'; e.currentTarget.style.textDecoration = 'none'; }}
            >{a.trim()}</span>
            {artistFilter === a.trim() && (
              <span onClick={e => { e.stopPropagation(); onArtistFilter(null); }} style={{ fontSize: 11, color: '#00c266', cursor: 'pointer' }}>×</span>
            )}
            {ai < arr.length - 1 && <span style={{ fontSize: 12, color: '#4a5a7a' }}>,</span>}
          </span>
        ))}
      </div>
      <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#aaa', fontFamily: 'monospace' }}>{song.bpm} BPM</span>
        <KeyBadge keyName={song.key} onDoubleClick={onJumpToKey ? e => { e.stopPropagation(); onJumpToKey(song.key); } : undefined} />
        {song.relativeKey && <span style={{ fontSize: 11, color: '#6a7a9a' }}>rel. <KeyBadge keyName={song.relativeKey} onDoubleClick={onJumpToKey ? e => { e.stopPropagation(); onJumpToKey(song.relativeKey); } : undefined} /></span>}
      </div>
    </div>
  );
}

// A single match row — just the "other" track
function MatchRow({ match, anchor, selected, pinned, onClick, onNavigate, onScrollTo, onArtistFilter, onJumpToKey }) {
  const other = match.a.song === anchor?.song ? match.b : match.a;
  const { bpmDiff, keyMatch, bpmMatch, score } = match;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 70px 90px 90px',
        alignItems: 'center',
        gap: 12,
        padding: '10px 20px',
        borderBottom: pinned ? 'none' : '1px solid #ffffff07',
        background: pinned ? '#00c26610' : selected ? '#3a4a6618' : 'transparent',
        border: pinned ? '1px solid #00c26640' : undefined,
        borderRadius: pinned ? 10 : undefined,
        margin: pinned ? '12px 20px 0' : undefined,
        padding: pinned ? '12px 16px' : '10px 20px',
        transition: 'background 0.12s',
      }}
      onMouseEnter={e => { if (!selected && !pinned) e.currentTarget.style.background = '#3a4a6608'; }}
      onMouseLeave={e => { if (!selected && !pinned) e.currentTarget.style.background = 'transparent'; }}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <div
            onClick={onNavigate ? (e) => { e.stopPropagation(); onNavigate(other); } : onClick}
            style={{
              fontSize: 13, color: '#f0f0f0', fontWeight: 500,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              cursor: 'pointer', flexShrink: 1, minWidth: 0,
            }}
            title={onNavigate ? `Select in column A` : undefined}
            onMouseEnter={e => { e.currentTarget.style.color = '#00c266'; e.currentTarget.style.textDecoration = 'underline'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#f0f0f0'; e.currentTarget.style.textDecoration = 'none'; }}
          >{other.song}</div>
          {bpmMatch !== 'exact' && <BpmBadge type={bpmMatch} />}
        </div>
        <div style={{ marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: '0 4px' }}>
          {other.artist.split(/;\s*|,\s+(?=[A-Z])/).map((a, ai, arr) => (
            <span key={ai} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              <span
                onClick={onArtistFilter ? e => { e.stopPropagation(); onArtistFilter(a.trim()); } : undefined}
                style={{ fontSize: 11, color: pinned ? '#7a8aaa' : '#6a7a9a', cursor: onArtistFilter ? 'pointer' : 'default' }}
                onMouseEnter={onArtistFilter ? e => { e.currentTarget.style.textDecoration = 'underline'; e.currentTarget.style.color = '#00c266'; } : undefined}
                onMouseLeave={onArtistFilter ? e => { e.currentTarget.style.textDecoration = 'none'; e.currentTarget.style.color = pinned ? '#7a8aaa' : '#6a7a9a'; } : undefined}
              >{a.trim()}</span>
              {ai < arr.length - 1 && <span style={{ fontSize: 11, color: '#4a5a7a' }}>,</span>}
            </span>
          ))}
        </div>
        <div style={{ marginTop: 4, display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#888', fontFamily: 'monospace' }}>{other.bpm} BPM</span>
          <KeyBadge keyName={other.key} onDoubleClick={onJumpToKey ? e => { e.stopPropagation(); onJumpToKey(other.key); } : undefined} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        <ScoreBar score={score} />
      </div>
      <div style={{ textAlign: 'center', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }} onClick={onClick}>
        <div style={{ fontSize: 18, color: '#00c266', fontFamily: 'inherit', fontWeight: 800, letterSpacing: -0.5, lineHeight: 1 }}>
          {bpmDiff % 1 === 0 ? String(Math.round(bpmDiff)) : bpmDiff.toFixed(1)}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
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
      <span style={{ fontSize: 11, color: '#5a6a8a', transition: 'transform 0.15s', display: 'inline-block', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#d8d8e0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.song}</span>
        <span style={{ fontSize: 11, color: '#6a7a9a', marginLeft: 8 }}>{song.artist}</span>
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
  const [colAWidth, setColAWidth] = useState(340);
  const colADragRef = useRef(null);
  // Unified multi-sort: max 2 active sorts, newest = primary
  const [activeSortList, setActiveSortList] = useState([]); // [{key:'az'|'bpm'|'key', dir:'asc'|'desc'}]
  const getSortDir = (k) => (activeSortList.find(s => s.key === k) || {}).dir || null;
  const azSortDir = getSortDir('az');
  const bpmSortDir = getSortDir('bpm');
  const keySortDir = getSortDir('key');
  // Keep songSort as alias for AZ sort for backwards compat in minor places
  const songSort = { key: azSortDir ? 'az' : null, dir: azSortDir || 'asc' };
  const [matchSort, setMatchSort] = useState({ key: 'bpm', dir: 'asc' });
  const [keyFilters, setKeyFilters] = useState(new Set());
  const [azPickerOpen, setAzPickerOpen] = useState(false);
  const [bpmPickerOpen, setBpmPickerOpen] = useState(false);
  const [bpmFilterVal, setBpmFilterVal] = useState('');
  const bpmPickerRef = useRef();
  const [azSortTarget, setAzSortTarget] = useState('song'); // 'song' | 'artist'
  const azPickerRef = useRef();
  const [keyPickerOpen, setKeyPickerOpen] = useState(false);
  const [artistFilter, setArtistFilter] = useState(null);
  const [fileNames, setFileNames] = useState([]);
  const [toleranceInput, setToleranceInput] = useState('10');
  const [vibeWeight, setVibeWeight] = useState(false);
  const [sonicsWeight, setSonicsWeight] = useState(false);
  const [utilityWeight, setUtilityWeight] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef();
  const addFileRef = useRef();
  const toleranceRef = useRef(tolerance);
  toleranceRef.current = tolerance;
  const songListRef = useRef();
  const songItemRefs = useRef({});
  const matchListRef = useRef();
  const suggestQueueRef = useRef([]); // shuffled queue to avoid repeats
  const keyPickerRef = useRef();

  // Cycle a sort: off→firstDir→secondDir→off; max 2 active at once (drop oldest on 3rd)
  const cycleSort = useCallback((sortKey, firstDir, secondDir) => {
    setActiveSortList(prev => {
      const existing = prev.find(s => s.key === sortKey);
      if (existing) {
        // Already active — cycle dir or turn off (in place, preserving order)
        if (existing.dir === firstDir) {
          return prev.map(s => s.key === sortKey ? { ...s, dir: secondDir } : s);
        } else {
          return prev.filter(s => s.key !== sortKey);
        }
      }
      // A-Z ↔ BPM are mutually exclusive
      const conflictsWithAz = sortKey === 'bpm' && prev.some(s => s.key === 'az');
      const azConflictsWithBpm = sortKey === 'az' && prev.some(s => s.key === 'bpm');
      if (conflictsWithAz || azConflictsWithBpm) {
        const kept = prev.filter(s => s.key !== 'az' && s.key !== 'bpm');
        // A-Z always goes last (tiebreaker); BPM goes first (primary)
        return sortKey === 'az'
          ? [...kept, { key: sortKey, dir: firstDir }]
          : [{ key: sortKey, dir: firstDir }, ...kept];
      }
      // A-Z always sits at the END (tiebreaker) regardless of click order
      // KEY and BPM always sit at the START (primary)
      if (sortKey === 'az') {
        // A-Z: drop oldest non-az if at capacity, always append last
        const withoutAz = prev.filter(s => s.key !== 'az');
        const trimmed = withoutAz.length >= 2 ? withoutAz.slice(1) : withoutAz;
        return [...trimmed, { key: sortKey, dir: firstDir }];
      } else {
        // KEY or BPM: always prepend (primary), push A-Z to back if present
        const az = prev.find(s => s.key === 'az');
        const rest = prev.filter(s => s.key !== 'az' && s.key !== sortKey);
        const trimmed = rest.length >= (az ? 1 : 2) ? rest.slice(1) : rest;
        return az
          ? [{ key: sortKey, dir: firstDir }, ...trimmed, az]
          : [{ key: sortKey, dir: firstDir }, ...trimmed];
      }
    });
  }, []);

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
    setFileNames(prev => replace ? [name] : [...prev.filter(n => n !== name), name]);
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
    const n = Math.max(0, Math.min(50, val));
    setTolerance(n);
    setToleranceInput(String(n));
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
    if (matchListRef.current) matchListRef.current.scrollTo({ top: 0, behavior: 'smooth' });
  }, [selectedSong]);

  const scrollToSong = useCallback((song) => {
    if (songItemRefs.current[song.song]) {
      songItemRefs.current[song.song].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, []);

  const suggest = useCallback(() => {
    if (!matches.length) return;
    const shuffle = arr => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    // If queue is empty or stale, rebuild it
    if (!suggestQueueRef.current.length) {
      // Only use matches where m.a has at least one match (all entries in matches qualify)
      // Score each match; fall back to inverse bpmDiff when all toggles off
      const anyToggles = vibeWeight || sonicsWeight || utilityWeight;
      const scored = matches.map(m => ({
        m,
        score: anyToggles
          ? (scoreMatch(m.a, m.b, vibeWeight, sonicsWeight, utilityWeight) ?? 0)
          : Math.max(0, 100 - m.bpmDiff * 10), // rank by BPM closeness when no toggles
      }));
      // Group by score, shuffle within each group, then flatten highest→lowest
      const groups = {};
      scored.forEach(item => {
        const key = item.score;
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
      });
      const sorted = Object.keys(groups).map(Number).sort((a, b) => b - a);
      suggestQueueRef.current = sorted.flatMap(score => shuffle(groups[score]));
    }
    const pick = suggestQueueRef.current.shift();
    if (!pick) return;
    const anchor = pick.m.a;
    setHistory(prev => selectedSong ? [...prev, selectedSong] : prev);
    setSelectedSong(anchor);
    setSelectedMatch(null);
    if (matchListRef.current) matchListRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      setSelectedMatch(() => {
        const anchorMatches = matches.filter(m => m.a.song === anchor.song || m.b.song === anchor.song);
        const bestIdx = anchorMatches
          .map((m, i) => ({ i, score: scoreMatch(m.a, m.b, vibeWeight, sonicsWeight, utilityWeight) ?? 0 }))
          .sort((a, b) => b.score - a.score)[0];
        return bestIdx ? bestIdx.i : 0;
      });
    }, 80);
  }, [matches, vibeWeight, sonicsWeight, utilityWeight, selectedSong]);

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

  const jumpToKey = useCallback((keyName) => {
    setActiveSortList(prev => {
      const without = prev.filter(s => s.key !== 'key');
      const trimmed = without.length >= 2 ? without.slice(1) : without;
      return [...trimmed, { key: 'key', dir: 'asc' }];
    });
    // After sort updates, scroll to first song with that key
    setTimeout(() => {
      if (!songListRef.current) return;
      const items = songListRef.current.querySelectorAll('[data-key]');
      for (const el of items) {
        if (el.getAttribute('data-key') === keyName) {
          el.scrollIntoView({ block: 'start', behavior: 'smooth' });
          break;
        }
      }
    }, 50);
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

  // Close pickers on outside click
  useEffect(() => {
    const handler = e => {
      if (keyPickerRef.current && !keyPickerRef.current.contains(e.target)) setKeyPickerOpen(false);
      if (azPickerRef.current && !azPickerRef.current.contains(e.target)) setAzPickerOpen(false);
      if (bpmPickerRef.current && !bpmPickerRef.current.contains(e.target)) setBpmPickerOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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
    .filter(s => (!searchTerm || s.song.toLowerCase().includes(searchTerm.toLowerCase()) || s.artist.toLowerCase().includes(searchTerm.toLowerCase())) && (keyFilters.size === 0 || keyFilters.has(s.key)) && (!bpmFilterVal || Math.abs(s.bpm - parseInt(bpmFilterVal)) <= tolerance))
    .sort((a, b) => {
      // Artist filter pinning: matching artist floats to top
      if (artistFilter) {
        const aMatch = a.artist.split(/;\s*|,\s+(?=[A-Z])/).map(x => x.trim()).includes(artistFilter) ? 0 : 1;
        const bMatch = b.artist.split(/;\s*|,\s+(?=[A-Z])/).map(x => x.trim()).includes(artistFilter) ? 0 : 1;
        if (aMatch !== bMatch) return aMatch - bMatch;
      }
      // Multi-sort using activeSortList (newest = primary)
      if (activeSortList.length === 0) return a._idx - b._idx;
      for (const { key: sk, dir } of activeSortList) {
        let c = 0;
        if (sk === 'az') {
          const alpha = s => /^[a-zA-Z]/.test(s) ? 0 : 1;
          const field = azSortTarget === 'artist' ? 'artist' : 'song';
          const ap = alpha(a[field]), bp = alpha(b[field]);
          c = ap !== bp ? ap - bp : a[field].localeCompare(b[field], undefined, { sensitivity: 'base' });
        } else if (sk === 'bpm') {
          c = a.bpm - b.bpm;
        } else if (sk === 'key') {
          c = a.key.localeCompare(b.key);
        }
        if (dir === 'desc') c = -c;
        if (c !== 0) return c;
      }
      return 0;
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
    .map(m => ({ ...m, score: scoreMatch(m.a, m.b, vibeWeight, sonicsWeight, utilityWeight) }))
    .sort((a, b) => {
      const getOther = m => m.a.song === selectedSong?.song ? m.b : m.a;
      let cmp = 0;
      if (matchSort.key === 'az') cmp = getOther(a).song.localeCompare(getOther(b).song);
      else if (matchSort.key === 'bpm') cmp = a.bpmDiff - b.bpmDiff;
      else if (matchSort.key === 'key') cmp = getOther(a).key.localeCompare(getOther(b).key);
      else if (matchSort.key === 'score') cmp = (b.score ?? -1) - (a.score ?? -1);
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
        background: '#0d1017',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABAAAAAKrCAYAAABvFv+UAAEAAElEQVR4nOz955srSZbfeX6PmQMIebVWqbNUdlW1ZrO7hz3LFbNv5v/d5e48M9wZTpNNsptsXaJLpBZX3xCAu9nZF2bucCAQV2Vm3arK36eerIiAdDgAv36OHTsGIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIjJir3oDRETkFXnZfwH8K92Kr0AA8uiniIiIiGzSvOoNEBGRV8AAC6tJgPXA/mmBvmXwL5FDeJ47PjPREE75WSyfYnNS4NcujyEiIiLyNVMFgIjIN5GNf9aRcx+PpG8wjphrAuBLb4PVx13/ufH517frlO2sAf9pCYD+VSoBICIiIt80SgCIiHwDGc8Kn086GTCHL/+vyErgf9oW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dntG27akFsJ2S9O2TKdTptMp1jajEfxR0F++rFMDUkpEnK5WCcRIXHT0hx3zwyP6ow5f9BztH0AXSfM+JwHmkfnBIQf7+/T7R/hufpxFZyy6HOhHlhF5PU+lkd94dYBUj2vTFAzIqxXU1RDKa2uCpk4RqKe17m5cCTJq33BqbwgRERGRb5ISACIiz+uEef4b716vCnBofXUEeVxFsKlgYAja64PJygO+8kKz3K0/Rt+4raruG9aC4Ql5mLwhd7iftjCders9Y7I1y833piEnDbYmbG1t5QRAE4amfeOy/2SUkvpRAiAlDhfzoRog9j3d0YLFwRHdwYK06ODwqAT4yYixzIFI0PlqoD9+7+WQjYaui+V9WnnYqQsxuuWGgssX+ChxUjYYR937fZl/GSdtxvmXcUJg/T51/xMREZHvAiUARESex6Y5/qMy8fWHNq0UUEekh+B7XTp9tYH6emM54u7ueNlrEya5HN9XywRqcF7L9919ufzfpve3fhtsWUffUJIFlifQQ85A1H+U5w3LC659bSWJ4SWo770E+mV/68Ppo+X0xm0F1g9/Vdj49TiXUneSm/qnzaP448/J2Fx9Mbxgw9fDS8vqDyduQEREROTroQSAiMjzeMoEQLl7c4+AuoTc+vSA8fb8eG/5Gja2FlYC/vyS5RHU+53cWd8J4JGVsf+yv9phv47U404IrDbvq/P165Zbjge44+Pf9F+Y8X0rJ2X5tY3uC0CwUk2QnEQiEEijID2QkyghtxUguJV3F1bOjZFXKYieSkuEBujLOUtDnUB9VV9SJCvVF+P3sH7sJwX+o6TF8l1R1jwQERER+eYoASAi8ryeYgrAhodP386GF22cDvA8+xkC/+MJgOfyVfwX5An7ftIuag5l0+1xq6mUMkGBej42nJ3TGzueduwq8xcRERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERka/U/x+gWQadh5nSTQAAAABJRU5ErkJggg==" alt="logo" style={{ height: 52, width: 'auto' }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.3 }}>Remix Matcher</div>

          </div>
        </div>

        {/* Center: BPM tolerance */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          {songs.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: '#6a7a9a' }}>BPM Tolerance</span>
              <button
                onClick={() => handleTolerance(tolerance - 1)}
                style={{ ...btnStyle, width: 24, height: 24, padding: 0, fontSize: 14 }}
                onMouseEnter={e => { e.currentTarget.style.background = '#2a3348'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#3a3a50'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#1c2235'; e.currentTarget.style.color = '#aaa'; e.currentTarget.style.borderColor = '#2a3348'; }}
              >−</button>
              <input
                value={toleranceInput}
                onChange={e => setToleranceInput(e.target.value)}
                onBlur={() => { const n = parseInt(toleranceInput); if (!isNaN(n) && n >= 0) handleTolerance(n); else setToleranceInput(String(tolerance)); }}
                onKeyDown={e => { if (e.key === 'Enter') { const n = parseInt(toleranceInput); if (!isNaN(n)) handleTolerance(n); } }}
                style={{
                  background: '#1c2235', border: '1px solid #2a2a35',
                  borderRadius: 6, padding: '4px 0',
                  fontSize: 14, fontWeight: 700, fontFamily: 'monospace',
                  color: '#00c266', width: 48, textAlign: 'center',
                  outline: 'none',
                }}
              />
              <button
                onClick={() => handleTolerance(tolerance + 1)}
                style={{ ...btnStyle, width: 24, height: 24, padding: 0, fontSize: 14 }}
                onMouseEnter={e => { e.currentTarget.style.background = '#2a3348'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#3a3a50'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#1c2235'; e.currentTarget.style.color = '#aaa'; e.currentTarget.style.borderColor = '#2a3348'; }}
              >+</button>
            </div>
          )}
        </div>

        {/* Scoring toggles */}
        {songs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, justifyContent: 'center' }}>
            {[
              { label: 'MOOD', val: vibeWeight, set: setVibeWeight, color: '#a78bfa', off: 'Ignores mood', on: 'Matches mood', metrics: [
                { name: 'Valence', desc: 'Happiness vs darkness — 0 = sad/tense, 1 = euphoric/happy' },
                { name: 'Mode', desc: 'Major vs Minor key — strict match or not' },
                { name: 'Genre', desc: 'Text overlap between Spotify genre tags' },
              ]},
              { label: 'ENERGY', val: sonicsWeight, set: setSonicsWeight, color: '#f59e0b', off: 'Ignores intensity', on: 'Matches intensity', metrics: [
                { name: 'Energy', desc: 'Perceived intensity — 0 = calm acoustic, 1 = loud and dense' },
                { name: 'Danceability', desc: 'How suitable for dancing based on rhythm stability' },
                { name: 'Loudness', desc: 'Average dB level, scored within a ±20dB range' },
                { name: 'Popularity', desc: 'Spotify popularity score' },
              ]},
              { label: 'MIX', val: utilityWeight, set: setUtilityWeight, color: '#38bdf8', off: 'Ignores texture', on: 'Matches texture', metrics: [
                { name: 'Instrumentalness', desc: 'Likelihood of no vocals — 0 = vocal, 1 = pure instrumental' },
                { name: 'Speechiness', desc: 'Amount of spoken word — high = rap/podcast, low = music' },
                { name: 'Acousticness', desc: 'Confidence the track is acoustic, no electronic production' },
              ]},
            ].map(({ label, val, set, color, off: offLabel, on: onLabel, metrics }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <SliderTooltip label={label} color={color} metrics={metrics}>
                  <span style={{
                    fontSize: 8, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase',
                    color: val ? color : '#3a4a6a', minWidth: 44, textAlign: 'right',
                    cursor: 'help', borderBottom: `1px dotted ${val ? color + '66' : '#2a3a5a'}`,
                  }}>{label}</span>
                </SliderTooltip>
                {/* Toggle switch */}
                <div
                  onClick={() => { set(v => !v); suggestQueueRef.current = []; }}
                  style={{
                    width: 34, height: 18, borderRadius: 9, cursor: 'pointer', flexShrink: 0,
                    background: val ? color : '#1c2235',
                    border: `1px solid ${val ? color : '#2a3a5a'}`,
                    position: 'relative', transition: 'background 0.2s, border-color 0.2s',
                  }}
                >
                  <div style={{
                    position: 'absolute', top: 3, left: val ? 18 : 3,
                    width: 10, height: 10, borderRadius: '50%',
                    background: val ? '#0d1017' : '#3a4a6a',
                    transition: 'left 0.2s',
                  }} />
                </div>
                <span style={{ fontSize: 9, color: val ? color : '#3a4a6a', fontStyle: 'italic', minWidth: 80 }}>
                  {val ? onLabel : offLabel}
                </span>
              </div>
            ))}

          </div>
        )}

        {/* Right: file names + load buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {songs.length > 0 && fileNames.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 300, alignItems: 'center' }}>
              {fileNames.map((fn, i) => (
                <span key={i} style={{
                  fontSize: 10, color: '#6a7a9a', background: '#1c2235',
                  border: '1px solid #2a2a35', borderRadius: 4,
                  padding: '2px 4px 2px 7px', fontFamily: 'monospace',
                  maxWidth: 140, display: 'inline-flex', alignItems: 'center', gap: 4,
                  overflow: 'hidden', whiteSpace: 'nowrap',
                }} title={fn}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{fn}</span>
                  <span
                    onClick={() => {
                      const newNames = fileNames.filter((_, j) => j !== i);
                      setFileNames(newNames);
                      // We can't fully remove songs by file since we don't track per-file
                      // so just show a note — ideally we'd track per-file but that's a bigger refactor
                      // For now, remove the name pill only (songs stay loaded)
                    }}
                    style={{
                      cursor: 'pointer', color: '#5a6a8a', fontSize: 11,
                      flexShrink: 0, lineHeight: 1,
                      padding: '0 2px',
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = '#888'}
                    onMouseLeave={e => e.currentTarget.style.color = '#444'}
                    title="Remove from list"
                  >×</span>
                </span>
              ))}
            </div>
          )}
          {songs.length > 0 ? (
            <button onClick={() => addFileRef.current.click()} style={{ ...btnStyle, fontSize: 12 }}>
              + Add More
            </button>
          ) : (
            <button onClick={() => fileRef.current.click()} style={{
              ...btnStyle, background: '#00c266', color: '#000', fontWeight: 700, fontSize: 12,
            }}>
              Load CSV
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }}
          onChange={e => { handleFile(e.target.files[0]); fileRef.current.value = ''; }} />
        <input ref={addFileRef} type="file" accept=".csv" multiple style={{ display: 'none' }}
          onChange={e => {
            Array.from(e.target.files).forEach((file, idx) => {
              const reader = new FileReader();
              reader.onload = ev => { loadSongs(ev.target.result, file.name, false); };
              reader.readAsText(file);
            });
            addFileRef.current.value = '';
          }} />
      </div>

      {/* Main layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', height: 'calc(100vh - 65px)' }}>

        {/* Left: Song list — hidden when empty */}
        {songs.length > 0 && <div style={{
          width: 340, minWidth: 300,
          borderRight: '1px solid #1a1a22',
          display: 'flex', flexDirection: 'column',
          background: '#0d1017',
        }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #1a1a22' }}>
            <input
              placeholder="Search songs or artist…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: '#1c2235', border: '1px solid #2a2a35',
                borderRadius: 6, padding: '7px 10px',
                color: '#e8e8ea', fontSize: 12, outline: 'none',
              }}
            />
          </div>
          <div style={{ padding: '6px 14px', borderBottom: '1px solid #1a1a22', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#6a7a9a' }}>{songs.length} songs loaded</span>
            <div style={{ display: 'flex', gap: 5 }}>
              {history.length > 0 && (
                <button onClick={undoSelection}
                  title={`Back to: ${history[history.length-1]?.song}`}
                  style={{ ...btnStyle, fontSize: 10, padding: '3px 8px', color: '#888', gap: 4 }}>
                  ← undo
                </button>
              )}

            </div>
          </div>
          {songs.length > 0 && (
            <div style={{
              display: 'grid', gridTemplateColumns: `1fr ${Math.max(50, Math.round(colAWidth * 0.16))}px ${Math.max(70, Math.round(colAWidth * 0.24))}px`,
              padding: '4px 14px',
              borderBottom: '1px solid #1a1a22',
              background: '#0b0f18',
              fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8,
              alignItems: 'center', position: 'relative',
            }}>
              {/* LEFT: A-Z with song/artist popup */}
              {(() => {
                const active = songSort.key === 'az';
                const arrow = active ? (songSort.dir === 'asc' ? '↓' : '↑') : '↕';
                return (
                  <div ref={azPickerRef} style={{ position: 'relative', justifySelf: 'start' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center',
                      background: active ? '#00c26618' : 'transparent',
                      border: `1px solid ${active ? '#00c26640' : '#1e2638'}`,
                      borderRadius: 4, overflow: 'hidden', transition: 'all 0.15s',
                    }}>
                      <span
                        onClick={() => setAzPickerOpen(o => !o)}
                        style={{ padding: '2px 4px 2px 8px', color: active ? '#00c266' : '#444', cursor: 'pointer', fontSize: 10, userSelect: 'none' }}
                      >A–Z</span>
                      <span
                        onClick={() => {
                          cycleSort('az', 'asc', 'desc');
                        }}
                        style={{ padding: '2px 6px 2px 2px', color: active ? '#00c266' : '#666', cursor: 'pointer', fontSize: 10, opacity: active ? 1 : 0.7, userSelect: 'none' }}
                      >{arrow}</span>
                    </div>
                    {azPickerOpen && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, marginTop: 4,
                        background: '#141a28', border: '1px solid #2a2a38',
                        borderRadius: 8, padding: 6, zIndex: 100,
                        width: 130, boxShadow: '0 8px 32px #00000080',
                      }}>
                        <div style={{ fontSize: 10, color: '#5a6a8a', padding: '3px 10px 6px', textTransform: 'uppercase', letterSpacing: 0.8 }}>Sort by</div>
                        {[['song','Song name'],['artist','Artist name']].map(([val, lbl]) => {
                          const checked = azSortTarget === val;
                          return (
                            <div
                              key={val}
                              onClick={() => { setAzSortTarget(val); setActiveSortList(prev => { const without = prev.filter(s => s.key !== 'az'); const trimmed = without.length >= 2 ? without.slice(1) : without; return [...trimmed, { key: 'az', dir: 'asc' }]; }); setAzPickerOpen(false); }}
                              style={{
                                padding: '5px 10px', borderRadius: 4, cursor: 'pointer',
                                fontSize: 11, display: 'flex', alignItems: 'center', gap: 8,
                                background: checked ? '#00c26618' : 'transparent',
                                color: checked ? '#00c266' : '#888',
                                fontWeight: checked ? 600 : 400,
                              }}
                              onMouseEnter={e => { if (!checked) e.currentTarget.style.background = '#3a4a6610'; }}
                              onMouseLeave={e => { if (!checked) e.currentTarget.style.background = 'transparent'; }}
                            >
                              <span style={{
                                width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                                border: `2px solid ${checked ? '#00c266' : '#444'}`,
                                background: 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                {checked && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00c266', display: 'block' }} />}
                              </span>
                              {lbl}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* CENTER: BPM sort + filter popup */}
              {(() => {
                const active = !!bpmSortDir;
                const hasFilter = bpmFilterVal !== '';
                const arrow = bpmSortDir === 'desc' ? '↓' : bpmSortDir === 'asc' ? '↑' : '↕';
                return (
                  <div ref={bpmPickerRef} style={{ justifySelf: 'center', display: 'flex', justifyContent: 'center', position: 'relative' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center',
                      background: (active || hasFilter) ? '#00c26618' : 'transparent',
                      border: `1px solid ${(active || hasFilter) ? '#00c26640' : '#1e2638'}`,
                      borderRadius: 4, overflow: 'hidden', transition: 'all 0.15s',
                    }}>
                      <span
                        onClick={() => { if (hasFilter) { setBpmFilterVal(''); } else { setBpmPickerOpen(o => !o); } }}
                        style={{ padding: '2px 4px 2px 8px', color: (active || hasFilter) ? '#00c266' : '#444', cursor: 'pointer', fontSize: 10, userSelect: 'none' }}
                      >{hasFilter ? `${bpmFilterVal} BPM` : 'BPM'}</span>
                      <span
                        onClick={e => {
                          e.stopPropagation();
                          // Cycle: off → asc → desc → off
                          cycleSort('bpm', 'desc', 'asc');
                        }}
                        style={{ padding: '2px 6px 2px 2px', color: (active || hasFilter) ? '#00c266' : '#666', cursor: 'pointer', fontSize: 10, opacity: (active || hasFilter) ? 1 : 0.7, userSelect: 'none' }}
                      >{arrow}</span>
                    </div>
                    {bpmPickerOpen && (
                      <div style={{
                        position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 4,
                        background: '#141a28', border: '1px solid #2a2a38',
                        borderRadius: 8, padding: 10, zIndex: 100,
                        width: 150, boxShadow: '0 8px 32px #00000080', boxSizing: 'border-box',
                      }}>
                        <div style={{ fontSize: 10, color: '#5a6a8a', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Filter by BPM</div>
                        <div style={{ fontSize: 10, color: '#6a7a9a', marginBottom: 8, lineHeight: 1.4 }}>Enter a target BPM</div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input
                            type="number"
                            placeholder=""
                            value={bpmFilterVal}
                            onChange={e => setBpmFilterVal(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') setBpmPickerOpen(false); if (e.key === 'Escape') { setBpmFilterVal(''); setBpmPickerOpen(false); } }}
                            autoFocus
                            style={{
                              flex: 1, background: '#1c2235', border: '1px solid #2a2a35',
                              borderRadius: 4, padding: '5px 8px', color: '#e8e8ea',
                              fontSize: 12, outline: 'none', fontFamily: 'monospace',
                              MozAppearance: 'textfield', width: '100%', boxSizing: 'border-box',
                            }}
                          />
                          {bpmFilterVal && (
                            <span onClick={() => { setBpmFilterVal(''); setBpmPickerOpen(false); }} style={{ cursor: 'pointer', color: '#6a7a9a', fontSize: 14, padding: '0 2px' }}
                              onMouseEnter={e => e.currentTarget.style.color = '#888'}
                              onMouseLeave={e => e.currentTarget.style.color = '#555'}
                            >×</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
              {/* RIGHT: Unified Key button: sort + filter */}
              <div ref={keyPickerRef} style={{ justifySelf: 'start', display: 'flex', justifyContent: 'flex-start', position: 'relative' }}>
                <div
                  style={{
                    display: 'flex', alignItems: 'center',
                    background: (keySortDir || keyFilters.size > 0) ? '#00c26618' : 'transparent',
                    border: `1px solid ${(keySortDir || keyFilters.size > 0) ? '#00c26640' : '#1e2638'}`,
                    borderRadius: 4, overflow: 'hidden', transition: 'all 0.15s',
                  }}
                >
                  {/* Label: click to open picker */}
                  <span
                    onClick={() => setKeyPickerOpen(o => !o)}
                    style={{
                      padding: '2px 4px 2px 8px',
                      color: (keySortDir || keyFilters.size > 0) ? '#00c266' : '#5a6a8a',
                      cursor: 'pointer', fontSize: 10,
                      textTransform: 'uppercase', letterSpacing: 0.8, userSelect: 'none',
                    }}
                  >Key</span>
                  {/* Arrow: cycles sort asc→desc→off. ↓=A→G, ↑=G→A */}
                  <span
                    onClick={e => {
                      e.stopPropagation();
                      cycleSort('key', 'asc', 'desc');
                    }}
                    style={{
                      padding: '2px 8px 2px 2px',
                      color: (keySortDir || keyFilters.size > 0) ? '#00c266' : '#666',
                      cursor: 'pointer', fontSize: 10,
                      opacity: (keySortDir || keyFilters.size > 0) ? 1 : 0.7,
                      userSelect: 'none',
                    }}
                  >{keySortDir === 'asc' ? '↓' : keySortDir === 'desc' ? '↑' : '↕'}</span>
                </div>
                {keyPickerOpen && (
                  <div style={{
                    position: 'absolute', top: '100%', right: 0, marginTop: 4,
                    background: '#141a28', border: '1px solid #2a2a38',
                    borderRadius: 8, padding: 6, zIndex: 100,
                    maxHeight: 280, overflowY: 'auto', width: 150,
                    boxShadow: '0 8px 32px #00000080',
                  }}>
                    <div
                      onClick={() => setKeyFilters(new Set())}
                      style={{
                        padding: '5px 10px', borderRadius: 4, cursor: 'pointer',
                        fontSize: 11, color: keyFilters.size === 0 ? '#00c266' : '#888',
                        background: keyFilters.size === 0 ? '#00c26618' : 'transparent',
                        marginBottom: 4, fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}
                    >
                      <span style={{
                        width: 12, height: 12, borderRadius: 3, flexShrink: 0,
                        border: `1px solid ${keyFilters.size === 0 ? '#00c266' : '#444'}`,
                        background: keyFilters.size === 0 ? '#00c266' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, color: '#000',
                      }}>{keyFilters.size === 0 ? '✓' : ''}</span>
                      All keys
                    </div>
                    {allKeys.map(k => {
                      const color = KEY_COLORS[k] || '#888';
                      const isActive = keyFilters.has(k);
                      return (
                        <div
                          key={k}
                          onClick={() => {
                            setKeyFilters(prev => {
                              const next = new Set(prev);
                              if (next.has(k)) next.delete(k); else next.add(k);
                              return next;
                            });
                          }}
                          style={{
                            padding: '5px 10px', borderRadius: 4, cursor: 'pointer',
                            fontSize: 11, display: 'flex', alignItems: 'center', gap: 8,
                            background: isActive ? color + '18' : 'transparent',
                            color: isActive ? color : '#888',
                            fontWeight: isActive ? 600 : 400,
                          }}
                          onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#3a4a6610'; }}
                          onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                        >
                          <span style={{
                            width: 12, height: 12, borderRadius: 3, flexShrink: 0,
                            border: `1px solid ${isActive ? color : '#444'}`,
                            background: isActive ? color : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 9, color: '#000',
                          }}>{isActive ? '✓' : ''}</span>
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
                <div style={{ fontSize: 11, color: '#6a7a9a', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>How to get started</div>
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
                    border: `2px dashed ${isDragging ? '#00c266' : '#1e2638'}`,
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
                    data-key={song.key}
                    ref={el => { songItemRefs.current[song.song] = el; }}
                    onClick={() => { isSelected ? clearSelection() : selectSong(song); }}
                    style={{
                      padding: '5px 14px', cursor: 'pointer',
                      background: isSelected ? '#00c26612' : 'transparent',
                      boxShadow: isSelected ? 'inset 2px 0 0 #00c266' : 'none',
                      transition: 'all 0.1s',
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#3a4a6608'; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: `1fr ${Math.max(50, Math.round(colAWidth * 0.16))}px ${Math.max(70, Math.round(colAWidth * 0.24))}px`, alignItems: 'center', gap: 0 }}>
                      {/* LEFT: song + artist */}
                      <div style={{ minWidth: 0 }}>
                        <div
                          onClick={() => { selectSong(song); }}
                          style={{ fontSize: 12, fontWeight: 500, color: isSelected ? '#00c266' : '#d0d0d8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer', display: 'inline-block', maxWidth: '100%' }}
                          onMouseEnter={e => { e.currentTarget.style.color = '#00c266'; e.currentTarget.style.textDecoration = 'underline'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = isSelected ? '#00c266' : '#d0d0d8'; e.currentTarget.style.textDecoration = 'none'; }}
                        >{song.song}</div>
                        <div style={{ marginTop: 1, overflow: 'hidden', display: 'flex', flexWrap: 'wrap', gap: '0 4px' }}>
                          {song.artist.split(/;\s*|,\s+(?=[A-Z])/).map((a, ai, arr) => (
                            <span key={ai} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                              <span
                                onClick={e => { e.stopPropagation(); setArtistFilter(prev => prev === a.trim() ? null : a.trim()); if (songListRef.current) songListRef.current.scrollTo({ top: 0, behavior: 'smooth' }); }}
                                style={{ fontSize: 10, color: artistFilter === a.trim() ? '#00c266' : '#555', cursor: 'pointer' }}
                                onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline'; e.currentTarget.style.color = '#00c266'; }}
                                onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; e.currentTarget.style.color = artistFilter === a.trim() ? '#00c266' : '#555'; }}
                              >{a.trim()}</span>
                              {artistFilter === a.trim() && <span onClick={e => { e.stopPropagation(); setArtistFilter(null); }} style={{ fontSize: 10, color: '#00c266', cursor: 'pointer' }}>×</span>}
                              {ai < arr.length - 1 && <span style={{ fontSize: 10, color: '#4a5a7a' }}>,</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                      {/* CENTER: BPM */}
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 12, color: '#666', fontFamily: 'monospace', fontWeight: 600 }}>{song.bpm}</div>

                      </div>
                      {/* RIGHT: Key */}
                      <div style={{ textAlign: 'left', paddingLeft: 9 }}>
                        <KeyBadge keyName={song.key} onDoubleClick={e => { e.stopPropagation(); jumpToKey(song.key); }} />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Drag handle — inside col A, absolutely positioned on right edge */}
          <div
            onMouseDown={e => {
              e.preventDefault();
              const startX = e.clientX;
              const startW = colAWidth;
              const maxW = Math.floor(window.innerWidth / 3);
              const onMove = ev => {
                const newW = Math.max(220, Math.min(maxW, startW + ev.clientX - startX));
                setColAWidth(newW);
              };
              const onUp = () => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
              };
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            }}
            style={{
              position: 'absolute', top: 0, right: 0, width: 6, height: '100%',
              cursor: 'col-resize', zIndex: 20,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onMouseEnter={e => { e.currentTarget.querySelector('div').style.background = '#00c266aa'; }}
            onMouseLeave={e => { e.currentTarget.querySelector('div').style.background = '#ffffff18'; }}
          >
            <div style={{
              width: 3, height: '40%', minHeight: 40,
              background: '#ffffff18',
              borderRadius: 2,
              transition: 'background 0.15s',
              pointerEvents: 'none',
            }} />
          </div>
        </div>}

        {/* Right: Matches */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Matches header — hidden when no songs */}
          {songs.length > 0 && <div style={{
            padding: '8px 20px',
            borderBottom: '1px solid #1a1a22',
            display: 'flex', alignItems: 'center', gap: 12,
            background: '#0e1220',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#d0d0d8' }}>
                {selectedSong ? `Matches for "${selectedSong.song}"` : 'All Matches'}
              </span>
              <span style={{
                fontSize: 22, fontWeight: 800, fontFamily: 'monospace',
                color: '#00c266', letterSpacing: -1,
              }}>
                {displayedMatches.length}
              </span>
              <span style={{ fontSize: 12, color: '#00c26688', fontWeight: 600 }}>
                match{displayedMatches.length !== 1 ? 'es' : ''}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              <input
                placeholder="Filter matches…"
                value={filterTerm}
                onChange={e => setFilterTerm(e.target.value)}
                style={{
                  background: '#1c2235', border: '1px solid #2a2a35',
                  borderRadius: matches.length > 0 ? '6px 0 0 6px' : 6,
                  padding: '6px 10px', width: 220, boxSizing: 'border-box',
                  color: '#e8e8ea', fontSize: 12, outline: 'none',
                }}
              />
              {matches.length > 0 && (
                <button
                  onClick={suggest}
                  style={{
                    background: 'linear-gradient(135deg, #a78bfa22, #f59e0b22)',
                    border: '1px solid #a78bfa44', borderLeft: 'none',
                    borderRadius: '0 6px 6px 0', padding: '6px 12px',
                    fontSize: 10, fontWeight: 800, letterSpacing: 0.6,
                    color: '#a78bfa', cursor: 'pointer',
                    textTransform: 'uppercase',
                    transition: 'all 0.15s', whiteSpace: 'nowrap', flexShrink: 0,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, #a78bfa44, #f59e0b33)'; e.currentTarget.style.borderColor = '#a78bfa88'; e.currentTarget.style.color = '#c4b5fd'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, #a78bfa22, #f59e0b22)'; e.currentTarget.style.borderColor = '#a78bfa44'; e.currentTarget.style.color = '#a78bfa'; }}
                >✦ Suggest</button>
              )}
            </div>
            {/* Relative keys toggle moved here */}
            <div
              onClick={() => handleRelative(!allowRelative)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                cursor: 'pointer', padding: '4px 10px',
                background: allowRelative ? '#00c26618' : '#1c2235',
                border: `1px solid ${allowRelative ? '#00c26644' : '#2a3348'}`,
                borderRadius: 6, transition: 'all 0.2s',
              }}
            >
              <div style={{
                width: 24, height: 14, borderRadius: 7,
                background: allowRelative ? '#00c266' : '#333',
                position: 'relative', transition: 'background 0.2s', flexShrink: 0,
              }}>
                <div style={{
                  position: 'absolute', top: 2, left: allowRelative ? 12 : 2,
                  width: 10, height: 10, borderRadius: 5,
                  background: '#fff', transition: 'left 0.2s',
                }} />
              </div>
              <span style={{ fontSize: 11, color: allowRelative ? '#00c266' : '#555', whiteSpace: 'nowrap' }}>Relative Keys</span>
            </div>

          </div>}

          {/* Column headers */}
          {displayedMatches.length > 0 && (
            <div style={{
              position: 'relative',
              display: 'grid',
              gridTemplateColumns: '1fr 70px 90px 90px',
              gap: 12, padding: '6px 20px',
              background: '#0d1017',
              borderBottom: '1px solid #1a1a22',
              fontSize: 10, textTransform: 'uppercase',
              alignItems: 'center',
            }}>
              <SortHeader label="Track (A→Z)" sortKey="az" current={matchSort} onToggle={k => toggleSort(matchSort, k, setMatchSort)} />
              <SortHeader label="Match" sortKey="score" current={matchSort} onToggle={k => toggleSort(matchSort, k, setMatchSort)} align="center" invertArrow={true} />
              <SortHeader label="BPM Diff" sortKey="bpm" current={matchSort} onToggle={k => toggleSort(matchSort, k, setMatchSort)} align="center" invertArrow={true} />
              <SortHeader label="Key" sortKey="key" current={matchSort} onToggle={k => toggleSort(matchSort, k, setMatchSort)} align="right" />

            </div>
          )}

          {/* Anchor card — sticky, outside scroll */}
          {selectedSong && (
            <div style={{ flexShrink: 0, borderBottom: '1px solid #1a1a22' }}>
              <AnchorCard song={selectedSong} onArtistFilter={artist => { setArtistFilter(prev => prev === artist ? null : artist); if (songListRef.current) songListRef.current.scrollTo({ top: 0, behavior: 'smooth' }); }} artistFilter={artistFilter} onJumpToKey={jumpToKey} onScrollTo={scrollToSong} />
              <div style={{
                padding: '6px 20px 4px',
                fontSize: 10, color: '#5a6a8a', textTransform: 'uppercase', letterSpacing: 0.8,
                marginTop: 8,
              }}>
                {displayedMatches.length} compatible track{displayedMatches.length !== 1 ? 's' : ''}
              </div>
            </div>
          )}

          {/* Pinned selected match row */}
          {selectedSong && selectedMatch !== null && displayedMatches[selectedMatch] && (
            <div style={{ flexShrink: 0, borderBottom: '1px solid #1a1a22', paddingBottom: 12 }}>
              <MatchRow
                match={displayedMatches[selectedMatch]}
                anchor={selectedSong}
                pinned={true}
                selected={true}
                onClick={() => setSelectedMatch(null)}
                onNavigate={selectSong}
                onScrollTo={scrollToSong}
                onArtistFilter={artist => { setArtistFilter(prev => prev === artist ? null : artist); if (songListRef.current) songListRef.current.scrollTo({ top: 0, behavior: 'smooth' }); }}
                onJumpToKey={jumpToKey}
              />
              <div style={{ padding: '4px 20px 0', fontSize: 10, color: '#00c26688', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                ↑ selected · click to deselect
              </div>
            </div>
          )}

          {/* Match rows */}
          <div ref={matchListRef} style={{ flex: 1, overflowY: 'auto' }}>
            {songs.length === 0 ? (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                height: '100%', padding: '32px 40px', textAlign: 'center', overflowY: 'auto', background: '#0d1017',
              }}>
                {/* Hero */}
                <div style={{ fontSize: 44, marginBottom: 12, lineHeight: 1 }}>🎧</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#e8e8ea', marginBottom: 8, letterSpacing: -0.8 }}>
                  Find your perfect mix
                </div>
                <div style={{ fontSize: 14, color: '#6a7a9a', maxWidth: 340, lineHeight: 1.6, marginBottom: 28 }}>
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
                      background: '#111827', border: '1px solid #1e2638',
                      borderRadius: 12, padding: '16px 20px', minWidth: 130, textAlign: 'left',
                    }}>
                      <div style={{ fontSize: 20, marginBottom: 8 }}>{icon}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#ccc', marginBottom: 3 }}>{label}</div>
                      <div style={{ fontSize: 11, color: '#6a7a9a', lineHeight: 1.4 }}>{desc}</div>
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
                <div style={{ fontSize: 11, color: '#4a5a7a', marginBottom: 28 }}>
                  via exportify.net
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
                      <div style={{ fontSize: 13, color: '#8a9ab8' }}>{text}</div>
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
                    border: `2px dashed ${isDragging ? '#00c266' : '#1e2638'}`,
                    padding: '36px 30px',
                    textAlign: 'center',
                    background: isDragging ? '#00c26610' : '#0d1017',
                    transition: 'all 0.2s', cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{isDragging ? '✓' : '☁'}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: isDragging ? '#00c266' : '#4a5a7a', marginBottom: 4 }}>
                    {isDragging ? 'Drop to load' : 'Drag & drop CSV here'}
                  </div>
                  {!isDragging && <div style={{ fontSize: 11, color: '#4a5a7a' }}>or click Load CSV in the top right</div>}
                </div>
              </div>
            ) : displayedMatches.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#5a6a8a' }}>
                <div style={{ fontSize: 30, marginBottom: 12 }}>∅</div>
                <div style={{ fontSize: 13 }}>No matches found with current settings</div>
                <div style={{ fontSize: 11, marginTop: 6, color: '#5a6a8a' }}>Try increasing the BPM tolerance or enabling relative keys</div>
              </div>
            ) : selectedSong ? (
              // Anchor mode: show non-selected match rows only (selected is pinned above)
              <>
                {displayedMatches.filter((_, i) => i !== selectedMatch).map((match, i, arr) => {
                  const origIdx = displayedMatches.indexOf(match);
                  return (
                    <MatchRow
                      key={origIdx}
                      match={match}
                      anchor={selectedSong}
                      selected={false}
                      onClick={() => setSelectedMatch(origIdx)}
                      onNavigate={selectSong}
                      onArtistFilter={artist => { setArtistFilter(prev => prev === artist ? null : artist); if (songListRef.current) songListRef.current.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    />
                  );
                })}
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
                  const isExpanded = expandedGroups[song.song] === true; // default collapsed
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
                          onScrollTo={scrollToSong}
                          onJumpToKey={jumpToKey}
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
            background: '#0d1017',
            display: 'flex', gap: 20, alignItems: 'center',
            fontSize: 11, color: '#5a6a8a',
          }}>
            <span>{songs.length} songs</span>
            <span>·</span>
            <span>{matches.length} total matches</span>
            {fileName && <><span>·</span><span style={{ color: '#6a7a9a' }}>{fileName}</span></>}
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
  background: '#1c2235',
  border: '1px solid #2a2a35',
  borderRadius: 6,
  color: '#aaa',
  cursor: 'pointer',
  padding: '6px 12px',
  fontSize: 12,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'all 0.15s',
};