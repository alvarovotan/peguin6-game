
import React from 'react';

interface CardProps {
  value: number;
  bulls: number;
  onClick?: () => void;
  disabled?: boolean;
  size?: 'small' | 'large';
  isHighlighted?: boolean;
  isHost?: boolean;
}

const Card: React.FC<CardProps> = ({ 
  value, 
  bulls, 
  onClick, 
  disabled, 
  size = 'small',
  isHighlighted,
  isHost
}) => {
  const isLarge = size === 'large';
  
  const getDotColor = () => {
    if (bulls >= 7) return 'bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.6)]';
    if (bulls >= 5) return 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)]';
    if (bulls >= 2) return 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.6)]';
    return 'bg-zinc-500';
  };

  const dotColor = getDotColor();

  const sizeClasses = isLarge 
    ? 'w-[52px] h-[66px] md:w-[58px] md:h-[76px] lg:w-[68px] lg:h-[88px]' 
    : 'w-[44px] h-[52px] md:w-16 md:h-20';

  return (
    <div 
      onClick={!disabled ? onClick : undefined}
      className={`
        relative flex flex-col items-center justify-center
        rounded-xl transition-all duration-300 ease-out overflow-hidden border
        ${sizeClasses}
        ${disabled ? 'border-zinc-600 shadow-sm brightness-100' : 'cursor-pointer hover:brightness-110 hover:-translate-y-2 active:scale-95 border-zinc-500 shadow-lg'}
        ${isHighlighted ? 'ring-2 ring-white scale-110 z-10 shadow-[0_0_40px_rgba(255,255,255,0.25)] border-white' : ''}
        ${isHost && !disabled ? 'ring-1 ring-amber-400/30' : ''}
        bg-[#2a2a2e] group
      `}
    >
      <div className={`font-black tracking-tighter transition-colors leading-none mb-1.5 ${isHighlighted ? 'text-white' : 'text-zinc-50'} ${isLarge ? 'text-lg md:text-xl lg:text-2xl' : 'text-sm md:text-lg'}`}>
        {value}
      </div>
      
      <div className="flex flex-wrap justify-center gap-[1px] md:gap-1 px-1 max-w-full">
        {Array.from({ length: bulls }).map((_, i) => (
          <div 
            key={i} 
            className={`w-[3px] h-[3px] md:w-2 md:h-2 rounded-full ${dotColor}`}
          />
        ))}
      </div>
      
      {isHost && isLarge && !disabled && (
        <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.5)]" />
      )}
      
      <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-black/10" />
    </div>
  );
};

export default Card;
