export type Subject = 'Physics' | 'Chemistry' | 'Biology' | 'Mathematics' | 'General Science';

export type QuestionType = 'Single correct' | 'Diagram question' | 'Assertion & Reason' | 'Calculation';

export interface Question {
  id: string;
  s: Subject;
  type: QuestionType;
  t: string; // Question text
  o: string[]; // Options
  a: number; // Correct option index (0-3)
  e: string; // Explanation
  diagram?: boolean;
  diagramType?: 'prism' | 'circuit' | 'cell' | 'molecule' | 'parabola' | 'lens';
  difficulty?: 'Easy' | 'Medium' | 'Hard';
  marks?: number;
  negativeMarks?: number;
}

export interface Exam {
  id: string;
  title: string;
  subtitle: string;
  classLevel: string;
  subjects: Subject[];
  durationMinutes: number;
  totalQuestions: number;
  totalMarks: number;
  status: 'available' | 'ongoing' | 'past' | 'scheduled';
  startTime?: string;
  expiryDate?: string;
  questions: Question[];
  instructions?: string[];
}

export interface ExamAttempt {
  examId: string;
  examTitle: string;
  classLevel: string;
  answers: (number | null)[];
  marked: boolean[];
  visited: boolean[];
  eliminated: Record<number, number[]>; // questionIndex -> array of eliminated option indexes
  secondsLeft: number;
  totalDurationSeconds: number;
  timeSpentSeconds: number;
  startedAt: string;
  completedAt?: string;
  isSubmitted: boolean;
  isPractice?: boolean;
  score?: number;
  maxScore?: number;
  correctCount?: number;
  wrongCount?: number;
  skippedCount?: number;
  accuracy?: number;
  rank?: number;
  totalParticipants?: number;
}

export interface UserProfile {
  name: string;
  studentId: string;
  classLevel: string;
  track: string;
  telegramAccount: string;
  avatarColor: string;
  theme: 'light' | 'dark' | 'system';
  soundEnabled: boolean;
  timerAlerts: boolean;
  fontSize: 'normal' | 'large';
}

export interface BookmarkItem {
  id: string;
  question: Question;
  examTitle: string;
  savedAt: string;
}
