const WIKIPEDIA_API = 'https://ar.wikipedia.org/api/rest_v1/page/random/summary';
const FAVORITES_KEY = 'rabbit_hole_favorites';

const INTERESTING_KEYWORDS = [
  'لغز', 'مؤامرة', 'حادثة', 'ظاهرة', 'جريمة', 'اكتشاف',
  'غريب', 'مجهول', 'كارثة', 'أسطورة', 'خرافة', 'سر',
  'سفاح', 'تجربة', 'مرعب', 'مخيف', 'نظرية', 'فضاء',
  'اختفاء', 'شبح', 'كائن',
];

const STRICT_BLACKLIST = [
  'مواليد', 'لاعب', 'سياسي', 'ممثل', 'كاهن', 'أسقف',
  'نادي', 'قرية', 'عزبة', 'بطولة', 'موسم', 'ألبوم',
  'فيلم', 'رواية', 'مسلسل', 'شركة', 'كاتب', 'جامعة',
  'عائلة', 'قبيلة',
];

function isBlacklisted(data) {
  const haystack = `${data.description || ''} ${data.extract || ''}`;
  return STRICT_BLACKLIST.some(kw => haystack.includes(kw));
}

function isInteresting(data) {
  const haystack = `${data.description || ''} ${data.extract || ''}`;
  return INTERESTING_KEYWORDS.some(kw => haystack.includes(kw));
}

// ─── DOM refs ──────────────────────────────────

const loadingEl     = document.getElementById('loading');
const articleEl     = document.getElementById('article');
const errorEl       = document.getElementById('error');
const titleEl       = document.getElementById('article-title');
const descriptionEl = document.getElementById('article-description');
const extractEl     = document.getElementById('article-extract');
const imageEl       = document.getElementById('article-image');
const fetchBtn      = document.getElementById('fetch-btn');
const fetchBtnLabel = fetchBtn.querySelector('span:nth-child(2)');
const timerText     = document.getElementById('timer-text');
const saveBtn       = document.getElementById('save-btn');
const shareBtn      = document.getElementById('share-btn');
const shareLabel    = document.getElementById('share-label');
const streakBadge   = document.getElementById('streak-badge');
const streakCountEl = document.getElementById('streak-count');
const favToggle     = document.getElementById('favorites-toggle');
const favBody       = document.getElementById('favorites-body');
const favList       = document.getElementById('favorites-list');
const favEmpty      = document.getElementById('favorites-empty');
const favBadge      = document.getElementById('fav-count-badge');
const toggleChevron = document.getElementById('toggle-chevron');

// ─── State ──────────────────────────────────

let currentArticle  = null;
let prefetchPromise = null; // always holds the next article being fetched
let sessionStreak   = 0;

function updateStreak() {
  sessionStreak++;
  streakCountEl.textContent = toArabicNumerals(sessionStreak);

  // Tier colours: default → milestone (5+) → on-fire (20+)
  streakBadge.classList.remove('milestone', 'on-fire');
  if (sessionStreak >= 20) {
    streakBadge.classList.add('on-fire');
  } else if (sessionStreak >= 5) {
    streakBadge.classList.add('milestone');
  }

  // Show on first article, pop on every update
  streakBadge.classList.remove('hidden');
  streakBadge.classList.remove('pop');
  void streakBadge.offsetWidth; // force reflow so animation restarts
  streakBadge.classList.add('pop');
}

// ─── Timer (MM:SS) ──────────────────────────────────

function toArabicNumerals(n) {
  return n.toString().replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
}

let totalSeconds = 0;

function updateTimer() {
  totalSeconds++;
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const ss = String(totalSeconds % 60).padStart(2, '0');
  timerText.textContent = `الوقت المهدر: ${toArabicNumerals(mm)}:${toArabicNumerals(ss)}`;
}

setInterval(updateTimer, 1000);

// ─── Core filter fetch — returns a good article or null ──────────────────────────────────

const sleep = ms => new Promise(res => setTimeout(res, ms));

async function fetchFiltered() {
  const MAX_ATTEMPTS = 20;
  let attempts = 0;
  let lastClean = null;

  while (attempts < MAX_ATTEMPTS) {
    attempts++;
    if (attempts > 1) await sleep(300);

    let candidate;
    try {
      const response = await fetch(WIKIPEDIA_API, { headers: { Accept: 'application/json' } });
      if (!response.ok) continue;
      candidate = await response.json();
    } catch {
      continue;
    }

    if (isBlacklisted(candidate)) continue;
    if (isInteresting(candidate)) return candidate;

    lastClean = candidate;
  }

  return lastClean; // fallback: best clean article found, or null
}

// ─── Show next article (uses pre-fetched result) ──────────────────────────────────

async function showNextArticle() {
  showLoading();
  fetchBtn.disabled = true;
  fetchBtnLabel.textContent = 'جاري الحفر...';
  saveBtn.classList.remove('saved');
  saveBtn.querySelector('.save-label').textContent = 'حفظ المقالة';

  try {
    const article = await prefetchPromise;

    if (article) {
      renderArticle(article);
    } else {
      showError();
    }
  } catch {
    showError();
  } finally {
    fetchBtn.disabled = false;
    fetchBtnLabel.textContent = 'أعطني حفرة أعمق!';
  }

  // Immediately start fetching the next one in the background
  prefetchPromise = fetchFiltered();
}

// ─── Render ──────────────────────────────────

function renderArticle(data) {
  titleEl.textContent = data.title || '';
  descriptionEl.textContent = data.description || '';
  extractEl.textContent = data.extract || '';

  currentArticle = {
    title: data.title || '',
    url: data.content_urls?.desktop?.page
      || `https://ar.wikipedia.org/wiki/${encodeURIComponent(data.titles?.canonical || data.title || '')}`,
  };

  // Save button state
  const favs = loadFavorites();
  const alreadySaved = favs.some(f => f.url === currentArticle.url);
  if (alreadySaved) {
    saveBtn.classList.add('saved');
    saveBtn.querySelector('.save-label').textContent = 'محفوظة ✓';
  } else {
    saveBtn.classList.remove('saved');
    saveBtn.querySelector('.save-label').textContent = 'حفظ المقالة';
  }

  if (data.thumbnail?.source) {
    imageEl.src = data.thumbnail.source;
    imageEl.alt = data.title || '';
    imageEl.classList.remove('hidden');
  } else {
    imageEl.src = '';
    imageEl.classList.add('hidden');
  }

  updateStreak();

  loadingEl.classList.add('hidden');
  errorEl.classList.add('hidden');

  // Trigger fade-in by resetting the animation class
  articleEl.classList.remove('fade-in');
  articleEl.classList.add('hidden');
  void articleEl.offsetWidth; // force reflow
  articleEl.classList.remove('hidden');
  articleEl.classList.add('fade-in');
}

function showLoading() {
  articleEl.classList.add('hidden');
  articleEl.classList.remove('fade-in');
  errorEl.classList.add('hidden');
  loadingEl.classList.remove('hidden');
}

function showError() {
  loadingEl.classList.add('hidden');
  articleEl.classList.add('hidden');
  errorEl.classList.remove('hidden');
}

// ─── Share Button (navigator.share → clipboard fallback) ──────────────────────────────────

shareBtn.addEventListener('click', async () => {
  if (!currentArticle) return;

  const shareText = `اكتشفت هذا في حفرة الأرنب: ${currentArticle.title} - ${currentArticle.url}`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: currentArticle.title,
        text: shareText,
        url: currentArticle.url,
      });
      return; // native share sheet handled it — no extra feedback needed
    } catch (err) {
      if (err.name === 'AbortError') return; // user cancelled — do nothing
    }
  }

  // Clipboard fallback
  try {
    await navigator.clipboard.writeText(currentArticle.url);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = currentArticle.url;
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  shareBtn.classList.add('copied');
  shareLabel.textContent = 'تم النسخ! ✓';
  setTimeout(() => {
    shareBtn.classList.remove('copied');
    shareLabel.textContent = 'شارك هذه الحفرة';
  }, 2000);
});

// ─── Save to Favorites ──────────────────────────────────

function loadFavorites() {
  try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'); }
  catch { return []; }
}

function saveFavorites(favs) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
}

function renderFavorites() {
  const favs = loadFavorites();

  if (favs.length > 0) {
    favBadge.textContent = toArabicNumerals(favs.length);
    favBadge.classList.remove('hidden');
  } else {
    favBadge.classList.add('hidden');
  }

  favList.innerHTML = '';

  if (favs.length === 0) {
    favEmpty.classList.remove('hidden');
    return;
  }

  favEmpty.classList.add('hidden');

  favs.forEach((fav, index) => {
    const li = document.createElement('li');

    const link = document.createElement('a');
    link.href = fav.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = fav.title;
    link.className = 'fav-link';

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'حذف';
    deleteBtn.className = 'fav-delete';
    deleteBtn.addEventListener('click', () => {
      const updated = loadFavorites().filter((_, i) => i !== index);
      saveFavorites(updated);
      renderFavorites();
      if (currentArticle && fav.url === currentArticle.url) {
        saveBtn.classList.remove('saved');
        saveBtn.querySelector('.save-label').textContent = 'حفظ المقالة';
      }
    });

    li.appendChild(link);
    li.appendChild(deleteBtn);
    favList.appendChild(li);
  });
}

saveBtn.addEventListener('click', () => {
  if (!currentArticle) return;

  const favs = loadFavorites();
  if (favs.some(f => f.url === currentArticle.url)) return;

  favs.unshift({ title: currentArticle.title, url: currentArticle.url });
  saveFavorites(favs);
  renderFavorites();

  saveBtn.classList.add('saved');
  saveBtn.querySelector('.save-label').textContent = 'محفوظة ✓';

  if (favs.length === 1) openFavorites();
});

// ─── Favorites Toggle ──────────────────────────────────

let favOpen = false;

function openFavorites() {
  favOpen = true;
  favBody.classList.remove('hidden');
  toggleChevron.classList.add('open');
}

function closeFavorites() {
  favOpen = false;
  favBody.classList.add('hidden');
  toggleChevron.classList.remove('open');
}

favToggle.addEventListener('click', () => favOpen ? closeFavorites() : openFavorites());

// ─── Init ──────────────────────────────────

fetchBtn.addEventListener('click', showNextArticle);
renderFavorites();

// Kick off first fetch, then immediately show it (and queue the second)
prefetchPromise = fetchFiltered();
showNextArticle();
