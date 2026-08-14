
CREATE TABLE teachers (
  username VARCHAR(64) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  password_hash VARCHAR(200) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE exams (
  id VARCHAR(64) PRIMARY KEY,
  teacher_id VARCHAR(64) NOT NULL,
  title VARCHAR(300) NOT NULL,
  subject VARCHAR(120),
  class_name VARCHAR(120),
  test_number VARCHAR(64),
  total_questions INT NOT NULL DEFAULT 0,
  start_date TIMESTAMPTZ NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 60,
  total_marks INT NOT NULL DEFAULT 0,
  negative_marking DOUBLE PRECISION NOT NULL DEFAULT 0,
  randomize_questions BOOLEAN NOT NULL DEFAULT FALSE,
  randomize_options BOOLEAN NOT NULL DEFAULT FALSE,
  result_visibility VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED',
  leaderboard_visibility VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED',
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_exams_teacher ON exams(teacher_id);
CREATE TABLE questions (
  id VARCHAR(64) PRIMARY KEY,
  exam_id VARCHAR(64),
  teacher_id VARCHAR(64),
  question TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]',
  answer INT,
  marks DOUBLE PRECISION NOT NULL DEFAULT 1,
  negative_marks DOUBLE PRECISION NOT NULL DEFAULT 0,
  explanation TEXT,
  subject VARCHAR(120),
  sort_order INT NOT NULL DEFAULT 0
);
CREATE INDEX idx_questions_exam ON questions(exam_id);
CREATE TABLE students (
  id VARCHAR(64) PRIMARY KEY,
  student_code VARCHAR(64) NOT NULL,
  name VARCHAR(200) NOT NULL,
  class_name VARCHAR(120),
  telegram_user_id BIGINT UNIQUE,
  telegram_username VARCHAR(120),
  link_code VARCHAR(32),
  status VARCHAR(20) NOT NULL DEFAULT 'unlinked',
  linked_at TIMESTAMPTZ,
  teacher_ids JSONB NOT NULL DEFAULT '[]'
);
CREATE TABLE attempts (
  id VARCHAR(64) PRIMARY KEY,
  exam_id VARCHAR(64) NOT NULL,
  student_id VARCHAR(64),
  telegram_user_id BIGINT NOT NULL,
  student_name VARCHAR(200),
  student_class VARCHAR(120),
  started_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ,
  status VARCHAR(32) NOT NULL,
  answers JSONB NOT NULL DEFAULT '{}',
  current_question_index INT NOT NULL DEFAULT 0,
  score DOUBLE PRECISION NOT NULL DEFAULT 0,
  max_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  percentage DOUBLE PRECISION NOT NULL DEFAULT 0,
  correct_count INT NOT NULL DEFAULT 0,
  wrong_count INT NOT NULL DEFAULT 0,
  skipped_count INT NOT NULL DEFAULT 0,
  time_taken_seconds INT NOT NULL DEFAULT 0,
  rank INT,
  is_official BOOLEAN NOT NULL DEFAULT TRUE,
  attempt_number INT NOT NULL DEFAULT 1,
  version BIGINT NOT NULL DEFAULT 0,
  UNIQUE (exam_id, telegram_user_id, attempt_number)
);
CREATE TABLE system_settings (
  id BIGINT PRIMARY KEY,
  bot_username VARCHAR(120),
  system_notice TEXT,
  bot_active BOOLEAN NOT NULL DEFAULT TRUE,
  auto_publish_results BOOLEAN NOT NULL DEFAULT TRUE
);
INSERT INTO system_settings (id, bot_username, system_notice, bot_active, auto_publish_results)
VALUES (1, '@quizbotbypusparghya_bot', '', TRUE, TRUE);
