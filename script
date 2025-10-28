// === VLOŽ SEM SVŮJ FIREBASE CONFIG ===
const firebaseConfig = {
  apiKey: "AIzaSyDdNND7UI58ydXX54t9VphiKSvh4BlFjUA",
  authDomain: "realtime-quiz-9a662.firebaseapp.com",
  projectId: "realtime-quiz-9a662",
  storageBucket: "realtime-quiz-9a662.firebasestorage.app",
  messagingSenderId: "1083388784503",
  appId: "1:1083388784503:web:b7d31f07741bcda1b73b72"
};

// === Inicializace Firebase ===
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let playerName = localStorage.getItem("playerName");
let currentQuestion = 1;
const totalQuestions = 5; // ← zde můžeš snadno měnit počet otázek

// === Funkce pro hráče ===
const loginEl = document.getElementById("login");
const quizEl = document.getElementById("quiz");
const questionLabel = document.getElementById("questionLabel");
const answerInput = document.getElementById("answerInput");
const feedback = document.getElementById("feedback");

if (document.getElementById("joinBtn")) {
  document.getElementById("joinBtn").addEventListener("click", async () => {
    playerName = document.getElementById("playerName").value.trim();
    if (!playerName) return alert("Zadej své jméno!");
    localStorage.setItem("playerName", playerName);
    loginEl.style.display = "none";
    quizEl.style.display = "block";
  });

  document.getElementById("submitAnswer").addEventListener("click", async () => {
    const year = parseInt(answerInput.value);
    if (isNaN(year) || year < 1990 || year > 2025) {
      feedback.textContent = "Zadej platný rok (1990–2025).";
      return;
    }

    await db.collection("answers").add({
      name: playerName,
      question: currentQuestion,
      answer: year,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    });

    feedback.textContent = "Odpověď odeslána!";
    answerInput.value = "";
  });
}

// === Funkce pro admina ===
if (document.getElementById("leaderboardTable")) {
  const lbTable = document.getElementById("leaderboardTable").querySelector("tbody");
  const qNumEl = document.getElementById("questionNumber");

  async function updateLeaderboard() {
    const snapshot = await db.collection("answers").get();
    const scores = {};

    snapshot.forEach(doc => {
      const data = doc.data();
      if (!scores[data.name]) scores[data.name] = 0;

      // Tady můžeš změnit logiku hodnocení, pokud chceš
      scores[data.name] += 100; 
    });

    const sorted = Object.entries(scores).sort((a,b) => b[1] - a[1]);
    lbTable.innerHTML = sorted.map(([name, score]) => `<tr><td>${name}</td><td>${score}</td></tr>`).join("");
  }

  setInterval(updateLeaderboard, 10000);

  document.getElementById("nextQuestion").addEventListener("click", () => {
    if (currentQuestion < totalQuestions) currentQuestion++;
    qNumEl.textContent = "Otázka: " + currentQuestion;
  });
  document.getElementById("prevQuestion").addEventListener("click", () => {
    if (currentQuestion > 1) currentQuestion--;
    qNumEl.textContent = "Otázka: " + currentQuestion;
  });
}
