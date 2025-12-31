const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const distPath = path.join(__dirname, 'dist');
if (!fs.existsSync(distPath)) {
    console.error('ERRO: Diretório dist não encontrado!');
    process.exit(1);
}

const httpServer = http.createServer((req, res) => {
    let filePath = path.join(__dirname, 'dist', req.url === '/' ? 'index.html' : req.url);
    if (!fs.existsSync(filePath)) filePath = path.join(__dirname, 'dist', 'index.html');

    const extname = path.extname(filePath);
    const mimeTypes = {
        '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
        '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpg',
        '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
    };
    
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(err.code === 'ENOENT' ? 404 : 500);
            res.end(err.code === 'ENOENT' ? '404' : 'Erro');
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        }
    });
});

const wss = new WebSocket.Server({ server: httpServer, path: '/ws' });
const rooms = new Map();

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function generatePlayerId() {
    return Math.random().toString(36).substring(2, 15);
}

function broadcastToRoom(roomId, message, excludeWs = null) {
    const room = rooms.get(roomId);
    if (!room) return;
    
    room.players.forEach(p => {
        if (p.ws && p.ws.readyState === WebSocket.OPEN && p.ws !== excludeWs) {
            p.ws.send(JSON.stringify(message));
        }
    });
}

wss.on('connection', (ws) => {
    console.log('Nova conexão');
    let playerId = null;
    let roomId = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const { type, payload } = data;

            switch (type) {
                case 'CREATE_ROOM':
                    roomId = generateRoomId();
                    playerId = generatePlayerId();
                    
                    rooms.set(roomId, {
                        players: [{ 
                            id: playerId, 
                            name: payload.playerName, 
                            ws, 
                            isBot: false, 
                            score: 0,
                            hand: [],
                            selectedCard: null
                        }],
                        hostId: playerId,
                        gameStarted: false
                    });

                    console.log(`Sala ${roomId} criada por ${payload.playerName}`);
                    ws.send(JSON.stringify({
                        type: 'ROOM_CREATED',
                        payload: { roomId, playerId, playerName: payload.playerName }
                    }));
                    break;

                case 'JOIN_ROOM':
                    roomId = payload.roomId;
                    playerId = generatePlayerId();

                    if (!rooms.has(roomId)) {
                        ws.send(JSON.stringify({
                            type: 'ERROR',
                            payload: { message: 'Sala não encontrada' }
                        }));
                        return;
                    }

                    const room = rooms.get(roomId);
                    if (room.players.length >= 10) {
                        ws.send(JSON.stringify({
                            type: 'ERROR',
                            payload: { message: 'Sala cheia' }
                        }));
                        return;
                    }

                    room.players.push({ 
                        id: playerId, 
                        name: payload.playerName, 
                        ws, 
                        isBot: false, 
                        score: 0,
                        hand: [],
                        selectedCard: null
                    });
                    
                    console.log(`${payload.playerName} entrou na sala ${roomId}`);
                    
                    ws.send(JSON.stringify({
                        type: 'JOIN_CONFIRMED',
                        payload: { playerId, playerName: payload.playerName, roomId }
                    }));

                    // Notificar todos os jogadores
                    broadcastToRoom(roomId, {
                        type: 'PLAYER_JOINED',
                        payload: {
                            playerId,
                            playerName: payload.playerName,
                            players: room.players.map(pl => ({ 
                                id: pl.id, 
                                name: pl.name, 
                                isBot: pl.isBot, 
                                score: pl.score 
                            }))
                        }
                    });
                    break;

                case 'UPDATE_BOTS':
                    if (!roomId || !rooms.has(roomId)) return;
                    const botRoom = rooms.get(roomId);
                    if (botRoom.hostId !== playerId) return;

                    const humanPlayers = botRoom.players.filter(p => !p.isBot);
                    const newPlayers = payload.players.map(p => {
                        const existing = humanPlayers.find(hp => hp.id === p.id);
                        if (existing) return existing;
                        return { 
                            ...p, 
                            ws: null,
                            hand: [],
                            selectedCard: null
                        };
                    });
                    
                    botRoom.players = newPlayers;

                    console.log(`Bots atualizados na sala ${roomId}`);

                    // Notificar todos
                    broadcastToRoom(roomId, {
                        type: 'BOTS_UPDATED',
                        payload: { 
                            players: newPlayers.map(pl => ({ 
                                id: pl.id, 
                                name: pl.name, 
                                isBot: pl.isBot, 
                                score: pl.score 
                            })) 
                        }
                    });
                    break;

                case 'START_GAME':
                    if (!roomId || !rooms.has(roomId)) return;
                    const startRoom = rooms.get(roomId);
                    if (startRoom.hostId !== playerId || startRoom.gameStarted) return;

                    startRoom.gameStarted = true;
                    
                    // Criar baralho e distribuir cartas
                    const deck = [];
                    for (let i = 1; i <= 104; i++) {
                        let bulls = 1;
                        if (i === 55) bulls = 7;
                        else if (i % 11 === 0) bulls = 5;
                        else if (i % 10 === 0) bulls = 3;
                        else if (i % 5 === 0) bulls = 2;
                        deck.push({ value: i, bulls });
                    }
                    
                    // Embaralhar
                    for (let i = deck.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [deck[i], deck[j]] = [deck[j], deck[i]];
                    }

                    // Distribuir 10 cartas para cada jogador
                    startRoom.players.forEach(p => {
                        p.hand = deck.splice(0, 10);
                        p.selectedCard = null;
                    });

                    // Criar 4 fileiras iniciais
                    const rows = [
                        [deck.shift()],
                        [deck.shift()],
                        [deck.shift()],
                        [deck.shift()]
                    ];

                    startRoom.gameState = {
                        rows,
                        phase: 'CHOOSING',
                        round: 1,
                        turn: 1
                    };

                    console.log(`Jogo iniciado na sala ${roomId}`);
                    
                    // Enviar estado inicial para cada jogador
                    startRoom.players.forEach(p => {
                        if (p.ws && p.ws.readyState === WebSocket.OPEN) {
                            p.ws.send(JSON.stringify({
                                type: 'GAME_STARTED',
                                payload: {
                                    playerId: p.id,
                                    players: startRoom.players.map(pl => ({
                                        id: pl.id,
                                        name: pl.name,
                                        isBot: pl.isBot,
                                        score: pl.score,
                                        hand: pl.id === p.id ? pl.hand : [],
                                        selectedCard: null
                                    })),
                                    rows,
                                    phase: 'CHOOSING',
                                    round: 1,
                                    turn: 1
                                }
                            }));
                        }
                    });
                    break;

                case 'PLAY_CARD':
                    if (!roomId || !rooms.has(roomId)) return;
                    const gameRoom = rooms.get(roomId);
                    if (!gameRoom.gameStarted) return;

                    const player = gameRoom.players.find(p => p.id === playerId);
                    if (!player || player.selectedCard) return;

                    const card = player.hand.find(c => c.value === payload.cardValue);
                    if (!card) return;

                    player.selectedCard = card;
                    player.hand = player.hand.filter(c => c.value !== card.value);

                    console.log(`${player.name} jogou carta ${card.value}`);

                    // Verificar se todos jogaram
                    const allPlayed = gameRoom.players.every(p => p.selectedCard !== null);

                    // Notificar todos sobre a jogada
                    broadcastToRoom(roomId, {
                        type: 'CARD_PLAYED',
                        payload: {
                            playerId,
                            playerName: player.name,
                            allPlayed
                        }
                    });

                    if (allPlayed) {
                        // Resolver jogadas
                        setTimeout(() => resolveRound(roomId), 1000);
                    }
                    break;
            }
        } catch (error) {
            console.error('Error:', error);
        }
    });

    ws.on('close', () => {
        if (roomId && rooms.has(roomId)) {
            const room = rooms.get(roomId);
            room.players = room.players.filter(p => p.id !== playerId);
            if (room.players.length === 0) {
                rooms.delete(roomId);
                console.log(`Sala ${roomId} removida`);
            } else {
                broadcastToRoom(roomId, {
                    type: 'PLAYER_LEFT',
                    payload: { playerId }
                });
            }
        }
    });
});

function resolveRound(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    const turnOrder = room.players
        .map(p => ({ player: p, card: p.selectedCard }))
        .sort((a, b) => a.card.value - b.card.value);

    // Enviar fase REVEALING
    broadcastToRoom(roomId, {
        type: 'ROUND_REVEALING',
        payload: {
            plays: turnOrder.map(t => ({
                playerId: t.player.id,
                playerName: t.player.name,
                card: t.card
            }))
        }
    });

    // Resolver carta por carta
    setTimeout(() => {
        resolveCardsSequentially(roomId, turnOrder, 0);
    }, 1200);
}

function resolveCardsSequentially(roomId, turnOrder, index) {
    const room = rooms.get(roomId);
    if (!room || index >= turnOrder.length) {
        // Todas as cartas resolvidas
        checkRoundEnd(roomId);
        return;
    }

    const { player, card } = turnOrder[index];
    const rows = room.gameState.rows;

    // Encontrar melhor fileira
    let bestRow = -1;
    let smallestDiff = Infinity;

    rows.forEach((row, idx) => {
        const lastCard = row[row.length - 1];
        if (card.value > lastCard.value) {
            const diff = card.value - lastCard.value;
            if (diff < smallestDiff) {
                smallestDiff = diff;
                bestRow = idx;
            }
        }
    });

    let penalty = 0;
    if (bestRow === -1) {
        // Carta menor que todas - pega fileira com menos pontos
        const rowScores = rows.map(row => row.reduce((sum, c) => sum + c.bulls, 0));
        bestRow = rowScores.indexOf(Math.min(...rowScores));
        penalty = rowScores[bestRow];
        rows[bestRow] = [card];
    } else if (rows[bestRow].length === 5) {
        // Fileira cheia - pega penalidade
        penalty = rows[bestRow].reduce((sum, c) => sum + c.bulls, 0);
        rows[bestRow] = [card];
    } else {
        // Adiciona na fileira
        rows[bestRow].push(card);
    }

    player.score += penalty;
    player.selectedCard = null;

    // Notificar todos
    broadcastToRoom(roomId, {
        type: 'CARD_RESOLVED',
        payload: {
            playerId: player.id,
            playerName: player.name,
            card,
            rowIndex: bestRow,
            penalty,
            newScore: player.score,
            rows: room.gameState.rows,
            players: room.players.map(p => ({
                id: p.id,
                name: p.name,
                score: p.score
            }))
        }
    });

    // Próxima carta
    setTimeout(() => {
        resolveCardsSequentially(roomId, turnOrder, index + 1);
    }, 600);
}

function checkRoundEnd(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    const handEmpty = room.players.every(p => p.hand.length === 0);
    
    if (handEmpty) {
        // Verificar fim de jogo
        const gameOver = room.players.some(p => p.score >= 66);
        
        if (gameOver) {
            broadcastToRoom(roomId, {
                type: 'GAME_OVER',
                payload: {
                    players: room.players.map(p => ({
                        id: p.id,
                        name: p.name,
                        score: p.score
                    }))
                }
            });
            room.gameStarted = false;
        } else {
            // Nova rodada
            room.gameState.round++;
            broadcastToRoom(roomId, {
                type: 'NEW_ROUND_STARTING',
                payload: { round: room.gameState.round }
            });
            
            setTimeout(() => startNewRound(roomId), 2000);
        }
    } else {
        // Próximo turno
        room.gameState.turn++;
        room.gameState.phase = 'CHOOSING';
        
        broadcastToRoom(roomId, {
            type: 'NEXT_TURN',
            payload: {
                turn: room.gameState.turn,
                phase: 'CHOOSING'
            }
        });
    }
}

function startNewRound(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    // Criar novo baralho
    const deck = [];
    for (let i = 1; i <= 104; i++) {
        let bulls = 1;
        if (i === 55) bulls = 7;
        else if (i % 11 === 0) bulls = 5;
        else if (i % 10 === 0) bulls = 3;
        else if (i % 5 === 0) bulls = 2;
        deck.push({ value: i, bulls });
    }
    
    // Embaralhar
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    // Distribuir cartas
    room.players.forEach(p => {
        p.hand = deck.splice(0, 10);
        p.selectedCard = null;
    });

    // Novas fileiras
    const rows = [
        [deck.shift()],
        [deck.shift()],
        [deck.shift()],
        [deck.shift()]
    ];

    room.gameState.rows = rows;
    room.gameState.phase = 'CHOOSING';
    room.gameState.turn = 1;

    // Enviar novo estado
    room.players.forEach(p => {
        if (p.ws && p.ws.readyState === WebSocket.OPEN) {
            p.ws.send(JSON.stringify({
                type: 'ROUND_STARTED',
                payload: {
                    playerId: p.id,
                    hand: p.hand,
                    rows,
                    round: room.gameState.round,
                    turn: 1,
                    players: room.players.map(pl => ({
                        id: pl.id,
                        name: pl.name,
                        score: pl.score
                    }))
                }
            }));
        }
    });
}

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
