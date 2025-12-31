
import { CardType } from './types';

export const getBullsForValue = (val: number): number => {
  if (val === 55) return 7;
  if (val % 11 === 0) return 5;
  if (val % 10 === 0) return 3;
  if (val % 5 === 0) return 2;
  return 1;
};

export const createDeck = (): CardType[] => {
  return Array.from({ length: 104 }, (_, i) => ({
    value: i + 1,
    bulls: getBullsForValue(i + 1),
  }));
};

export const shuffle = <T,>(array: T[]): T[] => {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
};
