const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Servidor HTTP para servir o arquivo HTML
const httpServer = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
        fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Erro ao ler arquivo');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

// Servidor WebSocket
const wss = new WebSocket.Server({ server: httpServer, path: '/ws' });

const rooms = new Map(); // roomId -> { players: [], gameState: {} }

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
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
                    playerId = payload.playerId || Math.random().toString(36).substring(2, 15);
                    const playerName = payload.playerName || 'Jogador';
                    
                    rooms.set(roomId, {
                        players: [{ id: playerId, name: playerName, ws: ws }],
                        gameState: null,
                        hostId: playerId
                    });

                    console.log(`Sala criada: ${roomId} por ${playerName}`);
                    ws.send(JSON.stringify({
                        type: 'ROOM_CREATED',
                        payload: { roomId, playerId, playerName }
                    }));
                    break;

                case 'JOIN_ROOM':
                    roomId = payload.roomId;
                    playerId = payload.playerId || Math.random().toString(36).substring(2, 15);
                    const joinPlayerName = payload.playerName || 'Jogador';

                    if (!rooms.has(roomId)) {
                        ws.send(JSON.stringify({
                            type: 'ERROR',
                            payload: { message: 'Sala não encontrada' }
                        }));
                        return;
                    }

                    const room = rooms.get(roomId);
                    if (room.players.length >= 4) {
                        ws.send(JSON.stringify({
                            type: 'ERROR',
                            payload: { message: 'Sala cheia (máximo 4 jogadores)' }
                        }));
                        return;
                    }

                    room.players.push({ id: playerId, name: joinPlayerName, ws: ws });
                    console.log(`${joinPlayerName} entrou na sala ${roomId}`);

                    // Enviar confirmação para o jogador que entrou com seu playerId
                    ws.send(JSON.stringify({
                        type: 'JOIN_CONFIRMED',
                        payload: {
                            playerId: playerId,
                            playerName: joinPlayerName,
                            roomId: roomId
                        }
                    }));

                    // Notificar todos os jogadores
                    room.players.forEach(p => {
                        if (p.ws && p.ws.readyState === WebSocket.OPEN) {
                            p.ws.send(JSON.stringify({
                                type: 'PLAYER_JOINED',
                                payload: {
                                    playerId,
                                    playerName: joinPlayerName,
                                    players: room.players.map(pl => ({ id: pl.id, name: pl.name, isBot: pl.isBot || false }))
                                }
                            }));
                        }
                    });
                    break;

                case 'GAME_ACTION':
                    if (!roomId || !rooms.has(roomId)) return;
                    
                    const gameRoom = rooms.get(roomId);
                    
                    // Broadcast para todos os outros jogadores
                    gameRoom.players.forEach(p => {
                        if (p.id !== playerId && p.ws && p.ws.readyState === WebSocket.OPEN) {
                            p.ws.send(JSON.stringify({
                                type: 'GAME_UPDATE',
                                payload: { ...payload, fromPlayerId: playerId }
                            }));
                        }
                    });
                    break;

                case 'GAME_STATE_SYNC':
                    if (!roomId || !rooms.has(roomId)) return;
                    
                    const syncRoom = rooms.get(roomId);
                    syncRoom.gameState = payload.gameState;
                    
                    // Broadcast estado completo para todos
                    syncRoom.players.forEach(p => {
                        if (p.ws && p.ws.readyState === WebSocket.OPEN) {
                            p.ws.send(JSON.stringify({
                                type: 'GAME_STATE_UPDATE',
                                payload: { gameState: syncRoom.gameState }
                            }));
                        }
                    });
                    break;

                case 'START_GAME':
                    if (!roomId || !rooms.has(roomId)) return;
                    
                    const startRoom = rooms.get(roomId);
                    if (startRoom.hostId !== playerId) {
                        ws.send(JSON.stringify({
                            type: 'ERROR',
                            payload: { message: 'Apenas o host pode iniciar o jogo' }
                        }));
                        return;
                    }

                    console.log(`Jogo iniciado na sala ${roomId}`);
                    // Se o host enviou uma lista de jogadores (incluindo bots), use-a
                    const gamePlayers = payload.players || startRoom.players.map(pl => ({ id: pl.id, name: pl.name, isBot: false }));
                    
                    startRoom.players.forEach(p => {
                        if (p.ws && p.ws.readyState === WebSocket.OPEN) {
                            p.ws.send(JSON.stringify({
                                type: 'GAME_STARTED',
                                payload: { players: gamePlayers }
                            }));
                        }
                    });
                    break;
                case 'RESTART_REQUEST':
                    const restartRoom = rooms.get(roomId);
                    if (!restartRoom) return;
                    const requester = restartRoom.players.find(p => p.id === playerId);
                    restartRoom.players.forEach(p => {
                        if (p.id !== playerId && p.ws && p.ws.readyState === WebSocket.OPEN) {
                            p.ws.send(JSON.stringify({
                                type: 'GAME_UPDATE',
                                payload: { 
                                    action: 'RESTART_REQUEST', 
                                    fromPlayerId: playerId,
                                    fromPlayerName: requester ? requester.name : 'Jogador'
                                }
                            }));
                        }
                    });
                    break;
                case 'RESTART_CONFIRMED':
                    const confirmRoom = rooms.get(roomId);
                    if (!confirmRoom) return;
                    confirmRoom.players.forEach(p => {
                        if (p.ws && p.ws.readyState === WebSocket.OPEN) {
                            p.ws.send(JSON.stringify({
                                type: 'GAME_UPDATE',
                                payload: { action: 'GAME_RESTARTED' }
                            }));
                        }
                    });
                    break;
                case 'SURRENDER':
                    const surrenderRoom = rooms.get(roomId);
                    if (!surrenderRoom) return;
                    surrenderRoom.players.forEach(p => {
                        if (p.id !== playerId && p.ws && p.ws.readyState === WebSocket.OPEN) {
                            p.ws.send(JSON.stringify({
                                type: 'GAME_UPDATE',
                                payload: { action: 'PLAYER_SURRENDERED', fromPlayerId: playerId }
                            }));
                        }
                    });
                    break;
            }
        } catch (error) {
            console.error('Error processing message:', error);
            ws.send(JSON.stringify({
                type: 'ERROR',
                payload: { message: 'Erro ao processar mensagem' }
            }));
        }
    });

    ws.on('close', () => {
        console.log(`Conexão fechada: ${playerId}`);
        if (roomId && rooms.has(roomId)) {
            const room = rooms.get(roomId);
            room.players = room.players.filter(p => p.id !== playerId);
            
            // Notificar outros jogadores
            room.players.forEach(p => {
                if (p.ws && p.ws.readyState === WebSocket.OPEN) {
                    p.ws.send(JSON.stringify({
                        type: 'PLAYER_LEFT',
                        payload: { playerId, players: room.players.map(pl => ({ id: pl.id, name: pl.name })) }
                    }));
                }
            });

            // Remover sala se estiver vazia
            if (room.players.length === 0) {
                rooms.delete(roomId);
                console.log(`Sala ${roomId} removida`);
            }
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
