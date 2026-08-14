import type { Question } from '../types';

export const emptyQuestion = (): Question => ({
  id: `Q_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
  question: '',
  options: ['', '', '', ''],
  answer: 0,
  marks: 1,
  negativeMarks: 0,
});
