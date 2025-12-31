import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CardType, Player, GamePhase, GameState, View } from './types';
import { createDeck, shuffle } from './constants';
import Card from './components/Card';
import TableRow from './components/TableRow';
import ScoreBoard from './components/ScoreBoard';

const WINNING_SCORE = 66;
const MAX_PLAYERS = 10;

// Determinar URL do WebSocket baseado no ambiente
const getWebSocketUrl = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}/ws`;
};

// Programmatic Sound Engine
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

