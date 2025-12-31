
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { CardType, Player, GamePhase, GameState, View } from './types';
import { createDeck, shuffle } from './constants';
import Card from './components/Card';
import TableRow from './components/TableRow';
import ScoreBoard from './components/ScoreBoard';

const WINNING_SCORE = 66;
const MAX_PLAYERS = 10;

// Programmatic Sound Engine
const playSound = (type: 'select' | 'reveal' | 'place' | 'penalty' | 'shuffle' | 'win', isMuted: boolean) => {
  if (isMuted) return;
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
};


// WebSocket URL
const WS_URL = window.location.protocol === 'https:' 
  ? `wss://${window.location.host}/ws`
  : `ws://${window.location.host}/ws`;

const App: React.FC = () => {
  const [view, setView] = useState<View>('HOME');
  const [playerName, setPlayerName] = useState('Jogador');
  const [isMuted, setIsMuted] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [lobbyPlayers, setLobbyPlayers] = useState<Partial<Player>[]>([
    { id: 'player', name: 'Jogador', isBot: false, score: 0 }
  ]);
  const [roomCode, setRoomCode] = useState(() => Math.random().toString(36).substring(2, 8).toUpperCase());
  const [inputCode, setInputCode] = useState('');

  
  // WebSocket state
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [playerId, setPlayerId] = useState<string>('');
  const [roomId, setRoomId] = useState<string>('');
  const [waitingForPlayers, setWaitingForPlayers] = useState(false);

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [takenRowIndex, setTakenRowIndex] = useState<number | null>(null);

  const handleCreateRoom = () => {
    if (!playerName.trim()) {
      alert('Digite seu nome!');
      return;
    }
    if (!ws || !wsConnected) {
      alert('Conectando ao servidor...');
      return;
    }
    
    playSound('select', isMuted);
    console.log('[WS] Criando sala...');
    ws.send(JSON.stringify({
      type: 'CREATE_ROOM',
      payload: { playerName: playerName.trim() }
    }));
  };

  const handleJoinRoom = () => {
    if (!playerName.trim()) {
      alert('Digite seu nome!');
      return;
    }
    if (inputCode.length < 4) {
      alert('Digite o código da sala!');
      return;
    }
    if (!ws || !wsConnected) {
      alert('Conectando ao servidor...');
      return;
    }
    
    playSound('select', isMuted);
    console.log('[WS] Entrando na sala...');
    ws.send(JSON.stringify({
      type: 'JOIN_ROOM',
      payload: { 
        roomId: inputCode.trim().toUpperCase(),
        playerName: playerName.trim()
      }
    }));
  };

  const addBot = () => {
    playSound('select', isMuted);
    if (lobbyPlayers.length >= MAX_PLAYERS) return;
    
    const newPlayers = [
      ...lobbyPlayers,
      { id: `bot-${Date.now()}`, name: `Bot ${lobbyPlayers.filter(p => p.isBot).length + 1}`, isBot: true, score: 0 }
    ];
    setLobbyPlayers(newPlayers);
    
    if (ws && wsConnected) {
      console.log('[WS] Atualizando bots...');
      ws.send(JSON.stringify({
        type: 'UPDATE_BOTS',
        payload: { players: newPlayers }
      }));
    }
  };

  const removePlayer = (id: string) => {
    playSound('penalty', isMuted);
    if (id === playerId) return;
    
    const newPlayers = lobbyPlayers.filter(p => p.id !== id);
    setLobbyPlayers(newPlayers);
    
    if (ws && wsConnected) {
      console.log('[WS] Removendo jogador...');
      ws.send(JSON.stringify({
        type: 'UPDATE_BOTS',
        payload: { players: newPlayers }
      }));
    }
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
      message: 'Sua vez'
    });
    setTakenRowIndex(null);
  }, [isMuted]);

  const startGame = () => {
    if (lobbyPlayers.length < 2) {
      alert('Adicione pelo menos 2 jogadores!');
      return;
    }
    
    playSound('select', isMuted);
    
    if (ws && wsConnected) {
      console.log('[WS] Iniciando jogo...');
      ws.send(JSON.stringify({
        type: 'START_GAME',
        payload: {}
      }));
    }
  };

  const selectPlayerCard = (card: CardType) => {
    if (!gameState || gameState.phase !== GamePhase.CHOOSING) return;
    if (waitingForPlayers) return;
    
    playSound('select', isMuted);
    
    // Remover carta da mão localmente
    setGameState(prev => prev ? {
      ...prev,
      players: prev.players.map(p => 
        p.id === playerId 
          ? { ...p, hand: p.hand.filter(c => c.value !== card.value), selectedCard: card }
          : p
      ),
      message: 'Aguardando outros jogadores...'
    } : null);
    
    setWaitingForPlayers(true);
    
    // Enviar jogada para servidor
    if (ws && wsConnected) {
      console.log('[WS] Jogando carta:', card.value);
      ws.send(JSON.stringify({
        type: 'PLAY_CARD',
        payload: { cardValue: card.value }
      }));
    }
  };

  // WebSocket connection
  useEffect(() => {
    const websocket = new WebSocket(WS_URL);
    
    websocket.onopen = () => {
      console.log('[WS] Conectado');
      setWsConnected(true);
    };
    
    websocket.onclose = () => {
      console.log('[WS] Desconectado');
      setWsConnected(false);
    };
    
    websocket.onerror = (error) => {
      console.error('[WS] Erro:', error);
    };
    
    websocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[WS] Mensagem recebida:', data.type);
        handleWebSocketMessage(data);
      } catch (error) {
        console.error('[WS] Erro ao processar mensagem:', error);
      }
    };
    
    setWs(websocket);
    
    return () => {
      console.log('[WS] Fechando conexão');
      websocket.close();
    };
  }, []);

  const handleWebSocketMessage = (data: any) => {
    const { type, payload } = data;
    
    switch (type) {
      case 'ROOM_CREATED':
        console.log('[WS] Sala criada:', payload.roomId);
        setRoomId(payload.roomId);
        setPlayerId(payload.playerId);
        setRoomCode(payload.roomId);
        setLobbyPlayers([{ id: payload.playerId, name: payload.playerName, isBot: false, score: 0 }]);
        setView('LOBBY');
        break;
        
      case 'JOIN_CONFIRMED':
        console.log('[WS] Entrada confirmada');
        setRoomId(payload.roomId);
        setPlayerId(payload.playerId);
        setView('LOBBY');
        break;
        
      case 'PLAYER_JOINED':
      case 'BOTS_UPDATED':
        console.log('[WS] Jogadores atualizados');
        setLobbyPlayers(payload.players);
        break;
        
      case 'GAME_STARTED':
        console.log('[WS] Jogo iniciado');
        const myPlayer = payload.players.find((p: any) => p.id === payload.playerId);
        if (myPlayer && myPlayer.hand) {
          const serverPlayers: Player[] = payload.players.map((p: any) => ({
            id: p.id,
            name: p.name,
            isBot: p.isBot,
            score: p.score,
            hand: p.hand,
            selectedCard: null
          }));
          
          setGameState({
            rows: payload.rows,
            players: serverPlayers,
            phase: GamePhase.CHOOSING,
            currentTurnOrder: [],
            resolvingIndex: 0,
            message: 'Escolha sua carta'
          });
          
          setView('GAME');
        }
        break;
        
      case 'CARD_PLAYED':
        console.log('[WS] Carta jogada');
        setWaitingForPlayers(!payload.allPlayed);
        if (payload.allPlayed && gameState) {
          setGameState(prev => prev ? {
            ...prev,
            phase: GamePhase.REVEALING,
            message: 'Revelando...'
          } : null);
        }
        break;
        
      case 'ROUND_REVEALING':
        console.log('[WS] Revelando cartas');
        if (gameState) {
          playSound('reveal', isMuted);
          setGameState(prev => prev ? {
            ...prev,
            phase: GamePhase.REVEALING,
            message: 'Revelando...'
          } : null);
        }
        break;
        
      case 'CARD_RESOLVED':
        console.log('[WS] Carta resolvida');
        if (gameState) {
          setGameState(prev => prev ? {
            ...prev,
            rows: payload.rows,
            players: prev.players.map(p => {
              const updated = payload.players.find((up: any) => up.id === p.id);
              return updated ? { ...p, score: updated.score } : p;
            }),
            message: `${payload.playerName} ${payload.penalty > 0 ? `pegou ${payload.penalty} pontos!` : 'jogou'}`
          } : null);
          if (payload.penalty > 0) {
            playSound('penalty', isMuted);
            setTakenRowIndex(payload.rowIndex);
            setTimeout(() => setTakenRowIndex(null), 800);
          } else {
            playSound('place', isMuted);
          }
        }
        break;
        
      case 'NEXT_TURN':
        console.log('[WS] Próximo turno');
        if (gameState) {
          setGameState(prev => prev ? {
            ...prev,
            phase: GamePhase.CHOOSING,
            message: 'Escolha sua carta',
            players: prev.players.map(p => ({ ...p, selectedCard: null }))
          } : null);
        }
        setWaitingForPlayers(false);
        break;
        
      case 'NEW_ROUND_STARTING':
        console.log('[WS] Nova rodada iniciando');
        if (gameState) {
          playSound('shuffle', isMuted);
          setGameState(prev => prev ? {
            ...prev,
            phase: GamePhase.BETWEEN_ROUNDS,
            message: 'Preparando nova rodada...'
          } : null);
        }
        break;
        
      case 'ROUND_STARTED':
        console.log('[WS] Rodada iniciada');
        if (gameState) {
          const myHand = payload.hand;
          setGameState(prev => prev ? {
            ...prev,
            rows: payload.rows,
            phase: GamePhase.CHOOSING,
            message: 'Escolha sua carta',
            players: prev.players.map(p => {
              if (p.id === playerId) {
                return { ...p, hand: myHand, selectedCard: null };
              }
              const updated = payload.players.find((up: any) => up.id === p.id);
              return updated ? { ...p, score: updated.score, selectedCard: null } : p;
            })
          } : null);
        }
        break;
        
      case 'GAME_OVER':
        console.log('[WS] Fim de jogo');
        if (gameState) {
          playSound('win', isMuted);
          setGameState(prev => prev ? {
            ...prev,
            phase: GamePhase.GAME_OVER,
            message: 'Fim de jogo!',
            players: prev.players.map(p => {
              const updated = payload.players.find((up: any) => up.id === p.id);
              return updated ? { ...p, score: updated.score } : p;
            })
          } : null);
        }
        break;
        
      case 'ERROR':
        console.error('[WS] Erro do servidor:', payload.message);
        alert(payload.message);
        break;
    }
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
          message: 'Processando...'
        }) : null);
      }, 800);
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
            return { ...prev, phase: GamePhase.GAME_OVER, message: 'Fim da linha!' };
          }
          return { ...prev, phase: GamePhase.BETWEEN_ROUNDS, message: 'Calculando...' };
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
        if (!player.isBot) return { ...prev, phase: GamePhase.CHOOSING_ROW, message: 'Escolha o veneno!' };
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
      } else {
        playSound('place', isMuted);
        const newRows = [...prev.rows];
        newRows[targetRowIndex] = [...targetRow, card];
        const newPlayers = prev.players.map(p => p.id === player.id ? { ...p, hand: p.hand.filter(c => c.value !== card.value) } : p);
        return { ...prev, rows: newRows, players: newPlayers, resolvingIndex: prev.resolvingIndex + 1 };
      }
    });
  }, [isMuted]);

  useEffect(() => {
    if (gameState?.phase === GamePhase.RESOLVING) {
      const timer = setTimeout(resolveNextCard, 800);
      return () => clearTimeout(timer);
    }
    if (gameState?.phase === GamePhase.BETWEEN_ROUNDS) {
      const timer = setTimeout(() => startNewRound(gameState.players), 3000);
      return () => clearTimeout(timer);
    }
  }, [gameState?.phase, gameState?.resolvingIndex, resolveNextCard, startNewRound]);

  useEffect(() => {
    if (takenRowIndex !== null) {
      const timer = setTimeout(() => setTakenRowIndex(null), 1200);
      return () => clearTimeout(timer);
    }
  }, [takenRowIndex]);

  const handleRowSelection = (rowIndex: number) => {
    if (!gameState || gameState.phase !== GamePhase.CHOOSING_ROW) return;
    playSound('penalty', isMuted);
    const currentMove = gameState.currentTurnOrder[gameState.resolvingIndex];
    const penalty = gameState.rows[rowIndex].reduce((sum, c) => sum + c.bulls, 0);
    setTakenRowIndex(rowIndex);
    const newRows = [...gameState.rows];
    newRows[rowIndex] = [currentMove.card];
    const newPlayers = gameState.players.map(p => p.id === currentMove.playerId ? { ...p, score: p.score + penalty, hand: p.hand.filter(c => c.value !== currentMove.card.value) } : p);
    setGameState({ ...gameState, rows: newRows, players: newPlayers, phase: GamePhase.RESOLVING, resolvingIndex: gameState.resolvingIndex + 1, message: 'Processando...' });
  };

  const quitGame = () => {
    playSound('penalty', isMuted);
    setShowMenu(false);
    setView('HOME');
    setGameState(null);
  };

  const sortedRevealedPlayers = useMemo(() => {
    if (!gameState) return [];
    return [...gameState.players].sort((a, b) => {
      const valA = a.selectedCard?.value ?? 0;
      const valB = b.selectedCard?.value ?? 0;
      return valA - valB;
    });
  }, [gameState?.players]);

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    if (!next) playSound('select', false);
  };

  const MuteButton = (
    <button 
      onClick={toggleMute}
      className="p-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-400 hover:text-zinc-100 transition-colors"
      title={isMuted ? "Ativar som" : "Mutar som"}
    >
      {isMuted ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
      )}
    </button>
  );

  const GameMenuButton = (
    <button 
      onClick={() => { playSound('select', isMuted); setShowMenu(true); }}
      className="p-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-400 hover:text-zinc-100 transition-colors"
      title="Menu do Jogo"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
    </button>
  );

  if (view === 'HOME') {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center p-8 bg-[#181818] text-zinc-100 font-sans relative">
        <div className="absolute top-6 right-6">{MuteButton}</div>
        <div className="text-center mb-16 animate-in fade-in slide-in-from-top-4 duration-1000">
          <h1 className="text-5xl font-black tracking-[0.4em] uppercase italic mb-2 text-white drop-shadow-xl">Pegue em 6</h1>
          <p className="text-[10px] font-black tracking-[0.6em] text-zinc-400 uppercase">Minimalista • Online • Bots</p>
        </div>
        <div className="w-full max-w-xs space-y-10">
          <div className="space-y-3">
            <label className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500 px-1">Nickname</label>
            <input 
              type="text" 
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full bg-zinc-800/40 border border-zinc-700 rounded-xl p-5 text-sm font-bold tracking-widest focus:outline-none focus:ring-1 focus:ring-zinc-400 transition-all text-white placeholder-zinc-600 shadow-md"
            />
          </div>
          <div className="flex flex-col gap-4">
            <button 
              onClick={handleCreateRoom}
              className="w-full bg-zinc-100 text-zinc-900 p-5 rounded-2xl text-xs font-black uppercase tracking-[0.3em] hover:bg-white transition-all active:scale-95 shadow-lg"
            >
              Criar Lobby
            </button>
            <button 
              onClick={() => { playSound('select', isMuted); setView('JOIN'); }}
              className="w-full bg-zinc-800/60 text-zinc-100 p-5 rounded-2xl text-xs font-black uppercase tracking-[0.3em] border border-zinc-700 hover:bg-zinc-800 transition-all active:scale-95"
            >
              Entrar em Lobby
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'JOIN') {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center p-8 bg-[#181818] text-zinc-100 font-sans relative">
        <div className="absolute top-6 right-6 flex gap-3">
           <button 
              onClick={() => { playSound('select', isMuted); setView('HOME'); }}
              className="p-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-400 hover:text-zinc-100 transition-colors"
           >
             <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
           </button>
           {MuteButton}
        </div>
        <div className="w-full max-w-xs space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
           <div className="text-center">
              <h2 className="text-[10px] font-black uppercase tracking-[0.5em] text-zinc-500 mb-2">Conectar</h2>
              <h1 className="text-3xl font-black text-white uppercase italic">Inserir Código</h1>
           </div>
           <div className="space-y-4">
              <input 
                type="text" 
                maxLength={6}
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                placeholder="Ex: A1B2C3"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-5 text-center text-lg font-mono font-bold tracking-[0.3em] focus:outline-none focus:ring-1 focus:ring-zinc-400 transition-all text-white placeholder-zinc-700 shadow-inner"
              />
              <button 
                onClick={handleJoinRoom}
                disabled={inputCode.length < 4}
                className="w-full bg-zinc-100 text-zinc-900 p-5 rounded-2xl text-xs font-black uppercase tracking-[0.3em] hover:bg-white transition-all active:scale-95 disabled:opacity-20 shadow-lg"
              >
                Entrar
              </button>
           </div>
        </div>
      </div>
    );
  }

  if (view === 'LOBBY') {
    return (
      <div className="h-screen w-full flex flex-col p-8 md:p-12 bg-[#181818] text-zinc-100 font-sans overflow-hidden relative">
        <div className="absolute top-6 right-6 flex gap-3">
           <button 
              onClick={() => { playSound('select', isMuted); setView('HOME'); }}
              className="p-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-400 hover:text-zinc-100 transition-colors"
           >
             <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
           </button>
           {MuteButton}
        </div>
        <div className="max-w-xl mx-auto w-full flex flex-col h-full">
          <div className="flex justify-between items-end mb-12 shrink-0">
            <div>
              <h2 className="text-[10px] font-black uppercase tracking-[0.5em] text-zinc-500 mb-2">Preparação</h2>
              <h1 className="text-4xl font-black tracking-tighter text-white uppercase italic">Lobby</h1>
            </div>
            <div className="text-right">
              <span className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-500 block mb-2">ID da Sala</span>
              <span className="bg-zinc-800 border border-zinc-700 px-4 py-2 rounded-xl text-xs font-mono font-bold tracking-[0.2em] text-zinc-200">
                {roomCode}
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar space-y-3 pr-2">
            {lobbyPlayers.map((p, idx) => (
              <div key={p.id} className="bg-zinc-800/60 border border-zinc-700/40 rounded-2xl p-5 flex justify-between items-center animate-in slide-in-from-bottom-4 duration-500 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className={`w-2.5 h-2.5 rounded-full ${p.isBot ? 'bg-zinc-600' : 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.5)]'}`} />
                  <span className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-200">{p.name} {p.id === playerId && '(You)'}</span>
                </div>
                {p.id !== playerId && (
                  <button onClick={() => removePlayer(p.id!)} className="text-[9px] font-black uppercase tracking-widest text-zinc-400 hover:text-red-400 transition-colors py-1 px-3 border border-transparent hover:border-red-900/20 rounded-lg">
                    Expulsar
                  </button>
                )}
              </div>
            ))}
            {lobbyPlayers.length < MAX_PLAYERS && (
              <button 
                onClick={addBot}
                className="w-full border-2 border-dashed border-zinc-700/40 rounded-2xl p-5 text-[9px] font-black uppercase tracking-[0.5em] text-zinc-500 hover:text-zinc-200 hover:border-zinc-500 transition-all group"
              >
                <span className="group-hover:scale-110 inline-block transition-transform">+ Inserir Robô</span>
              </button>
            )}
          </div>

          <div className="mt-10 pt-10 border-t border-zinc-800 shrink-0">
            <button 
              onClick={startGame}
              disabled={lobbyPlayers.length < 2}
              className="w-full bg-white text-black p-6 rounded-3xl text-[11px] font-black uppercase tracking-[0.5em] hover:bg-zinc-100 transition-all active:scale-95 disabled:opacity-20 shadow-xl"
            >
              Iniciar Partida
            </button>
            <p className="text-center mt-6 text-[9px] font-black uppercase tracking-[0.3em] text-zinc-500">
              {lobbyPlayers.length} Participantes • Max 10
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!gameState) return null;

  return (
    <div className="h-screen w-full bg-[#121212] flex flex-col items-center overflow-hidden select-none font-sans relative">
      {/* Header */}
      <div className="w-full max-w-5xl flex justify-between items-center py-5 px-8 shrink-0 z-10">
        <div className="flex flex-col">
          <h1 className="text-[10px] font-black tracking-[0.4em] text-zinc-500 uppercase">Partida</h1>
          <p className="text-[12px] text-white font-black uppercase tracking-tight italic">{gameState.message}</p>
        </div>
        <div className="flex items-center gap-4">
          <ScoreBoard players={gameState.players} winningScore={WINNING_SCORE} />
          <div className="flex gap-2">
            {MuteButton}
            {GameMenuButton}
          </div>
        </div>
      </div>

      {/* Game Board */}
      <div className="flex-1 w-full max-w-4xl flex flex-col justify-center gap-3 overflow-hidden px-4 md:px-6 pb-[120px] md:pb-[80px]">
        {gameState.rows.map((row, idx) => (
          <TableRow 
            key={idx} 
            cards={row} 
            isSelectable={gameState.phase === GamePhase.CHOOSING_ROW}
            isPenalty={takenRowIndex === idx}
            onSelect={() => handleRowSelection(idx)}
          />
        ))}
      </div>

      {/* FIXED FOOTER for Player's Hand */}
      <div className="fixed bottom-0 left-0 right-0 w-full flex justify-center bg-zinc-900/90 backdrop-blur-xl border-t border-zinc-800/60 z-30 pt-4 pb-6 shadow-2xl">
        <div className="w-full max-w-6xl px-4 overflow-x-auto no-scrollbar">
          <div className="flex flex-nowrap justify-start md:justify-center gap-3 lg:gap-4 min-w-max md:min-w-0 mx-auto px-4">
            {gameState.players.find(p => p.id === playerId)?.hand.map(card => (
              <div key={card.value} className="flex-shrink-0">
                <Card 
                  value={card.value}
                  bulls={card.bulls}
                  onClick={() => gameState.phase === GamePhase.CHOOSING && selectPlayerCard(card)}
                  disabled={gameState.phase !== GamePhase.CHOOSING}
                  size="large"
                  isHost={true}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* In-Game Menu Modal */}
      {showMenu && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[110] backdrop-blur-md p-6 animate-in fade-in duration-300">
           <div className="bg-[#1c1c1e] p-10 rounded-[2rem] border border-zinc-700/50 shadow-2xl max-w-xs w-full flex flex-col items-center gap-6 animate-in zoom-in-95 duration-200">
              <h3 className="text-[10px] font-black uppercase tracking-[0.5em] text-zinc-500 mb-2 italic">Opções</h3>
              <button 
                onClick={() => { playSound('select', isMuted); setShowMenu(false); }}
                className="w-full bg-zinc-100 text-zinc-900 py-5 rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] hover:bg-white active:scale-95 transition-all"
              >
                Continuar Jogando
              </button>
              <button 
                onClick={quitGame}
                className="w-full bg-red-950/20 text-red-500 border border-red-900/30 py-5 rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] hover:bg-red-900/20 active:scale-95 transition-all"
              >
                Desistir do Jogo
              </button>
           </div>
        </div>
      )}

      {/* Reveal Overlay */}
      {(gameState.phase === GamePhase.REVEALING || gameState.phase === GamePhase.RESOLVING) && !showMenu && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none px-6 bg-black/40 backdrop-blur-sm">
          <div className="bg-[#1e1e1e]/98 backdrop-blur-3xl border border-zinc-700/60 p-8 md:p-10 rounded-3xl shadow-2xl flex flex-wrap justify-center items-center gap-6 md:gap-10 transition-all animate-in fade-in zoom-in duration-300 pointer-events-auto max-w-5xl">
             {sortedRevealedPlayers.map(p => {
               const isCurrent = gameState.currentTurnOrder[gameState.resolvingIndex]?.playerId === p.id;
                const isHost = p.id === playerId;
               return (
                 <div key={p.id} className={`flex flex-col items-center gap-3 transition-all duration-300 ${isCurrent ? 'scale-110 md:scale-125 z-10' : 'scale-90 opacity-25'}`}>
                    <span className={`text-[10px] md:text-[11px] uppercase font-black tracking-[0.2em] ${isHost ? 'text-amber-400' : 'text-zinc-400'}`}>
                      {p.name}
                    </span>
                    {p.selectedCard && (
                       <div className="w-[48px] h-[58px] md:w-20 md:h-24 flex items-center justify-center">
                          <Card 
                            value={p.selectedCard.value} 
                            bulls={p.selectedCard.bulls} 
                            isHighlighted={isCurrent}
                            size={isHost ? 'large' : 'small'}
                            isHost={isHost}
                          />
                       </div>
                    )}
                 </div>
               );
             })}
          </div>
        </div>
      )}

      {/* Final Results Modal */}
      {gameState.phase === GamePhase.GAME_OVER && (
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-[100] backdrop-blur-3xl p-6">
          <div className="bg-[#1e1e1e] p-12 md:p-16 rounded-[2.5rem] border border-zinc-700 text-center shadow-2xl flex flex-col items-center max-w-md w-full">
            <h2 className="text-3xl font-black tracking-[0.5em] text-white mb-12 uppercase italic border-b border-zinc-800 pb-6 w-full">Ranking</h2>
            <div className="space-y-4 mb-14 w-full px-4">
              {gameState.players.sort((a,b) => a.score - b.score).map((p, i) => (
                <div key={p.id} className="flex justify-between items-center py-4 border-b border-zinc-800/40">
                   <span className={`text-[13px] uppercase tracking-widest ${i === 0 ? 'text-amber-400 font-black' : 'text-zinc-400 font-bold'}`}>
                     {i === 0 && '♛ '}{p.name}
                   </span>
                   <span className={`text-sm font-mono font-black ${i === 0 ? 'text-white' : 'text-zinc-500'}`}>{p.score}</span>
                </div>
              ))}
            </div>
            <button 
              onClick={() => { playSound('select', isMuted); setView('HOME'); }}
              className="w-full bg-zinc-100 text-zinc-900 py-6 rounded-3xl text-[12px] font-black hover:bg-white transition-all active:scale-95 uppercase tracking-[0.6em] shadow-lg"
            >
              Menu Inicial
            </button>
          </div>
        </div>
      )}

      {/* Shuffle/Preparation Overlay */}
      {gameState.phase === GamePhase.BETWEEN_ROUNDS && (
        <div className="fixed inset-0 flex items-center justify-center bg-zinc-900/95 backdrop-blur-2xl z-[90] animate-in fade-in duration-1000">
          <div className="flex flex-col items-center gap-10">
            <div className="text-zinc-400 text-[12px] font-black tracking-[1em] uppercase italic opacity-60">Misturando Deck...</div>
            <div className="w-80 h-[2px] bg-zinc-800 rounded-full overflow-hidden shadow-inner">
               <div className="h-full bg-white animate-progress"></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
