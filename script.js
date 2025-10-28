// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDdNND7UI58ydXX54t9VphiKSvh4BlFjUA",
  authDomain: "realtime-quiz-9a662.firebaseapp.com",
  projectId: "realtime-quiz-9a662",
  storageBucket: "realtime-quiz-9a662.firebasestorage.app",
  messagingSenderId: "1083388784503",
  appId: "1:1083388784503:web:b7d31f07741bcda1b73b72"
};


// Kolik je otázek
const TOTAL_QUESTIONS = 5;

// Rozsah přijatelných odpovědí
const MIN_YEAR = 1990;
const MAX_YEAR = 2025;

// === FIREBASE INIT ===
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// === ADMIN PANEL ===
async function nextQuestion() {
  const quizRef = db.collection("quiz").doc("state");
  const snapshot = await quizRef.get();
  const current = snapshot.exists ? snapshot.data().currentQuestion : 1;
  const next = current + 1 > TOTAL_QUESTIONS ? TOTAL_QUESTIONS : current + 1;
  await quizRef.set({ currentQuestion: next }, { merge: true });
}

async function resetQuiz() {
  await db.collection("players").get().then((snap) => {
    snap.forEach((doc) => doc.ref.delete());
  });
  await db.collection("quiz").doc("state").set({ currentQuestion: 1 });
}

// === PLAYER LOGIKA ===
let playerName = localStorage.getItem("playerName") || "";
let currentQuestion = 1;

function showQuestion(num) {
  const qn = document.getElementById("questionNumber");
  if (qn) qn.textContent = num;
  const inp = document.getElementById("answerInput");
  if (inp) inp.value = "";
}

async function submitAnswer() {
  const answer = parseInt(document.getElementById("answerInput").value);
  if (isNaN(answer) || answer < MIN_YEAR || answer > MAX_YEAR) {
    alert(`Zadej číslo mezi ${MIN_YEAR} a ${MAX_YEAR}`);
    return;
  }

  await db.collection("players").doc(playerName).set({
    name: playerName,
    [`q${currentQuestion}`]: answer,
    score: 0
  }, { merge: true });

  document.getElementById("status").textContent = "Odpověď odeslána, čekej na další otázku...";
}

// === SLEDOVÁNÍ STAVU ===
function listenToQuestion() {
  db.collection("quiz").doc("state").onSnapshot((doc) => {
    if (doc.exists) {
      const newQ = doc.data().currentQuestion;
      const qDisp = document.getElementById("questionDisplay");
      if (qDisp) qDisp.textContent = newQ;

      if (newQ !== currentQuestion) {
        currentQuestion = newQ;
        showQuestion(currentQuestion);
        const st = document.getElementById("status");
        if (st) st.textContent = "";
      }
    }
  });
}

function listenToLeaderboard() {
  setInterval(async () => {
    const leaderboardDiv = document.getElementById("leaderboard");
    if (!leaderboardDiv) return;
    const snap = await db.collection("players").get();
    const players = [];
    snap.forEach((d) => players.push(d.data()));
    const sorted = players.sort((a, b) => (b.score || 0) - (a.score || 0));
    leaderboardDiv.innerHTML = sorted.map(
      (p, i) => `<div>${i + 1}. ${p.name} – ${p.score || 0} bodů</div>`
    ).join("");
  }, 2000); // aktualizace každé 2 s
}

// === RESET STRÁNKA ===
function handleResetPage() {
  document.getElementById("resetAllBtn").addEventListener("click", async () => {
    await resetQuiz();
    document.getElementById("resetStatus").textContent = "✅ Kvíz byl resetován.";
  });
}

// === START ===
window.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;

  if (page === "admin") {
    document.getElementById("nextBtn").addEventListener("click", nextQuestion);
    document.getElementById("resetBtn").addEventListener("click", resetQuiz);
    listenToLeaderboard();
  }

  if (page === "player") {
    if (!playerName) {
      playerName = prompt("Zadej své jméno:");
      localStorage.setItem("playerName", playerName);
    }
    listenToQuestion();
    document.getElementById("submitBtn").addEventListener("click", submitAnswer);
  }

  if (page === "leaderboard") {
    listenToQuestion();
    listenToLeaderboard();
  }

  if (page === "reset") {
    handleResetPage();
  }
});
