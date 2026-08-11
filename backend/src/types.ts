export type ExamStatus = 'DRAFT' | 'SCHEDULED' | 'LIVE' | 'ENDED' | 'RESULTS_PUBLISHED';
export type VisibilityStatus = 'PUBLISHED' | 'HIDDEN';
export type AttemptStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'AUTO_SUBMITTED' | 'DISQUALIFIED';

export interface Question {
  id: string;
  examId?: string;
  bankId?: string;
  question: string;
  options: string[];
  answer: number | null;
  marks: number;
  negativeMarks: number;
  explanation?: string;
  subject?: string;
}

export interface Exam {
  id: string;
  title: string;
  subject: string;
  className: string;
  testNumber: string;
  totalQuestions: number;
  startDate: string;
  durationMinutes: number;
  totalMarks: number;
  negativeMarking: number;
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  resultVisibility: VisibilityStatus;
  leaderboardVisibility: VisibilityStatus;
  status: ExamStatus;
  questions: Question[];
  createdAt: string;
  updatedAt: string;
}

export interface Student {
  id: string;
  studentId: string;
  name: string;
  className: string;
  telegramUserId: number | null;
  telegramUsername: string | null;
  linkCode: string;
  status: 'linked' | 'unlinked';
  linkedAt?: string;
}

export interface Attempt {
  id: string;
  examId: string;
  studentId: string;
  telegramUserId: number;
  studentName: string;
  studentClass: string;
  startedAt: string;
  expiresAt: string;
  submittedAt: string | null;
  status: AttemptStatus;
  answers: Record<string, number>;
  currentQuestionIndex: number;
  score: number;
  maxScore: number;
  percentage: number;
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  timeTakenSeconds: number;
  rank?: number;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  action: string;
  details: string;
  actor: string;
}

export interface SystemSettings {
  telegramBotToken: string;
  webhookUrl: string;
  botUsername: string;
  botActive: boolean;
  autoPublishResults: boolean;
  systemNotice: string;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface TelegramChat {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  type: 'private' | 'group';
}

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export interface TelegramMessage {
  message_id: number;
  from: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  reply_markup?: InlineKeyboardMarkup;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface SimulatorResponse {
  chatId: number;
  text: string;
  replyMarkup?: InlineKeyboardMarkup;
  messageId?: number;
  type: 'sendMessage' | 'editMessageText';
}
