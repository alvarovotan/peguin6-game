const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Verificar se o diretório dist existe
const distPath = path.join(__dirname, 'dist');
if (!fs.existsSync(distPath)) {
    console.error('ERRO: Diretório dist não encontrado!');
    process.exit(1);
}

// Servidor HTTP
const httpServer = http.createServer((req, res) => {
    let filePath = path.join(__dirname, 'dist', req.url === '/' ? 'index.html' : req.url);
    
    if (!fs.existsSync(filePath)) {
        filePath = path.join(__dirname, 'dist', 'index.html');
    }

    const extname = path.extname(filePath);
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon'
    };
    
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(err.code === 'ENOENT' ? 404 : 500);
            res.end(err.code === 'ENOENT' ? '404' : 'Erro no servidor');
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        }
    });
});

// Servidor WebSocket
const wss = new WebSocket.Server({ server: httpServer, path: '/ws' });

const rooms = new Map(); // roomId -> { players, gameState, hostId }

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function generatePlayerId() {
    return Math.random().toString(36).substring(2, 15);
}

// Criar baralho
function createDeck() {
    const cards = [];
    for (let i = 1; i <= 104; i++) {
        let bulls = 1;
        if (i === 55) bulls = 7;
        else if (i % 11 === 0) bulls = 5;
        else if (i % 10 === 0) bulls = 3;
        else if (i % 5 === 0) bulls = 2;
        cards.push({ value: i, bulls });
    }
    return cards;
}

// Embaralhar
function shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// Iniciar nova rodada
function startNewRound(room) {
    const deck = shuffle(createDeck());
    const players = room.players.map(p => ({
        ...p,
        hand: p.isBot ? deck.splice(0, 10).sort((a, b) => a.value - b.value) : deck.splice(0, 10).sort((a, b) => a.value - b.value),
        selectedCard: null
    }));

    const rows = [
        [deck.pop()],
        [deck.pop()],
        [deck.pop()],
        [deck.pop()]
    ];

    room.gameState = {
        rows,
        players,
        phase: 'CHOOSING',
        currentTurnOrder: [],
        resolvingIndex: 0,
        message: 'Escolha sua carta'
    };

    return room.gameState;
}

// Processar jogada de bot
function processBotMove(gameState, botPlayer) {
    const rowEnds = gameState.rows.map(r => r[r.length - 1].value);
    const bestCard = botPlayer.hand.reduce((prev, curr) => {
        const prevFit = rowEnds.filter(v => v < prev.value).map(v => prev.value - v);
        const currFit = rowEnds.filter(v => v < curr.value).map(v => curr.value - v);
        const prevMin = prevFit.length > 0 ? Math.min(...prevFit) : 999;
        const currMin = currFit.length > 0 ? Math.min(...currFit) : 999;
        return currMin < prevMin ? curr : prev;
    }, botPlayer.hand[0]);
    
    return Math.random() > 0.8 ? botPlayer.hand[Math.floor(Math.random() * botPlayer.hand.length)] : bestCard;
}

wss.on('connection', (ws) => {
    console.log('Nova conexão WebSocket');
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
                        players: [{ id: playerId, name: payload.playerName, ws, isBot: false, score: 0 }],
                        gameState: null,
                        hostId: playerId
                    });

                    console.log(`Sala criada: ${roomId}`);
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

                    room.players.push({ id: playerId, name: payload.playerName, ws, isBot: false, score: 0 });
                    
                    ws.send(JSON.stringify({
                        type: 'JOIN_CONFIRMED',
                        payload: { playerId, playerName: payload.playerName, roomId }
                    }));

                    room.players.forEach(p => {
                        if (p.ws && p.ws.readyState === WebSocket.OPEN) {
                            p.ws.send(JSON.stringify({
                                type: 'PLAYER_JOINED',
                                payload: {
                                    playerId,
                                    playerName: payload.playerName,
                                    players: room.players.map(pl => ({ id: pl.id, name: pl.name, isBot: pl.isBot, score: pl.score }))
                                }
                            }));
                        }
                    });
                    break;

                case 'UPDATE_BOTS':
                    if (!roomId || !rooms.has(roomId)) return;
                    const botRoom = rooms.get(roomId);
                    if (botRoom.hostId !== playerId) return;

                    // Atualizar lista de jogadores com bots
                    const humanPlayers = botRoom.players.filter(p => !p.isBot);
                    const newPlayers = payload.players.map(p => {
                        const existing = humanPlayers.find(hp => hp.id === p.id);
                        return existing || { ...p, ws: null };
                    });
                    
                    botRoom.players = newPlayers;

                    botRoom.players.forEach(p => {
                        if (p.ws && p.ws.readyState === WebSocket.OPEN) {
                            p.ws.send(JSON.stringify({
                                type: 'BOTS_UPDATED',
                                payload: { players: newPlayers.map(pl => ({ id: pl.id, name: pl.name, isBot: pl.isBot, score: pl.score })) }
                            }));
                        }
                    });
                    break;

                case 'START_GAME':
                    if (!roomId || !rooms.has(roomId)) return;
                    const startRoom = rooms.get(roomId);
                    if (startRoom.hostId !== playerId) return;

                    const gameState = startNewRound(startRoom);
                    
                    // Enviar estado do jogo para cada jogador
                    startRoom.players.forEach(p => {
                        if (p.ws && p.ws.readyState === WebSocket.OPEN) {
                            const playerState = {
                                ...gameState,
                                players: gameState.players.map(gp => ({
                                    id: gp.id,
                                    name: gp.name,
                                    isBot: gp.isBot,
                                    score: gp.score,
                                    hand: gp.id === p.id ? gp.hand : [], // Só envia mão para o próprio jogador
                                    selectedCard: null
                                }))
                            };
                            
                            p.ws.send(JSON.stringify({
                                type: 'GAME_STARTED',
                                payload: { gameState: playerState }
                            }));
                        }
                    });
                    break;

                case 'PLAY_CARD':
                    if (!roomId || !rooms.has(roomId)) return;
                    const playRoom = rooms.get(roomId);
                    if (!playRoom.gameState) return;

                    const player = playRoom.gameState.players.find(p => p.id === playerId);
                    if (!player || player.selectedCard) return;

                    player.selectedCard = payload.card;
                    player.hand = player.hand.filter(c => c.value !== payload.card.value);

                    // Processar jogadas dos bots
                    playRoom.gameState.players.forEach(p => {
                        if (p.isBot && !p.selectedCard) {
                            p.selectedCard = processBotMove(playRoom.gameState, p);
                            p.hand = p.hand.filter(c => c.value !== p.selectedCard.value);
                        }
                    });

                    // Verificar se todos jogaram
                    const allPlayed = playRoom.gameState.players.every(p => p.selectedCard);
                    
                    if (allPlayed) {
                        // Todos jogaram, iniciar resolução
                        playRoom.gameState.phase = 'REVEALING';
                        playRoom.gameState.currentTurnOrder = playRoom.gameState.players
                            .map(p => ({ playerId: p.id, card: p.selectedCard }))
                            .sort((a, b) => a.card.value - b.card.value);
                        playRoom.gameState.resolvingIndex = 0;
                    }

                    // Broadcast estado atualizado
                    playRoom.players.forEach(p => {
                        if (p.ws && p.ws.readyState === WebSocket.OPEN) {
                            const playerState = {
                                ...playRoom.gameState,
                                players: playRoom.gameState.players.map(gp => ({
                                    id: gp.id,
                                    name: gp.name,
                                    isBot: gp.isBot,
                                    score: gp.score,
                                    hand: gp.id === p.id ? gp.hand : [],
                                    selectedCard: gp.selectedCard
                                }))
                            };
                            
                            p.ws.send(JSON.stringify({
                                type: 'GAME_STATE_UPDATE',
                                payload: { gameState: playerState }
                            }));
                        }
                    });
                    break;
            }
        } catch (error) {
            console.error('Error:', error);
        }
    });

    ws.on('close', () => {
        console.log(`Conexão fechada: ${playerId}`);
        if (roomId && rooms.has(roomId)) {
            const room = rooms.get(roomId);
            room.players = room.players.filter(p => p.id !== playerId);
            
            if (room.players.length === 0) {
                rooms.delete(roomId);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
