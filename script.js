const API = "https://ammcooo.pythonanywhere.com";
let currentUser = "";
let currentRoom = "";
let lobbyPoll;
let resultsPoll;
let hasVoted = false;
let gameRoomPlayers = []; // Čuvamo listu igrača
let isCreator = false;

// --- POMOĆNE I UI FUNKCIJE ---

function showError(msg) {
    const errDiv = document.getElementById('error-area');
    if (errDiv) {
        errDiv.innerText = msg;
        errDiv.style.display = 'block';
        setTimeout(() => { errDiv.style.display = 'none'; }, 5000);
    } else {
        alert(msg);
    }
}

// Funkcija koja priprema ekran nakon ulaska u sobu
function enterUI() {
    document.getElementById('setup-area').classList.remove('active');
    document.getElementById('lobby-area').classList.add('active');
    
    // Prikazujemo sidebar (tabelu) i podešavamo naslov
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.add('active-flex');
    
    document.getElementById('room-title').innerText = "Soba: " + currentRoom;
    
    // Pokrećemo osvežavanje lobija
    startLobbyPolling();
}

// --- GLAVNE FUNKCIJE ---

async function createRoom() {
    currentUser = document.getElementById('nick').value.trim();
    currentRoom = document.getElementById('room').value.trim();
    const maxP = document.getElementById('max_p').value;
    const numI = document.getElementById('num_i').value;

    if (!currentUser || !currentRoom) return showError("Unesi nadimak i ime sobe!");

    try {
        const res = await fetch(`${API}/create_room`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ room_id: currentRoom, user: currentUser, max_p: maxP, num_imp: numI })
        });
        const data = await res.json();

        if (data.error) showError(data.error);
        else {
            enterUI();
        }
    } catch (e) { showError("Greška pri konekciji sa serverom."); }
}

async function joinRoom() {
    currentUser = document.getElementById('nick').value.trim();
    currentRoom = document.getElementById('room').value.trim();

    if (!currentUser || !currentRoom) return showError("Unesi nadimak i ime sobe!");

    try {
        const res = await fetch(`${API}/join_room`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ room_id: currentRoom, user: currentUser })
        });
        const data = await res.json();

        if (data.error) showError(data.error);
        else {
            enterUI();
        }
    } catch (e) { showError("Soba verovatno ne postoji."); }
}

function startLobbyPolling() {
    if (lobbyPoll) clearInterval(lobbyPoll);
    lobbyPoll = setInterval(fetchLobbyStatus, 2000);
}

async function fetchLobbyStatus() {
    try {
        const res = await fetch(`${API}/lobby/${currentRoom}`);
        const data = await res.json();

        if (data.error) {
            clearInterval(lobbyPoll);
            location.reload();
            return;
        }

        gameRoomPlayers = data.players;

        // --- Renderovanje igrača ---
        const grid = document.getElementById('player-grid');
        if (grid) {
            grid.innerHTML = data.players.map(p => `
                <div class="player-circle" data-player="${p}">
                    ${p} ${p === currentUser ? '<span class="me-tag">Ti</span>' : ''}
                </div>
            `).join('');
        }

        if (data.status === 'playing') {
            clearInterval(lobbyPoll);
            switchToGame();
        }

        // --- LOGIKA ZA DUGME (START I DELETE) ---
        const startBtn = document.getElementById('start-btn');
        const leaveBtn = document.querySelector('.btn-leave');

        if (data.creator === currentUser) {
            isCreator = true;
            if (startBtn) startBtn.style.display = 'block';
            if (leaveBtn) {
                leaveBtn.innerText = "🗑️ OBRIŠI SOBU";
                leaveBtn.classList.add('btn-delete');
            }
        } else {
            isCreator = false;
            if (startBtn) startBtn.style.display = 'none';
            if (leaveBtn) {
                leaveBtn.innerText = "🚪 NAPUSTI LOBI";
                leaveBtn.classList.remove('btn-delete');
            }
        }
    } catch (e) { console.error("Lobby poll error", e); }
}

async function leaveRoom() {
    if (isCreator) {
        if (!confirm("⚠️ Da li ste sigurni? Brisanje sobe će izbaciti sve igrače!")) {
            return;
        }
    }

    try {
        await fetch(`${API}/leave_room`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ room_id: currentRoom, user: currentUser })
        });
    } catch (e) { console.log("Greška pri napuštanju"); }
    
    location.reload();
}

async function startGame() {
    await fetch(`${API}/start_game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: currentRoom, user: currentUser })
    });
}

async function switchToGame() {
    document.getElementById('lobby-area').classList.remove('active');
    document.getElementById('game-area').classList.add('active');

    const res = await fetch(`${API}/get_q`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: currentRoom, user: currentUser })
    });
    const data = await res.json();

    document.getElementById('question-box').innerText = data.pitanje;
    const roleEl = document.getElementById('role-display');
    roleEl.innerText = "TI SI NEVIN. 😇";
    roleEl.style.color = "#10b981";
}

async function sendAnswer() {
    const input = document.getElementById('ans-input');
    const text = input.value.trim();
    if (!text) return;

    await fetch(`${API}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: currentRoom, user: currentUser, text: text })
    });

    input.value = "";
    input.disabled = true;
    
    if (resultsPoll) clearInterval(resultsPoll);
    resultsPoll = setInterval(fetchResults, 3000);
    fetchResults();
}

async function fetchResults() {
    try {
        const res = await fetch(`${API}/results/${currentRoom}`);
        const data = await res.json();
        
        const answersList = data.answers || [];
        
        const feed = document.getElementById('answers-feed');
        if (feed) {
            feed.innerHTML = answersList.map(a => `
                <p style="margin: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 5px;">
                    <b style="color: var(--primary)">${a.u}:</b> ${a.t}
                </p>
            `).join('');
        }

        if (data.status === 'voting' && !hasVoted) {
            startVotingUI(gameRoomPlayers);
        }

        if (data.status === 'finished') {
            showWinner(data);
            if (resultsPoll) clearInterval(resultsPoll);
        }
    } catch (e) {
        console.error("Greška pri dobavljanju rezultata:", e);
    }
}

// --- FUNKCIJE ZA GLASANJE ---

function startVotingUI(players) {
    document.getElementById('game-area').style.display = 'none';
    document.getElementById('voting-area').style.display = 'block';

    const votingGrid = document.getElementById('voting-grid');
    
    const validPlayers = players && Array.isArray(players) ? players : [];

    // ISPRAVKA: Ako je element pronađen, upiši sadržaj
    if (votingGrid) {
        votingGrid.innerHTML = validPlayers
            .filter(p => p !== currentUser)
            .map(p => `
                <button onclick="submitVote('${p}')" style="cursor:pointer; padding: 15px; margin: 5px; border: 2px solid var(--primary); background: rgba(56, 189, 248, 0.1); border-radius: 10px; color: white; font-weight: bold;">
                    🕵️ Sumnjam na: <b>${p}</b>
                </button>
            `).join('');
    }
}

async function submitVote(votedFor) {
    if (hasVoted) return;
    hasVoted = true;

    await fetch(`${API}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: currentRoom, voter: currentUser, voted_for: votedFor })
    });

    // *** ISPRAVKA: Ne brišemo ceo 'voting-area', već samo menjaš sadržaj grida ***
    // Ako bi obrisao ceo area, obrisao bi i <div id="voting-grid"> i igra bi pukla u sledećoj rundi.
    const votingGrid = document.getElementById('voting-grid');
    if (votingGrid) {
        votingGrid.innerHTML = "<h3>Glasanje uspešno! Čekamo ostale... 🕒</h3>";
    }
}

async function checkWinner() {
    try {
        const res = await fetch(`${API}/results/${currentRoom}`);
        const data = await res.json();
        
        if (data.status === 'finished') {
            showWinner(data);
        }
    } catch (e) { console.error("Winner check error"); }
}

function showWinner(data) {
    document.getElementById('voting-area').style.display = 'none';
    document.getElementById('winner-area').style.display = 'block';
    
    const title = document.getElementById('winner-title');
    const reveal = document.getElementById('reveal-box');

    const impostorsList = (data.impostors || '').split(',').map(u => u.trim()).filter(u => u);
    const impostersText = impostorsList.length > 1 ? impostorsList.join(', ') : impostorsList[0];
    
    const amIImpostor = impostorsList.includes(currentUser);
    
    const iWon = (amIImpostor && data.winner === 'impostor') || 
                 (!amIImpostor && data.winner === 'detectives');

    if (iWon) {
        title.innerText = "POBJEDA! 🎉";
        title.style.color = "#10b981";
        reveal.innerHTML = `<h3>Pobijedio si!</h3><p>Uljez je bio: <b>${impostersText || 'Nepoznato'}</b></p>`;
    } else {
        title.innerText = "PORAZ! 💀";
        title.style.color = "#ef4444";
        reveal.innerHTML = `<h3>Gubitak!</h3><p>Uljez je bio: <b>${impostersText || 'Nepoznato'}</b></p>`;
    }
}

async function playAgain() {
    hasVoted = false; 
    
    if (resultsPoll) clearInterval(resultsPoll);
    if (lobbyPoll) clearInterval(lobbyPoll);

    try {
        const res = await fetch(`${API}/play_again`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ room_id: currentRoom, user: currentUser })
        });
        
        if (!res.ok) throw new Error("Greška sa serverom");

        const ansInput = document.getElementById('ans-input');
        if(ansInput) {
            ansInput.value = "";
            ansInput.disabled = false;
        }
        
        document.getElementById('answers-feed').innerHTML = "";
        
        document.getElementById('winner-area').style.display = 'none';
        document.getElementById('voting-area').style.display = 'none';
        
        // *** ISPRAVKA: Uklonjena linija koja je brisala HTML strukturu ***
        // document.getElementById('voting-area').innerHTML = ""; <--- OVO JE BILO PROBLEMATIČNO
        
        document.getElementById('game-area').classList.remove('active');
        
        document.getElementById('lobby-area').classList.add('active');
        
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.add('active-flex');

        startLobbyPolling();

    } catch (e) {
        console.error("Greška pri restartu igre:", e);
        alert("Došlo je do greške. Pokušaj da osvežiš stranicu (F5).");
    }
}
