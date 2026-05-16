// ─────────────────────────────────────────────────────────────
// PIXABAY API KEY (optional but recommended for images)
//
// 1. Register free at https://pixabay.com/accounts/register/
// 2. Find your key at https://pixabay.com/api/docs/
// 3. Paste it below.
//
// Leave as '' to skip images (etymology and meanings still work).
// Free tier: 100 requests/hour with a key.
// ─────────────────────────────────────────────────────────────
const PIXABAY_KEY = '55886058-23f4a786d883053d8583182f0';

const DICT_API    = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
const PIXABAY_API = 'https://pixabay.com/api/';

// ── DOM refs ──────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const searchForm    = $('search-form');
const searchInput   = $('search-input');
const emptyState    = $('empty-state');
const loadingState  = $('loading-state');
const errorState    = $('error-state');
const errorIcon     = $('error-icon');
const errorTitle    = $('error-title');
const errorDesc     = $('error-desc');
const results       = $('results');
const wordTitle     = $('word-title');
const phoneticEl    = $('phonetic');
const audioBtn      = $('audio-btn');
const imageCard     = $('image-card');
const wordImage     = $('word-image');
const etymologyText = $('etymology-text');
const etymologyMiss = $('etymology-missing');
const meaningsList  = $('meanings-list');
const iosHint       = $('ios-hint');
const iosHintClose  = $('ios-hint-close');

let currentWord  = '';
let currentAudio = null;

// ── API ───────────────────────────────────────────────────────

async function fetchDefinition(word) {
  const res = await fetch(DICT_API + encodeURIComponent(word));
  if (!res.ok) {
    const err = new Error(res.status === 404 ? 'not_found' : 'network_error');
    err.code = res.status === 404 ? 'not_found' : 'network_error';
    throw err;
  }
  return res.json();
}

async function fetchImage(word) {
  if (!PIXABAY_KEY) return null;
  const url = `${PIXABAY_API}?key=${PIXABAY_KEY}&q=${encodeURIComponent(word)}&image_type=photo&per_page=3&safesearch=true&orientation=horizontal`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.hits || data.hits.length === 0) return null;
  const hit = data.hits[0];
  // previewURL uses cdn.pixabay.com (no hotlink protection); scale up from _150 to _640
  return hit.previewURL
    ? hit.previewURL.replace('_150.', '_640.')
    : hit.webformatURL;
}

// ── Data extraction ───────────────────────────────────────────

function extractEtymology(entries) {
  for (const entry of entries) {
    if (entry.origin && entry.origin.trim()) return entry.origin.trim();
  }
  return null;
}

function extractPhonetic(entries) {
  for (const entry of entries) {
    if (entry.phonetic) return { text: entry.phonetic, audio: null };
    if (entry.phonetics) {
      for (const p of entry.phonetics) {
        if (p.text) return { text: p.text, audio: p.audio || null };
      }
    }
  }
  return null;
}

function extractAudio(entries) {
  for (const entry of entries) {
    if (entry.phonetics) {
      for (const p of entry.phonetics) {
        if (p.audio && p.audio.trim()) return p.audio.trim();
      }
    }
  }
  return null;
}

function extractMeanings(entries) {
  const seen = new Set();
  const result = [];
  for (const entry of entries) {
    if (!entry.meanings) continue;
    for (const meaning of entry.meanings) {
      const pos = meaning.partOfSpeech;
      if (seen.has(pos)) continue;
      seen.add(pos);
      const defs = (meaning.definitions || []).slice(0, 3).map(d => ({
        definition: d.definition || '',
        example:    d.example    || '',
      }));
      if (defs.length > 0) result.push({ pos, defs });
    }
  }
  return result;
}

// ── Rendering ─────────────────────────────────────────────────

function renderMeanings(meanings) {
  return meanings.map(({ pos, defs }) => `
    <div class="pos-group">
      <div class="pos-label">${pos}</div>
      <ol class="definition-list">
        ${defs.map(d => `
          <li class="definition-item">
            <div class="definition-body">
              <p class="definition-text">${escHtml(d.definition)}</p>
              ${d.example ? `<p class="definition-example">${escHtml(d.example)}</p>` : ''}
            </div>
          </li>
        `).join('')}
      </ol>
    </div>
  `).join('');
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderResults(entries, imageUrl) {
  // word title
  wordTitle.textContent = entries[0].word;

  // phonetic + audio
  const phonetic = extractPhonetic(entries);
  phoneticEl.textContent = phonetic ? phonetic.text : '';
  const audioUrl = extractAudio(entries);
  if (audioUrl) {
    currentAudio = new Audio(audioUrl);
    audioBtn.hidden = false;
  } else {
    currentAudio = null;
    audioBtn.hidden = true;
  }

  // image
  if (imageUrl) {
    wordImage.src = imageUrl;
    wordImage.alt = entries[0].word;
    imageCard.hidden = false;
  } else {
    imageCard.hidden = true;
  }

  // etymology
  const etymology = extractEtymology(entries);
  if (etymology) {
    etymologyText.textContent = etymology;
    etymologyText.hidden = false;
    etymologyMiss.hidden = true;
  } else {
    etymologyText.hidden = true;
    etymologyMiss.innerHTML = `Etymology data not available for this word. For detailed history, see <a href="https://www.etymonline.com/word/${encodeURIComponent(entries[0].word)}" target="_blank" rel="noopener">Etymonline →</a>`;
    etymologyMiss.hidden = false;
  }

  // meanings
  const meanings = extractMeanings(entries);
  meaningsList.innerHTML = renderMeanings(meanings);
}

// ── UI state helpers ──────────────────────────────────────────

function showLoading() {
  emptyState.hidden   = true;
  errorState.hidden   = true;
  results.hidden      = true;
  loadingState.hidden = false;
}

function hideLoading() {
  loadingState.hidden = true;
}

function showError(code) {
  hideLoading();
  results.hidden = true;
  if (code === 'not_found') {
    errorIcon.textContent  = '🔍';
    errorTitle.textContent = 'Word not found';
    errorDesc.textContent  = 'Check the spelling and try again.';
  } else {
    errorIcon.textContent  = '📡';
    errorTitle.textContent = 'Could not connect';
    errorDesc.textContent  = 'Check your network and try again.';
  }
  errorState.hidden = false;
}

// ── Search orchestrator ───────────────────────────────────────

async function search(word) {
  word = word.trim().toLowerCase();
  if (!word || word === currentWord) return;
  currentWord = word;

  showLoading();

  const [dictResult, imageResult] = await Promise.allSettled([
    fetchDefinition(word),
    fetchImage(word),
  ]);

  if (dictResult.status === 'rejected') {
    const code = dictResult.reason.code || 'network_error';
    showError(code);
    return;
  }

  hideLoading();
  renderResults(dictResult.value, imageResult.value ?? null);
  results.hidden = false;
}

// ── Events ────────────────────────────────────────────────────

searchForm.addEventListener('submit', e => {
  e.preventDefault();
  search(searchInput.value);
  searchInput.blur();
});

audioBtn.addEventListener('click', () => {
  if (currentAudio) {
    currentAudio.currentTime = 0;
    currentAudio.play().catch(() => {});
  }
});

document.querySelectorAll('.example-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    searchInput.value = chip.textContent;
    search(chip.textContent);
  });
});

// ── iOS install hint ──────────────────────────────────────────

function isIosSafari() {
  const ua = navigator.userAgent;
  return /iP(hone|ad|od)/.test(ua) && /WebKit/.test(ua) && !/(CriOS|FxiOS|OPiOS|mercury)/.test(ua);
}

if (isIosSafari() && !navigator.standalone && !localStorage.getItem('ios-hint-dismissed')) {
  setTimeout(() => { iosHint.hidden = false; }, 2000);
}

iosHintClose.addEventListener('click', () => {
  iosHint.hidden = true;
  localStorage.setItem('ios-hint-dismissed', '1');
});

// ── Service Worker ────────────────────────────────────────────

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
