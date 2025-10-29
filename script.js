// ========== CONFIG ==========
const firebaseConfig = {
  apiKey: "AIzaSyDdNND7UI58ydXX54t9VphiKSvh4BlFjUA",
  authDomain: "realtime-quiz-9a662.firebaseapp.com",
  projectId: "realtime-quiz-9a662",
  storageBucket: "realtime-quiz-9a662.firebasestorage.app",
  messagingSenderId: "1083388784503",
  appId: "1:1083388784503:web:b7d31f07741bcda1b73b72"
};

const TOTAL_QUESTIONS = 5;
const MIN_YEAR = 1990;
const MAX_YEAR = 2025;

// správné odpovědi (zde můžeš upravit)
const CORRECT = [2013, 2007, 2004, 2021, 2005];

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

// utility: sanitize name for doc id
function idFromName(name) {
  return name.trim().replace(/\s+/g, '_').replace(/[^\w\-]/g, '').toLowerCase();
}

// ========== ADMIN ACTIONS ==========
async function setQuizState(newState) {
  await db.collection('quiz').doc('state').set(newState, { merge: true });
}

async function startQuestion() {
  // open voting (keep currentQuestion)
  const snap = await db.collection('quiz').doc('state').get();
  let cur = snap.exists && snap.data().currentQuestion ? snap.data().currentQuestion : 1;
  await setQuizState({ currentQuestion: cur, open: true });
}

async function endAndNext() {
  // close voting, then increment question (if not last)
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

// reset (used by reset page)
async function resetAll() {
  // delete players
  const players = await db.collection('players').get();
  const batch = db.batch();
  players.forEach(d => batch.delete(d.ref));
  await batch.commit();
  // reset state doc
  await setQuizState({ currentQuestion: 1, open: false });
}

// ========== PLAYER LOGIC ==========
let localPlayerName = localStorage.getItem('playerName') || null;
let localPlayerId = localPlayerName ? idFromName(localPlayerName) : null;
let localCurrentQuestion = 1;
let quizOpen = false;

async function playerJoin(name) {
  if (!name) return;
  localPlayerName = name.trim();
  localPlayerId = idFromName(localPlayerName);
  localStorage.setItem('playerName', localPlayerName);
  // create player doc if not exist
  const ref = db.collection('players').doc(localPlayerId);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({ name: localPlayerName, score: 0 });
  } else {
    // make sure name field is correct
    await ref.set({ name: localPlayerName }, { merge: true });
  }
}

async function submitPlayerAnswer(year) {
  if (!localPlayerName) return alert('Nejprve se přihlas.');
  if (!quizOpen) return alert('Hlasování pro tuto otázku není otevřené.');
  if (isNaN(year) || year < MIN_YEAR || year > MAX_YEAR) return alert(`Zadej platný rok mezi ${MIN_YEAR}–${MAX_YEAR}.`);

  const qKey = `q${localCurrentQuestion}`;
  const answeredKey = `answered_q${localCurrentQuestion}`;

  const playerRef = db.collection('players').doc(localPlayerId);
  const playerSnap = await playerRef.get();
  const data = playerSnap.exists ? playerSnap.data() : {};

  if (data[answeredKey]) {
    return alert('Na tuto otázku jsi již odpověděl.');
  }

  // compute points
  const correct = CORRECT[localCurrentQuestion - 1] || null;
  let points = 0;
  if (correct !== null) {
    points = scoreForDiff(year - correct);
  }

  // update: set answer and increment score atomically via transaction
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

  // UI feedback
  const status = document.getElementById('status');
  if (status) status.textContent = 'Odpověď odeslána. Čekej na další otázku.';
}

// ========== LISTENERS / UI SYNC ==========
function attachAdminListeners() {
  // elements
  const startBtn = document.getElementById('startQuestionBtn');
  const endBtn = document.getElementById('endAndNextBtn');
  const prevBtn = document.getElementById('prevQuestionBtn');
  const gotoReset = document.getElementById('gotoReset');

  if (startBtn) startBtn.addEventListener('click', startQuestion);
  if (endBtn) endBtn.addEventListener('click', endAndNext);
  if (prevBtn) prevBtn.addEventListener('click', prevQuestion);
  if (gotoReset) gotoReset.addEventListener('click', () => {
    window.open('/reset.html', '_blank');
  });

  // realtime state listener
  db.collection('quiz').doc('state').onSnapshot((snap) => {
    const data = snap.exists ? snap.data() : { currentQuestion: 1, open: false };
    const q = data.currentQuestion || 1;
    const open = !!data.open;
    localCurrentQuestion = q;
    quizOpen = open;
    const label = document.getElementById('currentQuestionLabel');
    if (label) label.textContent = `Otázka: ${q}`;
    const totalLabel = document.getElementById('totalQuestionsLabel');
    if (totalLabel) totalLabel.textContent = TOTAL_QUESTIONS;
  });

  // leaderboard realtime
  db.collection('players').onSnapshot((snap) => {
    const rows = [];
    snap.forEach(d => {
      const p = d.data();
      rows.push(p);
    });
    rows.sort((a,b) => (b.score || 0) - (a.score || 0));
    const tbody = document.querySelector('#leaderboardTable tbody');
    const stateDoc = document.getElementById('currentQuestionLabel');
    let curQ = 1;
    // try to read current question from state
    db.collection('quiz').doc('state').get().then(s => {
      if (s.exists && s.data().currentQuestion) curQ = s.data().currentQuestion;
      if (tbody) {
        tbody.innerHTML = rows.map((p, idx) => {
          const answered = p[`answered_q${curQ}`] ? 'Yes' : 'No';
          return `<tr>
            <td>${idx+1}</td>
            <td>${p.name || '—'}</td>
            <td>${p.score || 0}</td>
            <td>${answered}</td>
          </tr>`;
        }).join('');
      }
    });
  });
}

function attachPlayerListeners() {
  const joinBtn = document.getElementById('joinBtn');
  const nameInput = document.getElementById('playerNameInput');
  const quizBox = document.getElementById('quizBox');
  const loginBox = document.getElementById('loginBox');

  if (localPlayerName) {
    // hide login, show quiz
    if (loginBox) loginBox.style.display = 'none';
    if (quizBox) quizBox.style.display = 'block';
  } else {
    if (loginBox) loginBox.style.display = 'block';
    if (quizBox) quizBox.style.display = 'none';
  }

  if (joinBtn) {
    joinBtn.addEventListener('click', async () => {
      const name = nameInput.value && nameInput.value.trim();
      if (!name) return alert('Zadej prosím jméno.');
      await playerJoin(name);
      if (loginBox) loginBox.style.display = 'none';
      if (quizBox) quizBox.style.display = 'block';
    });
  }

  // submit
  const submitBtn = document.getElementById('submitBtn');
  if (submitBtn) submitBtn.addEventListener('click', async () => {
    const val = parseInt(document.getElementById('answerInput').value);
    await submitPlayerAnswer(val);
  });

  // listen to quiz state to update question and open/close UI
  db.collection('quiz').doc('state').onSnapshot((snap) => {
    const data = snap.exists ? snap.data() : { currentQuestion: 1, open: false };
    localCurrentQuestion = data.currentQuestion || 1;
    quizOpen = !!data.open;
    // update UI
    const qNumEl = document.getElementById('questionNumber');
    if (qNumEl) qNumEl.textContent = localCurrentQuestion;
    const status = document.getElementById('status');
    const info = document.getElementById('info');
    if (quizOpen) {
      if (status) status.textContent = '';
      if (info) info.textContent = 'Hlasování otevřeno — můžeš odpovědět.';
    } else {
      if (info) info.textContent = 'Hlasování zavřeno — čekej na admina.';
    }
  });
}

// leaderboard page
function attachLeaderboardPage() {
  const leaderDiv = document.getElementById('leaderboardView');
  const qDisp = document.getElementById('questionDisplay');

  // listen to state
  db.collection('quiz').doc('state').onSnapshot((snap) => {
    const data = snap.exists ? snap.data() : { currentQuestion: 1, open: false };
    const cur = data.currentQuestion || 1;
    if (qDisp) qDisp.textContent = cur;
    // update players
    db.collection('players').get().then(snap2 => {
      const players = [];
      snap2.forEach(d => players.push(d.data()));
      players.sort((a,b) => (b.score || 0) - (a.score || 0));
      leaderDiv.innerHTML = players.map((p, idx) => {
        const answered = p[`answered_q${cur}`] ? 'Yes' : 'No';
        return `<div>${idx+1}. ${p.name || '-'} — ${p.score || 0} bodů — answered: ${answered}</div>`;
      }).join('');
    });
  });

  // also realtime updates for players
  db.collection('players').onSnapshot(() => {
    // trigger refresh via state snapshot callback above (keeps logic simple)
    db.collection('quiz').doc('state').get().then(s => {
      const cur = s.exists && s.data().currentQuestion ? s.data().currentQuestion : 1;
      db.collection('players').get().then(snap2 => {
        const players = [];
        snap2.forEach(d => players.push(d.data()));
        players.sort((a,b) => (b.score || 0) - (a.score || 0));
        leaderDiv.innerHTML = players.map((p, idx) => {
          const answered = p[`answered_q${cur}`] ? 'Yes' : 'No';
          return `<div>${idx+1}. ${p.name || '-'} — ${p.score || 0} bodů — answered: ${answered}</div>`;
        }).join('');
      });
    });
  });
}

// reset page
function attachResetPage() {
  const btn = document.getElementById('confirmReset');
  const res = document.getElementById('resetResult');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Mažu...';
    await resetAll();
    if (res) res.textContent = 'Kvíz byl resetován.';
    btn.textContent = 'Smazat výsledky a nastavit otázku na 1';
    btn.disabled = false;
  });
}

// ========== BOOT ==========
window.addEventListener('DOMContentLoaded', () => {
  const page = document.body.getAttribute('data-page');

  if (page === 'admin') {
    // show total count
    const totalLabel = document.getElementById('totalQuestionsLabel');
    if (totalLabel) totalLabel.textContent = TOTAL_QUESTIONS;
    attachAdminListeners();
  }

  if (page === 'player') {
    attachPlayerListeners();
  }

  if (page === 'leaderboard') {
    attachLeaderboardPage();
  }

  if (page === 'reset') {
    attachResetPage();
  }
});
