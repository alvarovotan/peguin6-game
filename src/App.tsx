import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CardType, Player, GamePhase, GameState, View } from './types';
import { createDeck, shuffle } from './constants';
import Card from './components/Card';
import TableRow from './components/TableRow';
import ScoreBoard from './components/ScoreBoard';

const WINNING_SCORE = 66;
const MAX_PLAYERS = 10;

const getWebSocketUrl = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}/ws`;
};

const playSound = (type: 'select' | 'reveal' | 'place' | 'penalty' | 'shuffle' | 'win', isMuted: boolean) => {
  if (isMuted) return;
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;

    switch (type) {
      case 'select':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.1);
        osc.start();
        osc.stop(now + 0.1);
        break;
      case 'reveal':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.2);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.2);
        osc.start();
        osc.stop(now + 0.2);
        break;
      case 'place':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, now);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start();
        osc.stop(now + 0.1);
        break;
      case 'penalty':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(110, now);
        osc.frequency.linearRampToValueAtTime(55, now + 0.3);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start();
        osc.stop(now + 0.3);
        break;
      case 'shuffle':
        const bufferSize = ctx.sampleRate * 0.3;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.05, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        noise.connect(noiseGain);
        noiseGain.connect(ctx.destination);
        noise.start();
        break;
      case 'win':
        [523.25, 659.25, 783.99].forEach((f, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(f, now + i * 0.1);
          g.gain.setValueAtTime(0, now + i * 0.1);
          g.gain.linearRampToValueAtTime(0.1, now + i * 0.1 + 0.05);
          g.gain.linearRampToValueAtTime(0, now + 0.6);
          o.connect(g);
          g.connect(ctx.destination);
          o.start(now + i * 0.1);
          o.stop(now + 0.6);
        });
        break;
    }
  } catch (e) {
    console.error('Error playing sound:', e);
  }
};

const App: React.FC = () => {
  const [view, setView] = useState<View>('HOME');
  const [playerName, setPlayerName] = useState('Jogador');
  const [playerId, setPlayerId] = useState<string>('');
  const [isMuted, setIsMuted] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [lobbyPlayers, setLobbyPlayers] = useState<Partial<Player>[]>([]);
  const [roomCode, setRoomCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [errorMessage, setErrorMessage] = useState('');

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [takenRowIndex, setTakenRowIndex] = useState<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  // Conectar WebSocket
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    
    setConnectionStatus('connecting');
    const ws = new WebSocket(getWebSocketUrl());
    
    ws.onopen = () => {
      console.log('WebSocket connected');
      setConnectionStatus('connected');
      setErrorMessage('');
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Received:', data);
        
        switch (data.type) {
          case 'ROOM_CREATED':
            setPlayerId(data.payload.playerId);
            setRoomCode(data.payload.roomId);
            setIsHost(true);
            setLobbyPlayers([{ id: data.payload.playerId, name: data.payload.playerName, isBot: false, score: 0 }]);
            setView('LOBBY');
            playSound('select', isMuted);
            break;
            
          case 'JOIN_CONFIRMED':
            setPlayerId(data.payload.playerId);
            setRoomCode(data.payload.roomId);
            setIsHost(false);
            setView('LOBBY');
            playSound('select', isMuted);
            break;
            
          case 'PLAYER_JOINED':
            setLobbyPlayers(data.payload.players);
            if (data.payload.playerId !== playerId) {
              playSound('select', isMuted);
            }
            break;
            
          case 'PLAYER_LEFT':
            setLobbyPlayers(data.payload.players);
            playSound('penalty', isMuted);
            break;
            
          case 'BOTS_UPDATED':
            setLobbyPlayers(data.payload.players);
            break;
            
          case 'GAME_STARTED':
            console.log('GAME_STARTED received:', data.payload);
            try {
              const initialPlayers: Player[] = data.payload.players.map((p: any) => ({
                id: p.id,
                name: p.name,
                isBot: p.isBot || false,
                score: 0,
                hand: [],
                selectedCard: null
              }));
              console.log('Initial players:', initialPlayers);
              setView('GAME');
              // Pequeno delay para garantir que a view mudou antes de iniciar o round
              setTimeout(() => {
                startNewRound(initialPlayers);
              }, 100);
            } catch (e) {
              console.error('Error starting game:', e);
              setErrorMessage('Erro ao iniciar o jogo');
            }
            break;
            
          case 'ERROR':
            setErrorMessage(data.payload.message);
            playSound('penalty', isMuted);
            break;
        }
      } catch (e) {
        console.error('Error parsing message:', e);
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnectionStatus('disconnected');
      setErrorMessage('Erro de conexão com o servidor');
    };
    
    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setConnectionStatus('disconnected');
    };
    
    wsRef.current = ws;
  }, [isMuted, playerId]);

  // Conectar ao montar
  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const sendMessage = (type: string, payload: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }));
    } else {
      setErrorMessage('Não conectado ao servidor');
    }
  };

  const handleCreateRoom = () => {
    if (!playerName.trim()) {
      setErrorMessage('Digite seu nome primeiro');
      return;
    }
    playSound('select', isMuted);
    sendMessage('CREATE_ROOM', { playerName: playerName.trim() });
  };

  const handleJoinRoom = () => {
    if (inputCode.length < 4) {
      setErrorMessage('Código inválido');
      return;
    }
    if (!playerName.trim()) {
      setErrorMessage('Digite seu nome primeiro');
      return;
    }
    playSound('select', isMuted);
    sendMessage('JOIN_ROOM', { roomId: inputCode.toUpperCase(), playerName: playerName.trim() });
    // View será mudada quando receber JOIN_CONFIRMED
  };

  const addBot = () => {
    if (lobbyPlayers.length >= MAX_PLAYERS) return;
    playSound('select', isMuted);
    const newPlayers = [
      ...lobbyPlayers,
      { id: `bot-${Date.now()}`, name: `Bot ${lobbyPlayers.filter(p => p.isBot).length + 1}`, isBot: true, score: 0 }
    ];
    setLobbyPlayers(newPlayers);
    sendMessage('UPDATE_BOTS', { players: newPlayers });
  };

  const removePlayer = (id: string) => {
    if (id === playerId) return;
    playSound('penalty', isMuted);
    const newPlayers = lobbyPlayers.filter(p => p.id !== id);
    setLobbyPlayers(newPlayers);
    sendMessage('UPDATE_BOTS', { players: newPlayers });
  };

  const startNewRound = useCallback((currentPlayers: Player[]) => {
    playSound('shuffle', isMuted);
    const deck = shuffle(createDeck());
    const players: Player[] = currentPlayers.map(p => ({
      ...p,
      hand: deck.splice(0, 10).sort((a, b) => a.value - b.value),
      selectedCard: null
    }));

    const rows: CardType[][] = [
      [deck.pop()!],
      [deck.pop()!],
      [deck.pop()!],
      [deck.pop()!]
    ];

    setGameState({
      rows,
      players,
      phase: GamePhase.CHOOSING,
      currentTurnOrder: [],
      resolvingIndex: 0,
      message: 'Escolha sua carta'
    });
    setTakenRowIndex(null);
  }, [isMuted]);

  const startGame = () => {
    if (!isHost) return;
    playSound('select', isMuted);
    sendMessage('START_GAME', { players: lobbyPlayers });
  };

  const selectPlayerCard = (card: CardType) => {
    if (!gameState || gameState.phase !== GamePhase.CHOOSING) return;
    playSound('select', isMuted);

    const newPlayers = gameState.players.map(p => {
      if (p.id === playerId) {
        return { ...p, selectedCard: card };
      }
      if (p.isBot) {
        const rowEnds = gameState.rows.map(r => r[r.length - 1].value);
        const bestCard = p.hand.reduce((prev, curr) => {
          const prevFit = rowEnds.filter(v => v < prev.value).map(v => prev.value - v);
          const currFit = rowEnds.filter(v => v < curr.value).map(v => curr.value - v);
          const prevMin = prevFit.length > 0 ? Math.min(...prevFit) : 999;
          const currMin = currFit.length > 0 ? Math.min(...currFit) : 999;
          return currMin < prevMin ? curr : prev;
        }, p.hand[0]);
        const finalCard = Math.random() > 0.8 ? p.hand[Math.floor(Math.random() * p.hand.length)] : bestCard;
        return { ...p, selectedCard: finalCard };
      }
      return p;
    });

    setGameState(prev => prev ? ({
      ...prev,
      players: newPlayers,
      phase: GamePhase.REVEALING,
      message: 'Revelando cartas...'
    }) : null);
  };

  useEffect(() => {
    if (gameState?.phase === GamePhase.REVEALING) {
      playSound('reveal', isMuted);
      const timeout = setTimeout(() => {
        const turnOrder = gameState.players
          .map(p => ({ playerId: p.id, card: p.selectedCard! }))
          .sort((a, b) => a.card.value - b.card.value);

        setGameState(prev => prev ? ({
          ...prev,
          phase: GamePhase.RESOLVING,
          currentTurnOrder: turnOrder,
          resolvingIndex: 0,
          message: 'Processando jogadas...'
        }) : null);
      }, 1200);
      return () => clearTimeout(timeout);
    }
  }, [gameState?.phase, isMuted]);

  const resolveNextCard = useCallback(() => {
    setGameState(prev => {
      if (!prev || prev.phase !== GamePhase.RESOLVING) return prev;
      
      if (prev.resolvingIndex >= prev.currentTurnOrder.length) {
        const handEmpty = prev.players[0].hand.length === 0;
        if (handEmpty) {
          const gameOver = prev.players.some(p => p.score >= WINNING_SCORE);
          if (gameOver) {
            playSound('win', isMuted);
            return { ...prev, phase: GamePhase.GAME_OVER, message: 'Fim do jogo!' };
          }
          return { ...prev, phase: GamePhase.BETWEEN_ROUNDS, message: 'Próxima rodada...' };
        }
        return {
          ...prev,
          phase: GamePhase.CHOOSING,
          players: prev.players.map(p => ({ ...p, selectedCard: null })),
          message: 'Escolha sua carta'
        };
      }

      const currentMove = prev.currentTurnOrder[prev.resolvingIndex];
      const card = currentMove.card;
      const player = prev.players.find(p => p.id === currentMove.playerId)!;

      let targetRowIndex = -1;
      let minDiff = Infinity;

      prev.rows.forEach((row, idx) => {
        const lastCard = row[row.length - 1];
        if (card.value > lastCard.value) {
          const diff = card.value - lastCard.value;
          if (diff < minDiff) {
            minDiff = diff;
            targetRowIndex = idx;
          }
        }
      });

      if (targetRowIndex === -1) {
        if (player.id === playerId && !player.isBot) {
          return { ...prev, phase: GamePhase.CHOOSING_ROW, message: 'Escolha uma fileira para pegar' };
        }
        const rowBulls = prev.rows.map(row => row.reduce((sum, c) => sum + c.bulls, 0));
        const minBulls = Math.min(...rowBulls);
        targetRowIndex = rowBulls.indexOf(minBulls);
        const penalty = prev.rows[targetRowIndex].reduce((sum, c) => sum + c.bulls, 0);
        
        playSound('penalty', isMuted);
        setTakenRowIndex(targetRowIndex);
        const newRows = [...prev.rows];
        newRows[targetRowIndex] = [card];
        const newPlayers = prev.players.map(p => p.id === player.id ? { ...p, score: p.score + penalty, hand: p.hand.filter(c => c.value !== card.value) } : p);
        return { ...prev, rows: newRows, players: newPlayers, resolvingIndex: prev.resolvingIndex + 1 };
      }

      const targetRow = prev.rows[targetRowIndex];
      if (targetRow.length >= 5) {
        const penalty = targetRow.reduce((sum, c) => sum + c.bulls, 0);
        playSound('penalty', isMuted);
        setTakenRowIndex(targetRowIndex);
        const newRows = [...prev.rows];
        newRows[targetRowIndex] = [card];
        const newPlayers = prev.players.map(p => p.id === player.id ? { ...p, score: p.score + penalty, hand: p.hand.filter(c => c.value !== card.value) } : p);
        return { ...prev, rows: newRows, players: newPlayers, resolvingIndex: prev.resolvingIndex + 1 };
      }

      playSound('place', isMuted);
      const newRows = [...prev.rows];
      newRows[targetRowIndex] = [...targetRow, card];
      const newPlayers = prev.players.map(p => p.id === player.id ? { ...p, hand: p.hand.filter(c => c.value !== card.value) } : p);
      return { ...prev, rows: newRows, players: newPlayers, resolvingIndex: prev.resolvingIndex + 1 };
    });
  }, [isMuted, playerId]);

  useEffect(() => {
    if (gameState?.phase === GamePhase.RESOLVING && gameState.resolvingIndex < gameState.currentTurnOrder.length) {
      const timeout = setTimeout(resolveNextCard, 800);
      return () => clearTimeout(timeout);
    }
    if (gameState?.phase === GamePhase.RESOLVING && gameState.resolvingIndex >= gameState.currentTurnOrder.length) {
      resolveNextCard();
    }
  }, [gameState?.phase, gameState?.resolvingIndex, resolveNextCard]);

  useEffect(() => {
    if (gameState?.phase === GamePhase.BETWEEN_ROUNDS) {
      const timeout = setTimeout(() => {
        startNewRound(gameState.players);
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [gameState?.phase, startNewRound]);

  const chooseRowToTake = (rowIndex: number) => {
    if (!gameState || gameState.phase !== GamePhase.CHOOSING_ROW) return;
    playSound('penalty', isMuted);

    const currentMove = gameState.currentTurnOrder[gameState.resolvingIndex];
    const card = currentMove.card;
    const player = gameState.players.find(p => p.id === currentMove.playerId)!;
    const penalty = gameState.rows[rowIndex].reduce((sum, c) => sum + c.bulls, 0);

    setTakenRowIndex(rowIndex);
    const newRows = [...gameState.rows];
    newRows[rowIndex] = [card];
    const newPlayers = gameState.players.map(p => p.id === player.id ? { ...p, score: p.score + penalty, hand: p.hand.filter(c => c.value !== card.value) } : p);
    
    setGameState({
      ...gameState,
      rows: newRows,
      players: newPlayers,
      phase: GamePhase.RESOLVING,
      resolvingIndex: gameState.resolvingIndex + 1
    });
  };

  const resetGame = () => {
    playSound('select', isMuted);
    setGameState(null);
    setView('HOME');
    setLobbyPlayers([]);
    setRoomCode('');
    setIsHost(false);
  };

  // Render HOME
  if (view === 'HOME') {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 p-4">
        <div className="max-w-md w-full space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-5xl font-black text-white tracking-tight">6 Nimmt!</h1>
            <p className="text-zinc-400 text-sm">Jogue online com amigos ou bots</p>
            {connectionStatus === 'connected' && (
              <div className="flex items-center justify-center gap-2 text-green-400 text-xs">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                Conectado
              </div>
            )}
            {connectionStatus === 'connecting' && (
              <div className="flex items-center justify-center gap-2 text-yellow-400 text-xs">
                <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
                Conectando...
              </div>
            )}
            {connectionStatus === 'disconnected' && (
              <div className="flex items-center justify-center gap-2 text-red-400 text-xs">
                <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                Desconectado
              </div>
            )}
          </div>

          <div className="space-y-3">
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Seu nome"
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition"
              maxLength={20}
            />

            <button
              onClick={handleCreateRoom}
              disabled={connectionStatus !== 'connected' || !playerName.trim()}
              className="w-full px-6 py-3 bg-white text-zinc-900 rounded-lg font-bold hover:bg-zinc-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Criar Sala
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-zinc-700"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-2 bg-zinc-900 text-zinc-500">ou</span>
              </div>
            </div>

            <div className="space-y-2">
              <input
                type="text"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                placeholder="Código da sala"
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition uppercase text-center text-2xl tracking-widest font-bold"
                maxLength={6}
              />
              <button
                onClick={handleJoinRoom}
                disabled={connectionStatus !== 'connected' || !playerName.trim() || inputCode.length < 4}
                className="w-full px-6 py-3 bg-zinc-700 text-white rounded-lg font-bold hover:bg-zinc-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Entrar na Sala
              </button>
            </div>
          </div>

          {errorMessage && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center">
              {errorMessage}
            </div>
          )}

          <button
            onClick={() => setIsMuted(!isMuted)}
            className="w-full px-4 py-2 bg-zinc-800 text-zinc-400 rounded-lg text-sm hover:bg-zinc-700 transition"
          >
            {isMuted ? '🔇 Som desligado' : '🔊 Som ligado'}
          </button>
        </div>
      </div>
    );
  }

  // Render LOBBY
  if (view === 'LOBBY') {
    return (
      <div className="h-screen w-screen flex flex-col bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 p-4">
        <div className="max-w-2xl w-full mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <button
              onClick={resetGame}
              className="px-4 py-2 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition"
            >
              ← Voltar
            </button>
            <div className="flex items-center gap-2">
              <div className="px-4 py-2 bg-zinc-800 rounded-lg">
                <span className="text-zinc-400 text-sm">Código:</span>
                <span className="ml-2 text-white font-bold text-xl tracking-wider">{roomCode}</span>
              </div>
              {isHost && (
                <div className="px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-400 text-sm font-bold">
                  HOST
                </div>
              )}
            </div>
          </div>

          <div className="bg-zinc-800/50 rounded-lg p-6 space-y-4">
            <h2 className="text-2xl font-bold text-white">Jogadores ({lobbyPlayers.length}/{MAX_PLAYERS})</h2>
            
            <div className="space-y-2">
              {lobbyPlayers.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between p-3 bg-zinc-800 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${player.isBot ? 'bg-purple-400' : 'bg-green-400'}`}></div>
                    <span className="text-white font-medium">{player.name}</span>
                    {player.id === playerId && (
                      <span className="text-xs text-zinc-400">(você)</span>
                    )}
                  </div>
                  {isHost && player.id !== playerId && (
                    <button
                      onClick={() => removePlayer(player.id!)}
                      className="px-3 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition text-sm"
                    >
                      Remover
                    </button>
                  )}
                </div>
              ))}
            </div>

            {isHost && lobbyPlayers.length < MAX_PLAYERS && (
              <button
                onClick={addBot}
                className="w-full px-4 py-3 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded-lg font-bold hover:bg-purple-500/20 transition"
              >
                + Adicionar Bot
              </button>
            )}

            {isHost && lobbyPlayers.length >= 2 && (
              <button
                onClick={startGame}
                className="w-full px-6 py-4 bg-white text-zinc-900 rounded-lg font-bold text-lg hover:bg-zinc-100 transition"
              >
                Iniciar Jogo
              </button>
            )}

            {!isHost && (
              <div className="text-center text-zinc-400 text-sm py-4">
                Aguardando o host iniciar o jogo...
              </div>
            )}
          </div>

          {errorMessage && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center">
              {errorMessage}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Render GAME
  if (view === 'GAME' && gameState) {
    const currentPlayer = gameState.players.find(p => p.id === playerId);
    const canSelectCard = gameState.phase === GamePhase.CHOOSING && currentPlayer && !currentPlayer.selectedCard;
    const canSelectRow = gameState.phase === GamePhase.CHOOSING_ROW;

    return (
      <div className="h-screen w-screen flex flex-col bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 overflow-hidden">
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-zinc-900/50 border-b border-zinc-800">
          <button
            onClick={resetGame}
            className="px-3 py-1.5 bg-zinc-800 text-white rounded-lg text-sm hover:bg-zinc-700 transition"
          >
            ← Sair
          </button>
          <div className="text-center">
            <div className="text-sm text-zinc-400">{gameState.message}</div>
          </div>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="px-3 py-1.5 bg-zinc-800 text-white rounded-lg text-sm hover:bg-zinc-700 transition"
          >
            ⚙️
          </button>
        </div>

        {showMenu && (
          <div className="absolute top-14 right-4 z-50 bg-zinc-800 rounded-lg shadow-xl p-4 space-y-2 border border-zinc-700">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="w-full px-4 py-2 bg-zinc-700 text-white rounded hover:bg-zinc-600 transition text-sm"
            >
              {isMuted ? '🔇 Som desligado' : '🔊 Som ligado'}
            </button>
            <button
              onClick={() => setShowMenu(false)}
              className="w-full px-4 py-2 bg-zinc-700 text-white rounded hover:bg-zinc-600 transition text-sm"
            >
              Fechar
            </button>
          </div>
        )}

        <div className="flex-1 flex flex-col lg:flex-row gap-4 p-4 overflow-hidden">
          <div className="flex-1 flex flex-col gap-4 overflow-auto custom-scrollbar">
            <div className="space-y-3">
              {gameState.rows.map((row, idx) => (
                <TableRow
                  key={idx}
                  row={row}
                  rowIndex={idx}
                  isHighlighted={takenRowIndex === idx}
                  canSelect={canSelectRow}
                  onSelect={() => chooseRowToTake(idx)}
                />
              ))}
            </div>
          </div>

          <div className="flex-shrink-0 w-full lg:w-80 space-y-4">
            <ScoreBoard players={gameState.players} currentPlayerId={playerId} />

            {currentPlayer && (
              <div className="bg-zinc-800/50 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-bold">Sua Mão</h3>
                  <span className="text-zinc-400 text-sm">{currentPlayer.hand.length} cartas</span>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {currentPlayer.hand.map((card) => (
                    <Card
                      key={card.value}
                      card={card}
                      onClick={() => canSelectCard && selectPlayerCard(card)}
                      isSelected={currentPlayer.selectedCard?.value === card.value}
                      isDisabled={!canSelectCard}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {gameState.phase === GamePhase.GAME_OVER && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
            <div className="bg-zinc-800 rounded-lg p-8 max-w-md w-full space-y-6">
              <h2 className="text-3xl font-black text-white text-center">Fim do Jogo!</h2>
              <div className="space-y-2">
                {[...gameState.players].sort((a, b) => a.score - b.score).map((player, idx) => (
                  <div
                    key={player.id}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      idx === 0 ? 'bg-yellow-500/20 border border-yellow-500/30' : 'bg-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{idx === 0 ? '🏆' : `${idx + 1}º`}</span>
                      <span className="text-white font-bold">{player.name}</span>
                    </div>
                    <span className="text-white font-bold">{player.score} pts</span>
                  </div>
                ))}
              </div>
              <button
                onClick={resetGame}
                className="w-full px-6 py-3 bg-white text-zinc-900 rounded-lg font-bold hover:bg-zinc-100 transition"
              >
                Voltar ao Início
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Tela de loading quando está carregando o jogo
  if (view === 'GAME' && !gameState) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-white text-lg">Iniciando jogo...</p>
        </div>
      </div>
    );
  }

  // Fallback - não deveria chegar aqui
  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900">
      <div className="text-center space-y-4">
        <p className="text-white text-lg">Carregando...</p>
        <button
          onClick={resetGame}
          className="px-6 py-3 bg-white text-zinc-900 rounded-lg font-bold hover:bg-zinc-100 transition"
        >
          Voltar ao Início
        </button>
      </div>
    </div>
  );
};

export default App;