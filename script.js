const API = "https://ammcooo.pythonanywhere.com";
let currentUser = "";
let currentRoom = "";
let lobbyPoll;
let resultsPoll;
let hasVoted = false;
let gameRoomPlayers = []; // Čuvamo listu igrača

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

        // Čuvamo listu igrača globalno
        gameRoomPlayers = data.players;

        // --- NOVO: Renderovanje igrača u krugovima (Pill chips) ---
        const grid = document.getElementById('player-grid');
        if (grid) {
            grid.innerHTML = data.players.map(p => `
                <div class="player-circle" data-player="${p}">
                    ${p} ${p === currentUser ? '<span class="me-tag">Ti</span>' : ''}
                </div>
            `).join('');
        }

        // Proveri da li je igra počela
        if (data.status === 'playing') {
            clearInterval(lobbyPoll);
            switchToGame();
        }

        // Prikaži START dugme samo kreatoru
        if (data.creator === currentUser) {
            const startBtn = document.getElementById('start-btn');
            if (startBtn) startBtn.style.display = 'block';
        }
    } catch (e) { console.error("Lobby poll error", e); }
}

async function leaveRoom() {
    // Pozivamo backend da nas izbriše iz baze
    try {
        await fetch(`${API}/leave_room`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ room_id: currentRoom, user: currentUser })
        });
    } catch (e) { console.log("Greška pri napuštanju"); }
    
    // Vraćamo sajt na početak
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
    // Sve puta piši "TI SI NEVIN" - nitko ne zna tko je uljez!
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
    input.disabled = true; // Onemogući ponovno slanje
    
    // Pokrećemo osvežavanje rezultata
    if (resultsPoll) clearInterval(resultsPoll);
    resultsPoll = setInterval(fetchResults, 3000);
    fetchResults();
}

async function fetchResults() {
    try {
        const res = await fetch(`${API}/results/${currentRoom}`);
        const data = await res.json();
        
        // POPRAVKA: Odgovori su sada u data.answers, a ne u samom data
        const answersList = data.answers || [];
        
        const feed = document.getElementById('answers-feed');
        if (feed) {
            feed.innerHTML = answersList.map(a => `
                <p style="margin: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 5px;">
                    <b style="color: var(--primary)">${a.u}:</b> ${a.t}
                </p>
            `).join('');
        }

        // Provjera da li prelazimo na glasanje
        if (data.status === 'voting' && !hasVoted) {
            startVotingUI(gameRoomPlayers);
        }

        // Provjera da li je igra gotova
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
    // Sakrij polje za kucanje odgovora, prikaži glasanje
    document.getElementById('game-area').style.display = 'none';
    document.getElementById('voting-area').style.display = 'block';

    const votingGrid = document.getElementById('voting-grid');
    
    // Koristi proslijeđenu listu igrača (iz globalnog niza)
    const validPlayers = players && Array.isArray(players) ? players : [];

    votingGrid.innerHTML = validPlayers
        .filter(p => p !== currentUser) // Ne možeš glasati za sebe
        .map(p => `
            <button onclick="submitVote('${p}')" style="cursor:pointer; padding: 15px; margin: 5px; border: 2px solid var(--primary); background: rgba(56, 189, 248, 0.1); border-radius: 10px; color: white; font-weight: bold;">
                🕵️ Sumnjam na: <b>${p}</b>
            </button>
        `).join('');
}

async function submitVote(votedFor) {
    if (hasVoted) return;
    hasVoted = true;

    await fetch(`${API}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: currentRoom, voter: currentUser, voted_for: votedFor })
    });

    document.getElementById('voting-area').innerHTML = "<h3>Glasanje uspešno! Čekamo ostale... 🕒</h3>";
}

async function checkWinner() {
    try {
        const res = await fetch(`${API}/results/${currentRoom}`);
        const data = await res.json();
        
        // Pretpostavka: backend vraća 'status: finished' i informaciju o pobjedniku
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

    // Izdvoji imena uljeza (mogu biti odvojena zarezima)
    const impostorsList = (data.impostors || '').split(',').map(u => u.trim()).filter(u => u);
    const impostersText = impostorsList.length > 1 ? impostorsList.join(', ') : impostorsList[0];
    
    // Provjeri da li je korisnik uljez
    const amIImpostor = impostorsList.includes(currentUser);
    
    // Logika: Ako si uljez, pobjeđuješ kada je winner === 'impostor'
    // Ako nisi uljez, pobjeđuješ kada je winner === 'detectives'
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
