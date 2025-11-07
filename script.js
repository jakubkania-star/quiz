// ========== CONFIG ==========
const firebaseConfig = {
  apiKey: "AIzaSyDdNND7UI58ydXX54t9VphiKSvh4BlFjUA",
  authDomain: "realtime-quiz-9a662.firebaseapp.com",
  projectId: "realtime-quiz-9a662",
  storageBucket: "realtime-quiz-9a662.firebasestorage.app",
  messagingSenderId: "1083388784503",
  appId: "1:1083388784503:web:b7d31f07741bcda1b73b72"
};

const TOTAL_QUESTIONS = 20;
const MIN_YEAR = 1990;
const MAX_YEAR = 2025;

// správné odpovědi
const CORRECT = [2005, 2017, 2003, 2014, 2020, 1990, 2011, 1997, 2007, 2023, 2012, 1998, 2006, 1992, 1999, 1997, 2003, 2011, 2008, 2010];

// scoring function
function scoreForDiff(diff) {
  diff = Math.abs(diff);
  if (diff === 0) return 100;
  if (diff === 1) return 80;
  if (diff === 2) return 60;
  if (diff === 3) return 40;
  if (diff === 4) return 20;
  return 0;
}

// ========== INIT FIREBASE ==========
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

function idFromName(name) {
  return name.trim().replace(/\s+/g, '_').replace(/[^\w\-]/g, '').toLowerCase();
}

// ========== GLOBAL STATE ==========
let localPlayerName = localStorage.getItem('playerName') || null;
let localPlayerId = localPlayerName ? idFromName(localPlayerName) : null;
let localCurrentQuestion = 1;
let quizOpen = false;

// ========== ADMIN ==========
async function setQuizState(newState) {
  await db.collection('quiz').doc('state').set(newState, { merge: true });
}

async function startQuestion() {
  const snap = await db.collection('quiz').doc('state').get();
  let cur = snap.exists && snap.data().currentQuestion ? snap.data().currentQuestion : 1;
  await setQuizState({ currentQuestion: cur, open: true });
}

async function endAndNext() {
  const snap = await db.collection('quiz').doc('state').get();
  let cur = snap.exists && snap.data().currentQuestion ? snap.data().currentQuestion : 1;
  await setQuizState({ open: false });
  const next = (cur < TOTAL_QUESTIONS) ? cur + 1 : cur;
  await setQuizState({ currentQuestion: next, open: false });
}

async function prevQuestion() {
  const snap = await db.collection('quiz').doc('state').get();
  let cur = snap.exists && snap.data().currentQuestion ? snap.data().currentQuestion : 1;
  const prev = (cur > 1) ? cur - 1 : 1;
  await setQuizState({ currentQuestion: prev, open: false });
}

async function resetAll() {
  const players = await db.collection('players').get();
  const batch = db.batch();
  players.forEach(d => batch.delete(d.ref));
  await batch.commit();
  await setQuizState({ currentQuestion: 1, open: false });
}

// ========== PLAYER ==========
async function playerJoin(name) {
  if (!name) return;
  const cleanName = name.trim();

  // kontrola duplicit
  const existing = await db.collection('players').where('name', '==', cleanName).get();
  if (!existing.empty) {
    alert('Toto jméno už někdo používá. Zadej jiné.');
    throw new Error('duplicate_name');
  }

  localPlayerName = cleanName;
  localPlayerId = idFromName(cleanName);
  localStorage.setItem('playerName', cleanName);

  const ref = db.collection('players').doc(localPlayerId);
  await ref.set({ name: cleanName, score: 0 }, { merge: true });
}

async function restorePlayerSession() {
  if (!localPlayerName || !localPlayerId) return false;

  const ref = db.collection('players').doc(localPlayerId);
  const snap = await ref.get();

  if (!snap.exists) {
    localStorage.removeItem('playerName');
    localPlayerName = null;
    localPlayerId = null;
    return false;
  }

  document.getElementById('currentPlayerName').textContent = `Hraješ jako: ${localPlayerName}`;
  document.getElementById('loginBox').style.display = 'none';
  document.getElementById('quizBox').style.display = 'block';
  return true;
}

async function submitPlayerAnswer(year) {
  if (!localPlayerName) return alert('Nejprve se přihlas.');
  if (!quizOpen) return alert('Hlasování není otevřené.');
  if (isNaN(year) || year < MIN_YEAR || year > MAX_YEAR)
    return alert(`Zadej platný rok (${MIN_YEAR}–${MAX_YEAR}).`);

  const qKey = `q${localCurrentQuestion}`;
  const answeredKey = `answered_q${localCurrentQuestion}`;
  const playerRef = db.collection('players').doc(localPlayerId);
  const playerSnap = await playerRef.get();
  const data = playerSnap.exists ? playerSnap.data() : {};

  if (data[answeredKey]) return alert('Na tuto otázku jsi už odpověděl.');

  const correct = CORRECT[localCurrentQuestion - 1] || null;
  let points = correct ? scoreForDiff(year - correct) : 0;

  await db.runTransaction(async (tx) => {
    const pSnap = await tx.get(playerRef);
    const prevScore = pSnap.exists && pSnap.data().score ? pSnap.data().score : 0;
    tx.set(playerRef, {
      [qKey]: year,
      [answeredKey]: true,
      score: prevScore + points,
      lastAnsweredAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  });

  const status = document.getElementById('status');
  status.textContent = '✅ Odpověď odeslána!';
  status.className = "sent";

  setTimeout(() => {
    if (status.className === "sent") status.textContent = '';
  }, 10000); // po 10s smaže nápis
}

// ========== UI ==========
function attachAdminListeners() {
  const startBtn = document.getElementById('startQuestionBtn');
  const endBtn = document.getElementById('endAndNextBtn');
  const prevBtn = document.getElementById('prevQuestionBtn');
  const label = document.getElementById('currentQuestionLabel');

  if (startBtn) startBtn.addEventListener('click', startQuestion);
  if (endBtn) endBtn.addEventListener('click', endAndNext);
  if (prevBtn) prevBtn.addEventListener('click', prevQuestion);

  db.collection('quiz').doc('state').onSnapshot((snap) => {
    const data = snap.exists ? snap.data() : { currentQuestion: 1, open: false };
    localCurrentQuestion = data.currentQuestion || 1;
    quizOpen = !!data.open;

    label.textContent = `Otázka: ${localCurrentQuestion} ${quizOpen ? '🟢 otevřeno' : '🔴 zavřeno'}`;
  });

  db.collection('players').onSnapshot(async (snap) => {
    const rows = [];
    snap.forEach(d => rows.push(d.data()));
    rows.sort((a,b) => (b.score || 0) - (a.score || 0));
    const tbody = document.querySelector('#leaderboardTable tbody');
    const s = await db.collection('quiz').doc('state').get();
    const curQ = s.exists && s.data().currentQuestion ? s.data().currentQuestion : 1;

    if (tbody) {
      tbody.innerHTML = rows.map((p, idx) => {
        const answered = p[`answered_q${curQ}`] ? '✅' : '❌';
        return `<tr>
          <td>${idx+1}</td>
          <td>${p.name || '—'}</td>
          <td>${p.score || 0}</td>
          <td>${answered}</td>
        </tr>`;
      }).join('');
    }
  });
}

function attachPlayerListeners() {
  const joinBtn = document.getElementById('joinBtn');
  const nameInput = document.getElementById('playerNameInput');
  const quizBox = document.getElementById('quizBox');
  const loginBox = document.getElementById('loginBox');
  const currentNameLabel = document.getElementById('currentPlayerName');

  if (joinBtn) {
    joinBtn.addEventListener('click', async () => {
      const name = nameInput.value.trim();
      if (!name) return alert('Zadej jméno.');
      try {
        await playerJoin(name);
        currentNameLabel.textContent = `Hraješ jako: ${name}`;
        loginBox.style.display = 'none';
        quizBox.style.display = 'block';
      } catch (e) {
        if (e.message === 'duplicate_name') return;
        console.error(e);
      }
    });
  }

  // obnova relace
  restorePlayerSession();

  const submitBtn = document.getElementById('submitBtn');
  if (submitBtn) submitBtn.addEventListener('click', async () => {
    const val = parseInt(document.getElementById('answerInput').value);
    await submitPlayerAnswer(val);
  });

  db.collection('quiz').doc('state').onSnapshot((snap) => {
    const data = snap.exists ? snap.data() : { currentQuestion: 1, open: false };
    localCurrentQuestion = data.currentQuestion || 1;
    quizOpen = !!data.open;

    document.getElementById('questionNumber').textContent = localCurrentQuestion;
    document.getElementById('status').textContent = ''; // smaže nápis po změně otázky

    const info = document.getElementById('info');
    if (quizOpen) info.textContent = '🟢 Hlasování otevřeno!';
    else info.textContent = '🔴 Hlasování zavřeno.';
  });
}

function attachLeaderboardPage() {
  const tbody = document.querySelector('#leaderboardTable tbody');
  const label = document.getElementById('currentQuestionLabel');

  db.collection('quiz').doc('state').onSnapshot((snap) => {
    const data = snap.exists ? snap.data() : { currentQuestion: 1 };
    const cur = data.currentQuestion || 1;
    label.textContent = `Otázka: ${cur}`;

    db.collection('players').onSnapshot((snap2) => {
      const players = [];
      snap2.forEach(d => players.push(d.data()));
      players.sort((a,b) => (b.score || 0) - (a.score || 0));
      
   tbody.innerHTML = players.map((p, idx) => {
  const answered = p[`answered_q${cur}`] ? '✅' : '❌';
  const rowClass = idx === 0 ? 'first-place' : '';
  return `<tr class="${rowClass}">
    <td>${idx+1}</td>
    <td>${p.name || '-'}</td>
    <td>${p.score || 0}</td>
    <td class="${p[`answered_q${cur}`] ? 'answered' : 'not-answered'}">${answered}</td>
  </tr>`;
}).join('');


      
    });
  });
}

function attachResetPage() {
  const btn = document.getElementById('confirmReset');
  const res = document.getElementById('resetResult');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Mažu...';
    await resetAll();
    res.textContent = '✅ Kvíz byl resetován.';
    btn.textContent = 'Smazat výsledky a nastavit otázku na 1';
    btn.disabled = false;
  });
}

// ========== INIT ==========
window.addEventListener('DOMContentLoaded', () => {
  const page = document.body.getAttribute('data-page');
  if (page === 'admin') attachAdminListeners();
  if (page === 'player') attachPlayerListeners();
  if (page === 'leaderboard') attachLeaderboardPage();
  if (page === 'reset') attachResetPage();
});
