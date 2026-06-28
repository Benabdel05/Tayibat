// ============================================================
// ÉTAT GLOBAL
// ============================================================
let DATA = { categories: [] };
let ALL_ITEMS = []; // index plat de toutes les entrées, avec catégorie attachée

const LS_LAST_QUIZ = "espanol-app:last-quiz-ids";

// ============================================================
// CHARGEMENT DES DONNÉES
// ============================================================
async function loadData() {
  const res = await fetch("data.json");
  if (!res.ok) throw new Error("Impossible de charger data.json");
  DATA = await res.json();
  ALL_ITEMS = [];
  DATA.categories.forEach(cat => {
    cat.items.forEach(item => {
      ALL_ITEMS.push({ ...item, categoryId: cat.id, categoryName: cat.name });
    });
  });
}

// ============================================================
// NAVIGATION ENTRE VUES
// ============================================================
function showView(viewId) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById("view-" + viewId).classList.add("active");
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  const tab = document.querySelector(`.tab[data-view="${viewId}"]`);
  if (tab) tab.classList.add("active");
}

function initNav() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => showView(tab.dataset.view));
  });
}

// ============================================================
// NORMALISATION DE TEXTE (accents, casse) pour comparaisons
// ============================================================
function normalize(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!.,;:]/g, "")
    .trim();
}

// ============================================================
// LEÇONS
// ============================================================
function renderCategoriesGrid() {
  const grid = document.getElementById("categories-grid");
  grid.innerHTML = "";
  const tileColors = {
    essentiels: "var(--terracotta)",
    expresiones: "var(--ochre)",
    cafe: "var(--azulejo)",
    viaje: "var(--olive)",
    trabajo: "var(--brick)"
  };
  const tileEmojis = {
    essentiels: "🗣️",
    expresiones: "✨",
    cafe: "☕",
    viaje: "✈️",
    trabajo: "💼"
  };
  DATA.categories.forEach(cat => {
    const btn = document.createElement("button");
    btn.className = "cat-tile";
    btn.style.setProperty("--tile-color", tileColors[cat.id] || "var(--terracotta)");
    btn.innerHTML = `
      <span class="cat-tile-emoji">${tileEmojis[cat.id] || "📚"}</span>
      <h3>${cat.name}</h3>
      <p>${cat.subtitle}</p>
      <span class="cat-count">${cat.items.length} entrées</span>
    `;
    btn.addEventListener("click", () => openCategory(cat.id));
    grid.appendChild(btn);
  });
}

function openCategory(catId) {
  const cat = DATA.categories.find(c => c.id === catId);
  if (!cat) return;
  document.getElementById("categorie-titre").textContent = cat.name;
  document.getElementById("categorie-soustitre").textContent = cat.subtitle;
  const list = document.getElementById("categorie-items");
  list.innerHTML = cat.items.map(renderLexCard).join("");
  showView("categorie");
}

function renderLexCard(item) {
  return `
    <article class="lex-card">
      <div class="lex-head">
        <span class="lex-es">${item.es}</span>
        <span class="lex-fr">${item.fr}</span>
      </div>
      <div class="lex-examples">
        <em>${item.example_es}</em><br>${item.example_fr}
      </div>
    </article>
  `;
}

// ============================================================
// ÉPREUVE — moteur de quiz, anti-répétition (dernière épreuve)
// ============================================================
let quizState = {
  questions: [],
  index: 0,
  score: 0,
  review: [],
  answered: false
};

function getLastQuizIds() {
  try {
    return JSON.parse(localStorage.getItem(LS_LAST_QUIZ)) || [];
  } catch {
    return [];
  }
}

function setLastQuizIds(ids) {
  localStorage.setItem(LS_LAST_QUIZ, JSON.stringify(ids));
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQuizPool() {
  const lastIds = new Set(getLastQuizIds());
  let pool = ALL_ITEMS.filter(it => !lastIds.has(it.id));
  // Si le pool restant est insuffisant pour 20 questions, on complète avec le reste
  if (pool.length < 20) {
    const excluded = ALL_ITEMS.filter(it => lastIds.has(it.id));
    pool = shuffle([...pool, ...excluded]);
  }
  return shuffle(pool).slice(0, 20);
}

function buildDistractors(correctItem, count) {
  // Distracteurs pris en priorité dans la même catégorie pour rester plausibles
  const sameCategory = ALL_ITEMS.filter(
    it => it.categoryId === correctItem.categoryId && it.id !== correctItem.id
  );
  const others = ALL_ITEMS.filter(
    it => it.categoryId !== correctItem.categoryId && it.id !== correctItem.id
  );
  const pool = shuffle([...sameCategory, ...shuffle(others)]);
  return pool.slice(0, count);
}

function makeQuestion(item) {
  const direction = Math.random() < 0.5 ? "es-fr" : "fr-es";
  const distractors = buildDistractors(item, 3);
  const field = direction === "es-fr" ? "fr" : "es";
  const promptField = direction === "es-fr" ? "es" : "fr";
  const options = shuffle([
    { text: item[field], correct: true },
    ...distractors.map(d => ({ text: d[field], correct: false }))
  ]);
  return {
    itemId: item.id,
    direction,
    promptText: item[promptField],
    options,
    correctText: item[field]
  };
}

function startQuiz() {
  const pool = buildQuizPool();
  quizState = {
    questions: pool.map(makeQuestion),
    index: 0,
    score: 0,
    review: [],
    answered: false
  };
  setLastQuizIds(pool.map(it => it.id));
  document.getElementById("quiz-intro").classList.add("hidden");
  document.getElementById("quiz-result").classList.add("hidden");
  document.getElementById("quiz-running").classList.remove("hidden");
  renderQuizQuestion();
}

function renderQuizQuestion() {
  const total = quizState.questions.length;
  const q = quizState.questions[quizState.index];
  quizState.answered = false;

  document.getElementById("quiz-progress-label").textContent = `Question ${quizState.index + 1} / ${total}`;
  document.getElementById("quiz-progress-fill").style.width = `${((quizState.index) / total) * 100}%`;
  document.getElementById("quiz-direction").textContent =
    q.direction === "es-fr" ? "Traduisez vers le français" : "Traduisez vers l'espagnol";
  document.getElementById("quiz-question").textContent = q.promptText;
  document.getElementById("quiz-feedback").textContent = "";
  document.getElementById("quiz-feedback").className = "quiz-feedback";
  document.getElementById("btn-next-question").classList.add("hidden");

  const optionsBox = document.getElementById("quiz-options");
  optionsBox.innerHTML = "";
  q.options.forEach(opt => {
    const btn = document.createElement("button");
    btn.className = "quiz-option";
    btn.textContent = opt.text;
    btn.addEventListener("click", () => handleAnswer(btn, opt, q));
    optionsBox.appendChild(btn);
  });
}

function handleAnswer(btn, opt, question) {
  if (quizState.answered) return;
  quizState.answered = true;

  const allBtns = document.querySelectorAll("#quiz-options .quiz-option");
  allBtns.forEach(b => (b.disabled = true));

  const feedback = document.getElementById("quiz-feedback");
  if (opt.correct) {
    quizState.score++;
    btn.classList.add("correct");
    feedback.textContent = "Correct.";
    feedback.classList.add("correct-text");
  } else {
    btn.classList.add("incorrect");
    feedback.textContent = `Incorrect — réponse attendue : ${question.correctText}`;
    feedback.classList.add("incorrect-text");
    allBtns.forEach(b => {
      if (b.textContent === question.correctText) b.classList.add("correct");
    });
  }

  quizState.review.push({
    prompt: question.promptText,
    correctText: question.correctText,
    givenText: opt.text,
    isCorrect: opt.correct
  });

  document.getElementById("btn-next-question").classList.remove("hidden");
}

function nextQuestion() {
  quizState.index++;
  if (quizState.index >= quizState.questions.length) {
    finishQuiz();
  } else {
    renderQuizQuestion();
  }
}

function finishQuiz() {
  document.getElementById("quiz-running").classList.add("hidden");
  document.getElementById("quiz-result").classList.remove("hidden");
  const total = quizState.questions.length;
  document.getElementById("quiz-score-title").textContent = `${quizState.score} / ${total}`;
  const pct = Math.round((quizState.score / total) * 100);
  document.getElementById("quiz-score-detail").textContent =
    `Taux de réussite : ${pct} %. La prochaine épreuve évitera ces ${total} questions.`;

  const reviewBox = document.getElementById("quiz-review");
  reviewBox.innerHTML = quizState.review.map(r => `
    <div class="quiz-review-item ${r.isCorrect ? "" : "wrong"}">
      <span class="${r.isCorrect ? "ok-mark" : "ko-mark"}">${r.isCorrect ? "✓" : "✗"}</span>
      ${r.prompt} → attendu : <strong>${r.correctText}</strong>${r.isCorrect ? "" : ` (réponse donnée : ${r.givenText})`}
    </div>
  `).join("");
}

function initQuizUI() {
  document.getElementById("quiz-pool-info").textContent =
    `Lexique disponible : ${ALL_ITEMS.length} entrées. Chaque épreuve en tire 20 au hasard.`;
  document.getElementById("btn-start-quiz").addEventListener("click", startQuiz);
  document.getElementById("btn-next-question").addEventListener("click", nextQuestion);
  document.getElementById("btn-retry-quiz").addEventListener("click", () => {
    document.getElementById("quiz-result").classList.add("hidden");
    document.getElementById("quiz-intro").classList.remove("hidden");
  });
}

// ============================================================
// RECHERCHE — explication bilingue + exemple
// ============================================================
function runSearch(query) {
  const status = document.getElementById("search-status");
  const results = document.getElementById("search-results");
  const q = normalize(query);

  if (!q) {
    status.textContent = "";
    results.innerHTML = "";
    return;
  }

  const matches = ALL_ITEMS.filter(it =>
    normalize(it.es).includes(q) ||
    normalize(it.fr).includes(q) ||
    normalize(it.example_es).includes(q) ||
    normalize(it.example_fr).includes(q)
  );

  if (matches.length === 0) {
    status.textContent = `Aucune entrée trouvée pour « ${query} » dans le lexique actuel.`;
    results.innerHTML = "";
    return;
  }

  status.textContent = `${matches.length} résultat(s) pour « ${query} ».`;
  results.innerHTML = matches.map(renderLexCard).join("");
}

function initSearchUI() {
  const input = document.getElementById("search-input");
  input.addEventListener("input", () => runSearch(input.value));
}

// ============================================================
// TRADUCTEUR — dictionnaire local, recherche exacte puis mot à mot
// ============================================================
function findExactEntry(text, sourceField) {
  const n = normalize(text);
  return ALL_ITEMS.find(it => normalize(it[sourceField]) === n);
}

function translateWordByWord(text, sourceField, targetField) {
  const exact = findExactEntry(text, sourceField);
  if (exact) {
    return { html: `<span class="tok-known">${exact[targetField]}</span>`, fullMatch: true };
  }

  const words = text.split(/(\s+)/); // garde les espaces pour reconstruire le texte
  const htmlParts = words.map(token => {
    if (/^\s+$/.test(token) || token === "") return token;
    const cleaned = token.replace(/[¿?¡!.,;:]/g, "");
    const entry = findExactEntry(cleaned, sourceField);
    if (entry) {
      return `<span class="tok-known">${entry[targetField]}</span>`;
    }
    return `<span class="tok-unknown">${token}</span>`;
  });
  return { html: htmlParts.join(""), fullMatch: false };
}

function setTranslatorNote(message) {
  document.getElementById("trad-note").textContent = message;
}

function translateEsToFr() {
  const esText = document.getElementById("trad-es").value.trim();
  if (!esText) { setTranslatorNote("Saisissez un texte en espagnol."); return; }
  const result = translateWordByWord(esText, "es", "fr");
  document.getElementById("trad-fr").innerHTML = "";
  document.getElementById("trad-fr").value = stripHtml(result.html);
  showInlineTranslation("trad-fr", result.html);
  setTranslatorNote(result.fullMatch
    ? "Expression reconnue dans le lexique : traduction exacte."
    : "Traduction mot à mot : les termes en rouge ne figurent pas encore dans le lexique.");
}

function translateFrToEs() {
  const frText = document.getElementById("trad-fr").value.trim();
  if (!frText) { setTranslatorNote("Saisissez un texte en français."); return; }
  const result = translateWordByWord(frText, "fr", "es");
  document.getElementById("trad-es").value = stripHtml(result.html);
  showInlineTranslation("trad-es", result.html);
  setTranslatorNote(result.fullMatch
    ? "Expression reconnue dans le lexique : traduction exacte."
    : "Traduction mot à mot : les termes en rouge ne figurent pas encore dans le lexique.");
}

function stripHtml(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent;
}

// Les <textarea> n'acceptent pas de HTML ; on affiche la version colorée
// dans une bulle dédiée sous forme de note, tout en gardant le texte brut dans le champ.
function showInlineTranslation(targetId, html) {
  let bubble = document.getElementById(targetId + "-highlight");
  if (!bubble) {
    bubble = document.createElement("div");
    bubble.id = targetId + "-highlight";
    bubble.className = "voice-transcript";
    bubble.style.marginTop = "0.5rem";
    document.getElementById(targetId).insertAdjacentElement("afterend", bubble);
  }
  bubble.innerHTML = html;
}

function initTranslatorUI() {
  document.getElementById("btn-translate-to-fr").addEventListener("click", translateEsToFr);
  document.getElementById("btn-translate-to-es").addEventListener("click", translateFrToEs);
  document.getElementById("btn-swap").addEventListener("click", () => {
    const es = document.getElementById("trad-es");
    const fr = document.getElementById("trad-fr");
    const tmp = es.value;
    es.value = fr.value;
    fr.value = tmp;
  });
}

// ============================================================
// VOIX — Web Speech API (SpeechRecognition + SpeechSynthesis)
// ============================================================
const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognizer = null;
let isListening = false;

function initVoiceUI() {
  const warningBox = document.getElementById("voice-support-warning");
  const micBtn = document.getElementById("btn-mic");
  const micLabel = document.getElementById("mic-label");
  const transcriptBox = document.getElementById("voice-transcript");
  const translationBox = document.getElementById("voice-translation");
  const btnListenEs = document.getElementById("btn-listen-es");
  const btnListenFr = document.getElementById("btn-listen-fr");

  if (!SpeechRecognitionAPI) {
    warningBox.textContent =
      "La reconnaissance vocale n'est pas disponible sur ce navigateur (Firefox la maintient désactivée par défaut). Utilisez Chrome, Edge ou Safari pour cette fonctionnalité.";
    warningBox.classList.remove("hidden");
    micBtn.disabled = true;
    micLabel.textContent = "Indisponible sur ce navigateur";
    return;
  }

  recognizer = new SpeechRecognitionAPI();
  recognizer.lang = "es-ES";
  recognizer.continuous = true;
  recognizer.interimResults = true;

  let finalTranscript = "";

  recognizer.addEventListener("result", (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcriptPart = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcriptPart + " ";
      } else {
        interim += transcriptPart;
      }
    }
    transcriptBox.textContent = (finalTranscript + interim).trim() || "—";
    const result = translateWordByWord(finalTranscript.trim() || interim.trim(), "es", "fr");
    translationBox.innerHTML = result.html || "—";
    btnListenEs.disabled = !(finalTranscript.trim() || interim.trim());
    btnListenFr.disabled = !(finalTranscript.trim() || interim.trim());
  });

  recognizer.addEventListener("error", () => {
    stopListening();
  });

  recognizer.addEventListener("end", () => {
    if (isListening) {
      // Le service s'arrête parfois seul ; on relance si l'utilisateur n'a pas cliqué sur stop
      recognizer.start();
    }
  });

  micBtn.addEventListener("click", () => {
    if (isListening) {
      stopListening();
    } else {
      finalTranscript = "";
      transcriptBox.textContent = "—";
      translationBox.innerHTML = "—";
      startListening();
    }
  });

  function startListening() {
    isListening = true;
    micBtn.setAttribute("aria-pressed", "true");
    document.getElementById("mic-icon").textContent = "⏹️";
    micLabel.textContent = "Appuyer pour arrêter";
    try {
      recognizer.start();
    } catch (e) {
      // déjà démarré, on ignore
    }
  }

  function stopListening() {
    isListening = false;
    micBtn.setAttribute("aria-pressed", "false");
    document.getElementById("mic-icon").textContent = "🎙️";
    micLabel.textContent = "Appuyer pour parler";
    try { recognizer.stop(); } catch (e) {}
  }

  btnListenEs.addEventListener("click", () => speak(transcriptBox.textContent, "es-ES"));
  btnListenFr.addEventListener("click", () => speak(translationBox.textContent, "fr-FR"));
}

function speak(text, lang) {
  if (!("speechSynthesis" in window) || !text || text === "—") return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

// ============================================================
// INITIALISATION
// ============================================================
async function init() {
  initNav();
  document.getElementById("btn-back-categories").addEventListener("click", () => showView("lecons"));

  try {
    await loadData();
  } catch (e) {
    document.getElementById("app").innerHTML =
      `<p class="warning-box">Erreur de chargement du lexique (data.json). Vérifiez que le fichier est bien présent à la racine du dépôt.</p>`;
    return;
  }

  renderCategoriesGrid();
  initQuizUI();
  initSearchUI();
  initTranslatorUI();
  initVoiceUI();
}

document.addEventListener("DOMContentLoaded", init);
