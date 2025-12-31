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
                        players: [{ id: playerId, name: payload.playerName, ws, isBot: false, score: 0 }],
                        hostId: playerId
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

                    room.players.push({ id: playerId, name: payload.playerName, ws, isBot: false, score: 0 });
                    
                    console.log(`${payload.playerName} entrou na sala ${roomId}`);
                    
                    ws.send(JSON.stringify({
                        type: 'JOIN_CONFIRMED',
                        payload: { playerId, playerName: payload.playerName, roomId }
                    }));

                    // Notificar todos os jogadores
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

                    const humanPlayers = botRoom.players.filter(p => !p.isBot);
                    const newPlayers = payload.players.map(p => {
                        const existing = humanPlayers.find(hp => hp.id === p.id);
                        return existing || { ...p, ws: null };
                    });
                    
                    botRoom.players = newPlayers;

                    console.log(`Bots atualizados na sala ${roomId}`);

                    // Notificar todos
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

                    console.log(`Jogo iniciado na sala ${roomId}`);
                    
                    // Apenas notificar que o jogo começou
                    // O jogo roda localmente em cada cliente
                    startRoom.players.forEach(p => {
                        if (p.ws && p.ws.readyState === WebSocket.OPEN) {
                            p.ws.send(JSON.stringify({
                                type: 'GAME_STARTED',
                                payload: { 
                                    players: startRoom.players.map(pl => ({ 
                                        id: pl.id, 
                                        name: pl.name, 
                                        isBot: pl.isBot 
                                    }))
                                }
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
        if (roomId && rooms.has(roomId)) {
            const room = rooms.get(roomId);
            room.players = room.players.filter(p => p.id !== playerId);
            if (room.players.length === 0) {
                rooms.delete(roomId);
                console.log(`Sala ${roomId} removida`);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
