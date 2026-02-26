import React, { useState, useCallback, useRef, useEffect } from "react";

// --- CONSTANTS ---
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

// --- LOGIC FUNCTIONS ---
function parseCSV(text) {
  const lines = text.split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
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
        danceability: r['Danceability'] != null && r['Danceability'] !== '' ? parseFloat