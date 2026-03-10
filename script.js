const API = "https://ammcooo.pythonanywhere.com";
let currentUser = "";
let currentRoom = "";
let lobbyPoll;
let resultsPoll;
let hasVoted = false;
let gameRoomPlayers = []; // Sada cuva objekte: {name: "Ime", ready: 0/1}
let isCreator = false;
let myReadyStatus = false; // Pratimo lokalno stanje

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

function enterUI() {
    document.getElementById('setup-area').classList.remove('active');
    document.getElementById('lobby-area').classList.add('active');
    
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.add('active-flex');
    
    document.getElementById('room-title').innerText = "Soba: " + currentRoom;
    
    startLobbyPolling();
}

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
            myReadyStatus = true; // Kreator je auto-spreman
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
            myReadyStatus = false; // Novi igrac nije spreman
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

        gameRoomPlayers = data.players; // Niz objekata: [{name: "Pera", ready: 1}, ...]

        // --- Renderovanje igrača ---
        const grid = document.getElementById('player-grid');
        if (grid) {
            grid.innerHTML = gameRoomPlayers.map(p => `
                <div class="player-circle ${p.ready ? 'ready' : ''}" data-player="${p.name}">
                    ${p.name} ${p.name === currentUser ? '<span class="me-tag">Ti</span>' : ''}
                </div>
            `).join('');
        }

        // Ažuriranje mog statusa (ako je promenio neko drugi ili greškom)
        const meObj = gameRoomPlayers.find(p => p.name === currentUser);
        if (meObj) {
            myReadyStatus = meObj.ready === 1;
            updateReadyButton();
        }

        if (data.status === 'playing') {
            clearInterval(lobbyPoll);
            switchToGame();
        }

        // --- Logika za Start dugme ---
        const startBtn = document.getElementById('start-btn');
        const leaveBtn = document.querySelector('.btn-leave');
        const readyBtn = document.getElementById('ready-btn');

        if (data.creator === currentUser) {
            isCreator = true;
            
            // Proveri da li su svi spremni
            const allReady = gameRoomPlayers.every(p => p.ready === 1);
            
            if (startBtn) {
                startBtn.style.display = 'block';
                startBtn.disabled = !allReady; // Onemoguci ako nisu svi spremni
                
                if (!allReady && gameRoomPlayers.length > 0) {
                    startBtn.style.opacity = "0.5";
                    startBtn.style.cursor = "not-allowed";
                } else {
                    startBtn.style.opacity = "1";
                    startBtn.style.cursor = "pointer";
                }
            }
            
            if (leaveBtn) {
                leaveBtn.innerText = "🗑️ OBRIŠI SOBU";
                leaveBtn.classList.add('btn-delete');
            }
            // Sakrij ready dugme za kreatora (on je uvek spreman, ili mu nije potrebno)
            if (readyBtn) readyBtn.style.display = 'none';
            
        } else {
            isCreator = false;
            
            if (startBtn) startBtn.style.display = 'none';
            
            if (leaveBtn) {
                leaveBtn.innerText = "🚪 NAPUSTI LOBI";
                leaveBtn.classList.remove('btn-delete');
            }
            // Prikazi ready dugme za ostale
            if (readyBtn) readyBtn.style.display = 'block';
        }
    } catch (e) { console.error("Lobby poll error", e); }
}

function updateReadyButton() {
    const btn = document.getElementById('ready-btn');
    if (btn) {
        if (myReadyStatus) {
            btn.innerText = "SPREMAN SAM ✓";
            btn.classList.add('is-ready');
        } else {
            btn.innerText = "SPREMAN";
            btn.classList.remove('is-ready');
        }
    }
}

// NOVA FUNKCIJA
async function toggleReady() {
    try {
        const res = await fetch(`${API}/toggle_ready`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ room_id: currentRoom, user: currentUser })
        });
        const data = await res.json();
        if (data.status === 'updated') {
            myReadyStatus = data.ready === 1;
            updateReadyButton();
            // Odmah osvezi lobby da vide drugi
            fetchLobbyStatus(); 
        }
    } catch (e) { console.error("Ready toggle error", e); }
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
    // Finalna provera na frontendu (mada backend takodje proverava)
    const allReady = gameRoomPlayers.every(p => p.ready === 1);
    if (!allReady) {
        showError("Svi igrači moraju biti spremni!");
        return;
    }

    const res = await fetch(`${API}/start_game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: currentRoom, user: currentUser })
    });
    const data = await res.json();
    if (data.error) {
        showError(data.error); // Prikazi backend gresku (npr. "2 igraca nisu spremni")
    }
}

async function switchToGame() {
    document.getElementById('lobby-area').classList.remove('active');
    document.getElementById('game-area').classList.add('active');
    
    // Sakrij sidebar ili ga ostavi, po zelji. Ovde ga sklanjamo za vise prostora
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.remove('active-flex');

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
            // Prosledi samo imena igraca
            const playerNames = gameRoomPlayers.map(p => p.name);
            startVotingUI(playerNames);
        }

        if (data.status === 'finished') {
            showWinner(data);
            if (resultsPoll) clearInterval(resultsPoll);
        }
    } catch (e) {
        console.error("Greška pri dobavljanju rezultata:", e);
    }
}

function startVotingUI(players) {
    document.getElementById('game-area').style.display = 'none';
    document.getElementById('voting-area').style.display = 'block';

    const votingGrid = document.getElementById('voting-grid');
    
    const validPlayers = players && Array.isArray(players) ? players : [];

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

    const votingGrid = document.getElementById('voting-grid');
    if (votingGrid) {
        votingGrid.innerHTML = "<h3>Glasanje uspešno! Čekamo ostale... 🕒</h3>";
    }
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
        
        document.getElementById('game-area').classList.remove('active');
        
        document.getElementById('lobby-area').classList.add('active');
        
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.add('active-flex');
        
        // Resetujemo ready status u UI kada se vrati u lobby
        myReadyStatus = false; 
        updateReadyButton();

        startLobbyPolling();

    } catch (e) {
        console.error("Greška pri restartu igre:", e);
        alert("Došlo je do greške. Pokušaj da osvežiš stranicu (F5).");
    }
}
