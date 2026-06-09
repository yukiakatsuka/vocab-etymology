// Pixabay API key is optional. Leave empty to skip image lookup.
const PIXABAY_KEY = '55886058-23f4a786d883053d8583182f0';

const DICT_API = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
const PIXABAY_API = 'https://pixabay.com/api/';

const $ = id => document.getElementById(id);

const searchForm = $('search-form');
const searchInput = $('search-input');
const emptyState = $('empty-state');
const loadingState = $('loading-state');
const errorState = $('error-state');
const errorIcon = $('error-icon');
const errorTitle = $('error-title');
const errorDesc = $('error-desc');
const results = $('results');
const wordTitle = $('word-title');
const phoneticEl = $('phonetic');
const saveWordBtn = $('save-word-btn');
const audioBtn = $('audio-btn');
const externalLink = $('external-link');
const imageCard = $('image-card');
const wordImage = $('word-image');
const etymologyText = $('etymology-text');
const etymologyMiss = $('etymology-missing');
const meaningsList = $('meanings-list');
const savedCount = $('saved-count');
const savedEmpty = $('saved-empty');
const savedList = $('saved-list');
const iosHint = $('ios-hint');
const iosHintClose = $('ios-hint-close');

const SAVED_WORDS_KEY = 'word-explorer-saved-words';

let currentWord = '';
let currentAudio = null;
let currentEntry = null;
let savedWords = loadSavedWords();

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
  return hit.previewURL
    ? hit.previewURL.replace('_150.', '_640.')
    : hit.webformatURL;
}

function extractEtymology(entries) {
  for (const entry of entries) {
    if (entry.origin && entry.origin.trim()) return entry.origin.trim();
  }
  return null;
}

function extractPhonetic(entries) {
  for (const entry of entries) {
    if (entry.phonetic) return { text: entry.phonetic, audio: null };
    if (!entry.phonetics) continue;

    for (const p of entry.phonetics) {
      if (p.text) return { text: p.text, audio: p.audio || null };
    }
  }
  return null;
}

function extractAudio(entries) {
  for (const entry of entries) {
    if (!entry.phonetics) continue;

    for (const p of entry.phonetics) {
      if (p.audio && p.audio.trim()) return p.audio.trim();
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
      const pos = meaning.partOfSpeech || 'usage';
      if (seen.has(pos)) continue;
      seen.add(pos);

      const defs = (meaning.definitions || []).slice(0, 3).map(d => ({
        definition: d.definition || '',
        example: d.example || '',
      })).filter(d => d.definition);

      if (defs.length > 0) result.push({ pos, defs });
    }
  }

  return result;
}

function getPrimaryDefinition(entries) {
  const meanings = extractMeanings(entries);
  return meanings[0]?.defs[0]?.definition || '';
}

function renderMeanings(meanings) {
  if (meanings.length === 0) {
    return '<p class="etymology-missing">No definition data is available for this word yet.</p>';
  }

  return meanings.map(({ pos, defs }) => `
    <div class="pos-group">
      <div class="pos-label">${escHtml(pos)}</div>
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
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setExternalLink(word) {
  externalLink.href = `https://www.etymonline.com/word/${encodeURIComponent(word)}`;
}

function loadSavedWords() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_WORDS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(item => item && item.word) : [];
  } catch {
    return [];
  }
}

function persistSavedWords() {
  localStorage.setItem(SAVED_WORDS_KEY, JSON.stringify(savedWords));
}

function isSaved(word) {
  return savedWords.some(item => item.word.toLowerCase() === word.toLowerCase());
}

function updateSaveButton(word) {
  const saved = isSaved(word);
  saveWordBtn.textContent = saved ? 'Saved' : 'Save word';
  saveWordBtn.classList.toggle('is-saved', saved);
  saveWordBtn.setAttribute('aria-pressed', String(saved));
}

function toggleCurrentWordSaved() {
  if (!currentEntry) return;

  const word = currentEntry.word || currentWord;
  const normalized = word.toLowerCase();

  if (isSaved(word)) {
    savedWords = savedWords.filter(item => item.word.toLowerCase() !== normalized);
  } else {
    savedWords = [
      {
        word,
        phonetic: currentEntry.phonetic || '',
        summary: currentEntry.summary || '',
        savedAt: new Date().toISOString(),
      },
      ...savedWords.filter(item => item.word.toLowerCase() !== normalized),
    ];
  }

  persistSavedWords();
  renderSavedWords();
  updateSaveButton(word);
}

function renderSavedWords() {
  const count = savedWords.length;
  savedCount.textContent = `${count} ${count === 1 ? 'word' : 'words'}`;
  savedEmpty.hidden = count > 0;
  savedList.hidden = count === 0;

  savedList.innerHTML = savedWords.map(item => {
    const savedDate = item.savedAt
      ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(item.savedAt))
      : 'Saved';

    return `
      <div class="saved-item" data-word="${escHtml(item.word)}">
        <div>
          <button class="saved-word" type="button" data-action="search">${escHtml(item.word)}</button>
          <div class="saved-meta">${escHtml([item.phonetic, savedDate].filter(Boolean).join(' · '))}</div>
          ${item.summary ? `<div class="saved-summary">${escHtml(item.summary)}</div>` : ''}
        </div>
        <div class="saved-actions">
          <button class="saved-action" type="button" data-action="search">Study again</button>
          <button class="saved-action danger" type="button" data-action="remove">Remove</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderResults(entries, imageUrl) {
  const displayWord = entries[0].word || currentWord;
  const phonetic = extractPhonetic(entries);

  currentEntry = {
    word: displayWord,
    phonetic: phonetic ? phonetic.text : '',
    summary: getPrimaryDefinition(entries),
  };

  wordTitle.textContent = displayWord;
  setExternalLink(displayWord);
  updateSaveButton(displayWord);

  phoneticEl.textContent = phonetic ? phonetic.text : 'Pronunciation unavailable';

  const audioUrl = extractAudio(entries);
  if (audioUrl) {
    currentAudio = new Audio(audioUrl);
    audioBtn.hidden = false;
  } else {
    currentAudio = null;
    audioBtn.hidden = true;
  }

  if (imageUrl) {
    wordImage.src = imageUrl;
    wordImage.alt = `${displayWord} visual reference`;
    imageCard.hidden = false;
  } else {
    imageCard.hidden = true;
    wordImage.removeAttribute('src');
  }

  const etymology = extractEtymology(entries);
  if (etymology) {
    etymologyText.textContent = etymology;
    etymologyText.hidden = false;
    etymologyMiss.hidden = true;
  } else {
    etymologyText.hidden = true;
    etymologyMiss.innerHTML = `Etymology data is not available from the dictionary source. For a deeper word history, open <a href="https://www.etymonline.com/word/${encodeURIComponent(displayWord)}" target="_blank" rel="noopener">Etymonline</a>.`;
    etymologyMiss.hidden = false;
  }

  meaningsList.innerHTML = renderMeanings(extractMeanings(entries));
}

function showLoading() {
  emptyState.hidden = true;
  errorState.hidden = true;
  results.hidden = true;
  currentEntry = null;
  loadingState.hidden = false;
}

function hideLoading() {
  loadingState.hidden = true;
}

function showError(code) {
  hideLoading();
  results.hidden = true;

  if (code === 'not_found') {
    errorIcon.textContent = '!';
    errorTitle.textContent = 'Word not found';
    errorDesc.textContent = 'Check the spelling, remove extra punctuation, and try again.';
  } else {
    errorIcon.textContent = 'i';
    errorTitle.textContent = 'Could not connect';
    errorDesc.textContent = 'The dictionary service did not respond. Check the network and try again.';
  }

  errorState.hidden = false;
}

async function search(word) {
  word = word.trim().toLowerCase();
  if (!word) return;
  if (word === currentWord && !results.hidden) return;

  currentWord = word;
  showLoading();

  const [dictResult, imageResult] = await Promise.allSettled([
    fetchDefinition(word),
    fetchImage(word),
  ]);

  if (dictResult.status === 'rejected') {
    showError(dictResult.reason.code || 'network_error');
    return;
  }

  hideLoading();
  renderResults(dictResult.value, imageResult.value ?? null);
  results.hidden = false;
}

searchForm.addEventListener('submit', e => {
  e.preventDefault();
  search(searchInput.value);
  searchInput.blur();
});

audioBtn.addEventListener('click', () => {
  if (!currentAudio) return;
  currentAudio.currentTime = 0;
  currentAudio.play().catch(() => {});
});

saveWordBtn.addEventListener('click', toggleCurrentWordSaved);

savedList.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;

  const item = button.closest('.saved-item');
  const word = item?.dataset.word;
  if (!word) return;

  if (button.dataset.action === 'remove') {
    savedWords = savedWords.filter(saved => saved.word.toLowerCase() !== word.toLowerCase());
    persistSavedWords();
    renderSavedWords();
    if (currentEntry?.word.toLowerCase() === word.toLowerCase()) {
      updateSaveButton(currentEntry.word);
    }
    return;
  }

  searchInput.value = word;
  search(word);
});

document.querySelectorAll('.example-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const word = chip.textContent.trim();
    searchInput.value = word;
    search(word);
  });
});

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

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

renderSavedWords();
