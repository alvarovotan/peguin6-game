
import React from 'react';
import { CardType } from '../types';
import Card from './Card';

interface TableRowProps {
  cards: CardType[];
  isSelectable?: boolean;
  isPenalty?: boolean;
  onSelect?: () => void;
}

const TableRow: React.FC<TableRowProps> = ({ cards, isSelectable, isPenalty, onSelect }) => {
  return (
    <div 
      onClick={isSelectable ? onSelect : undefined}
      className={`
        relative group flex items-center p-3 rounded-2xl transition-all duration-500 border
        ${isSelectable ? 'bg-amber-400/[0.08] border-amber-400/50 cursor-pointer ring-2 ring-amber-400/10' : 'bg-[#1c1c1e] border-zinc-700/40 shadow-inner'}
        ${isPenalty ? 'animate-row-take border-red-500/50 z-10 shadow-lg' : ''}
      `}
    >
      <div className="flex gap-2 md:gap-4 flex-nowrap overflow-hidden py-1 px-1">
        {cards.map((card, i) => (
          <div 
            key={`${card.value}-${i}`} 
            className="animate-in fade-in slide-in-from-left-4 duration-500 fill-mode-both"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <Card value={card.value} bulls={card.bulls} disabled size="small" />
          </div>
        ))}

        {Array.from({ length: 6 - cards.length }).map((_, i) => {
          const isDanger = cards.length + i === 5;
          return (
            <div 
              key={i} 
              className={`
                w-[44px] h-[52px] md:w-16 md:h-20 rounded-xl border-2 border-dashed flex items-center justify-center transition-all duration-300
                ${isDanger ? 'border-red-900/40 bg-red-950/20 text-red-700/50' : 'border-zinc-800 bg-zinc-900/40 text-zinc-700'}
              `}
            >
              <span className="text-[7px] md:text-[9px] font-black tracking-widest uppercase opacity-30">{isDanger ? 'DANGER' : ''}</span>
            </div>
          );
        })}
      </div>
      
      {isPenalty && (
        <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-3 animate-in slide-in-from-right-4">
          <span className="text-[11px] font-black text-red-400 tracking-[0.3em] uppercase italic drop-shadow-sm">COMPROU!</span>
        </div>
      )}
    </div>
  );
};

export default TableRow;
