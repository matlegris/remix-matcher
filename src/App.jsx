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
        mode: parseInt(r['Mode']) || 0,
        energy: parseFloat(r['Energy']) || null,
        danceability: parseFloat(r['Danceability']) || null,
        valence: parseFloat(r['Valence']) || null,
        loudness: parseFloat(r['Loudness']) || null,
        instrumentalness: parseFloat(r['Instrumentalness']) || null,
        speechiness: parseFloat(r['Speechiness']) || null,
        acousticness: parseFloat(r['Acousticness']) || null,
        popularity: parseInt(r['Popularity']) || null,
        timeSignature: parseInt(r['Time Signature']) || null,
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
function AnchorCard({ song, onArtistFilter, artistFilter, onJumpToKey }) {
  return (
    <div style={{
      margin: '12px 20px 8px',
      padding: '12px 16px',
      background: '#00c26610',
      border: '1px solid #00c26650',
      borderRadius: 10,
      boxShadow: '0 0 0 1px #00c26620',
    }}>
      <div style={{ fontSize: 16, fontWeight: 600, color: '#f0f0f0' }}>{song.song}</div>
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
      const scored = matches.map(m => ({
        m,
        score: scoreMatch(m.a, m.b, vibeWeight, sonicsWeight, utilityWeight) ?? 0,
      }));
      // Group by score, shuffle within each group, then flatten highest→lowest
      const groups = {};
      scored.forEach(item => {
        const key = item.score;
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
      });
      const sorted = Object.keys(groups)
        .map(Number)
        .sort((a, b) => b - a);
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
          <img src="data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAKrBAADASIAAhEBAxEB/8QAHQABAAEEAwEAAAAAAAAAAAAAAAIBAwcIBAUGCf/EAEsQAQACAQMBBAcDCAYIBgEFAAABAgMEBREGBxIhMQgTQVFhcZEiMoEUFSNCUqGxwTNicpKT0RYXRVVjgoPhNUNGU1ZzGCQ0RFTC/8QAHAEBAAEFAQEAAAAAAAAAAAAAAAUBAgMEBgcI/8QAOBEBAAIBAgQDBQYFBQEBAQAAAAECAwQRBRIhMQZBURMyYXGRFBUiUqGxFjNCgdEjQ1PB4fAHYv/aAAwDAQACEQMRAD8A0yAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/Z" alt="logo" style={{ height: 36, width: 'auto', borderRadius: 6 }} />
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
            {songs.length > 0 && matches.length > 0 && (
              <button
                onClick={suggest}
                style={{
                  marginTop: 4,
                  background: 'linear-gradient(135deg, #a78bfa22, #f59e0b22)',
                  border: '1px solid #a78bfa44',
                  borderRadius: 6, padding: '4px 12px',
                  fontSize: 10, fontWeight: 800, letterSpacing: 0.8,
                  color: '#a78bfa', cursor: 'pointer',
                  textTransform: 'uppercase', width: '100%',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, #a78bfa44, #f59e0b33)'; e.currentTarget.style.borderColor = '#a78bfa88'; e.currentTarget.style.color = '#c4b5fd'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, #a78bfa22, #f59e0b22)'; e.currentTarget.style.borderColor = '#a78bfa44'; e.currentTarget.style.color = '#a78bfa'; }}
              >✦ Suggest</button>
            )}
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
            <div style={{ flex: 1 }}>
              <input
                placeholder="Filter matches…"
                value={filterTerm}
                onChange={e => setFilterTerm(e.target.value)}
                style={{
                  width: '100%', maxWidth: 300, boxSizing: 'border-box',
                  background: '#1c2235', border: '1px solid #2a2a35',
                  borderRadius: 6, padding: '6px 10px',
                  color: '#e8e8ea', fontSize: 12, outline: 'none',
                }}
              />
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
              display: 'grid',
              gridTemplateColumns: '1fr 70px 90px 90px',
              gap: 12, padding: '6px 20px',
              background: '#0d1017',
              borderBottom: '1px solid #1a1a22',
              fontSize: 10, textTransform: 'uppercase',
            }}>
              <SortHeader label="Matching Track" sortKey="az" current={matchSort} onToggle={k => toggleSort(matchSort, k, setMatchSort)} />
              <SortHeader label="Match" sortKey="score" current={matchSort} onToggle={k => toggleSort(matchSort, k, setMatchSort)} align="center" />
              <SortHeader label="BPM Diff" sortKey="bpm" current={matchSort} onToggle={k => toggleSort(matchSort, k, setMatchSort)} align="center" invertArrow={true} />
              <SortHeader label="Key" sortKey="key" current={matchSort} onToggle={k => toggleSort(matchSort, k, setMatchSort)} align="right" />
            </div>
          )}

          {/* Anchor card — sticky, outside scroll */}
          {selectedSong && (
            <div style={{ flexShrink: 0, borderBottom: '1px solid #1a1a22' }}>
              <AnchorCard song={selectedSong} onArtistFilter={artist => { setArtistFilter(prev => prev === artist ? null : artist); if (songListRef.current) songListRef.current.scrollTo({ top: 0, behavior: 'smooth' }); }} artistFilter={artistFilter} onJumpToKey={jumpToKey} />
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
