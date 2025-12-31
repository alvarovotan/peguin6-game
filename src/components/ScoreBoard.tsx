
import React from 'react';
import { Player } from '../types';

interface ScoreBoardProps {
  players: Player[];
  winningScore: number;
}

const ScoreBoard: React.FC<ScoreBoardProps> = ({ players, winningScore }) => {
  return (
    <div className="flex gap-5 md:gap-10 items-center overflow-x-auto no-scrollbar max-w-[65vw] md:max-w-none px-2">
      {players.map(p => {
        const progress = Math.min(100, (p.score / winningScore) * 100);
        const isLeading = p.score === Math.min(...players.map(pl => pl.score));
        
        return (
          <div key={p.id} className="flex flex-col items-end min-w-[36px] md:min-w-[56px]">
            <span className={`text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] truncate max-w-[70px] mb-1 ${isLeading ? 'text-amber-400' : 'text-zinc-500'}`}>
              {p.name}
            </span>
            <div className="flex items-center gap-1">
               <span className={`text-[12px] md:text-sm font-mono font-black ${p.score >= winningScore - 10 ? 'text-red-500' : isLeading ? 'text-zinc-100' : 'text-zinc-400'}`}>
                {p.score}
              </span>
            </div>
            <div className="w-full h-[3px] bg-zinc-800 mt-1.5 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-700 ${p.score >= winningScore - 10 ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.3)]' : isLeading ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.3)]' : 'bg-zinc-600'}`} 
                style={{ width: `${progress}%` }} 
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ScoreBoard;