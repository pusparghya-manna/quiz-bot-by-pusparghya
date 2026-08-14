package com.pusparghya.quizbot.telegram;

import com.fasterxml.jackson.databind.JsonNode;
import com.pusparghya.quizbot.common.Ids;
import com.pusparghya.quizbot.common.MarkdownEscaper;
import com.pusparghya.quizbot.exam.ExamEntity;
import com.pusparghya.quizbot.exam.ExamRepository;
import com.pusparghya.quizbot.exam.ExamStatus;
import com.pusparghya.quizbot.question.QuestionEntity;
import com.pusparghya.quizbot.question.QuestionRepository;
import com.pusparghya.quizbot.result.RankingService;
import com.pusparghya.quizbot.student.StudentEntity;
import com.pusparghya.quizbot.student.StudentRepository;
import com.pusparghya.quizbot.submission.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;

@Service
public class TelegramUpdateService {
  private final TelegramClient client;
  private final StudentRepository students;
  private final ExamRepository exams;
  private final QuestionRepository questions;
  private final AttemptRepository attempts;
  private final ScoringService scoring;
  private final RankingService ranking;

  public TelegramUpdateService(TelegramClient client, StudentRepository students, ExamRepository exams,
                               QuestionRepository questions, AttemptRepository attempts,
                               ScoringService scoring, RankingService ranking) {
    this.client = client; this.students = students; this.exams = exams;
    this.questions = questions; this.attempts = attempts; this.scoring = scoring; this.ranking = ranking;
  }

  @Transactional
  public void process(JsonNode update) {
    if (update.has("callback_query")) { handleCallback(update.get("callback_query")); return; }
    if (update.has("message")) handleMessage(update.get("message"));
  }

  private void handleMessage(JsonNode msg) {
    JsonNode from = msg.get("from");
    if (from == null) return;
    long chatId = msg.get("chat").get("id").asLong();
    String text = msg.has("text") ? msg.get("text").asText("") : "";
    StudentEntity student = ensureStudent(from);
    if (text.startsWith("/start")) {
      String payload = text.length() > 6 ? text.substring(6).trim() : "";
      if (payload.startsWith("exam_")) { startExam(payload.substring(5), student, chatId); return; }
    }
    client.sendMessage(chatId, "🎓 *Quiz Bot by Pusparghya*\n\nHello *" + MarkdownEscaper.escape(student.getName())
        + "*\nUse the exam link from your teacher.", Map.of("inline_keyboard", List.of(List.of(Map.of("text", "🏠 Main menu", "callback_data", "btn_home")))));
  }

  private void handleCallback(JsonNode cb) {
    String data = cb.has("data") ? cb.get("data").asText("") : "";
    JsonNode from = cb.get("from");
    long chatId = cb.get("message").get("chat").get("id").asLong();
    Long messageId = cb.get("message").get("message_id").asLong();
    client.answerCallback(cb.get("id").asText());
    StudentEntity student = ensureStudent(from);
    if ("btn_home".equals(data)) {
      handleMessage(cb.get("message"));
      return;
    }
    if (data.startsWith("start_exam_") || data.startsWith("resume_exam_")) {
      startExam(data.replace("start_exam_", "").replace("resume_exam_", ""), student, chatId);
      return;
    }
    if (data.startsWith("ans_")) {
      String[] p = data.split("_");
      if (p.length >= 4) answer(p[1], Integer.parseInt(p[2]), Integer.parseInt(p[3]), student, chatId, messageId);
    }
  }

  private StudentEntity ensureStudent(JsonNode from) {
    long userId = from.get("id").asLong();
    return students.findByTelegramUserId(userId).orElseGet(() -> {
      StudentEntity s = new StudentEntity();
      s.setId(Ids.student());
      s.setStudentCode(Ids.studentCode());
      String name = from.has("first_name") ? from.get("first_name").asText("Student") : "Student";
      s.setName(name);
      s.setTelegramUserId(userId);
      if (from.has("username")) s.setTelegramUsername("@" + from.get("username").asText());
      s.setLinkCode(Ids.linkCode());
      s.setStatus("linked");
      s.setLinkedAt(Instant.now());
      s.setTeacherIds(new ArrayList<>());
      return students.save(s);
    });
  }

  private void startExam(String examId, StudentEntity student, long chatId) {
    ExamEntity exam = exams.findById(examId).orElse(null);
    if (exam == null || exam.getStatus() == ExamStatus.DRAFT || exam.getTeacherId() == null) {
      client.sendMessage(chatId, "❌ Exam not available.", null); return;
    }
    Instant now = Instant.now();
    if (now.isBefore(exam.getStartDate())) {
      client.sendMessage(chatId, "🔒 Exam locked until start time.", null); return;
    }
    List<String> tids = student.getTeacherIds() == null ? new ArrayList<>() : new ArrayList<>(student.getTeacherIds());
    if (!tids.contains(exam.getTeacherId())) { tids.add(exam.getTeacherId()); student.setTeacherIds(tids); students.save(student); }
    List<AttemptEntity> mine = attempts.findByExamIdAndTelegramUserIdOrderByAttemptNumberAsc(examId, student.getTelegramUserId());
    Optional<AttemptEntity> prog = mine.stream().filter(a -> a.getStatus() == AttemptStatus.IN_PROGRESS).findFirst();
    if (prog.isPresent()) { render(exam, prog.get(), chatId, null); return; }
    boolean officialExists = mine.stream().anyMatch(a -> a.isOfficial() && (a.getStatus() == AttemptStatus.SUBMITTED || a.getStatus() == AttemptStatus.AUTO_SUBMITTED));
    AttemptEntity att = new AttemptEntity();
    att.setId(Ids.attempt());
    att.setExamId(examId);
    att.setStudentId(student.getStudentCode());
    att.setTelegramUserId(student.getTelegramUserId());
    att.setStudentName(student.getName());
    att.setStudentClass(student.getClassName());
    att.setStartedAt(now);
    att.setExpiresAt(now.plusSeconds(Math.max(1, exam.getDurationMinutes()) * 60L));
    att.setStatus(AttemptStatus.IN_PROGRESS);
    att.setAnswers(new HashMap<>());
    att.setOfficial(exam.isWindowOpen(now) && !officialExists);
    att.setAttemptNumber(mine.size() + 1);
    attempts.save(att);
    render(exam, att, chatId, null);
  }

  private void render(ExamEntity exam, AttemptEntity att, long chatId, Long messageId) {
    List<QuestionEntity> qs = questions.findByExamIdOrderBySortOrderAsc(exam.getId());
    if (qs.isEmpty()) { client.sendMessage(chatId, "No questions.", null); return; }
    if (att.getCurrentQuestionIndex() >= qs.size()) { submit(exam, att, chatId, messageId); return; }
    QuestionEntity q = qs.get(att.getCurrentQuestionIndex());
    StringBuilder text = new StringBuilder("📝 *" + MarkdownEscaper.escape(exam.getTitle()) + "*\nQ" + (att.getCurrentQuestionIndex()+1) + "/" + qs.size() + "\n\n" + MarkdownEscaper.escape(q.getQuestion()));
    List<List<Map<String,String>>> rows = new ArrayList<>();
    List<String> opts = q.getOptions() == null ? List.of() : q.getOptions();
    for (int i=0;i<opts.size();i++) {
      rows.add(List.of(Map.of("text", (char)('A'+i)+". "+opts.get(i), "callback_data", "ans_"+att.getId()+"_"+att.getCurrentQuestionIndex()+"_"+i)));
    }
    rows.add(List.of(Map.of("text","🏠 Main menu","callback_data","btn_home")));
    Map<String,Object> kb = Map.of("inline_keyboard", rows);
    if (messageId != null) client.editMessageText(chatId, messageId, text.toString(), kb);
    else client.sendMessage(chatId, text.toString(), kb);
  }

  private void answer(String attemptId, int qIndex, int option, StudentEntity student, long chatId, long messageId) {
    AttemptEntity att = attempts.findByIdForUpdate(attemptId).orElse(null);
    if (att == null || att.getTelegramUserId() != student.getTelegramUserId() || att.getStatus() != AttemptStatus.IN_PROGRESS) return;
    ExamEntity exam = exams.findById(att.getExamId()).orElse(null);
    if (exam == null) return;
    if (Instant.now().isAfter(att.getExpiresAt())) { submit(exam, att, chatId, messageId); return; }
    List<QuestionEntity> qs = questions.findByExamIdOrderBySortOrderAsc(exam.getId());
    if (qIndex < 0 || qIndex >= qs.size()) return;
    Map<String,Integer> answers = new HashMap<>(att.getAnswers());
    answers.put(qs.get(qIndex).getId(), option);
    att.setAnswers(answers);
    att.setCurrentQuestionIndex(qIndex + 1);
    attempts.save(att);
    render(exam, att, chatId, messageId);
  }

  private void submit(ExamEntity exam, AttemptEntity att, long chatId, Long messageId) {
    if (att.getStatus() != AttemptStatus.IN_PROGRESS) return;
    List<QuestionEntity> qs = questions.findByExamIdOrderBySortOrderAsc(exam.getId());
    int secs = (int) Math.max(0, Instant.now().getEpochSecond() - att.getStartedAt().getEpochSecond());
    var r = scoring.score(qs, att.getAnswers(), exam.getNegativeMarking(), exam.getTotalMarks(), secs);
    att.setScore(r.score()); att.setMaxScore(r.maxScore()); att.setPercentage(r.percentage());
    att.setCorrectCount(r.correct()); att.setWrongCount(r.wrong()); att.setSkippedCount(r.skipped());
    att.setTimeTakenSeconds(secs); att.setSubmittedAt(Instant.now());
    att.setStatus(Instant.now().isAfter(att.getExpiresAt()) ? AttemptStatus.AUTO_SUBMITTED : AttemptStatus.SUBMITTED);
    attempts.save(att);
    ranking.recalculate(exam.getId());
    String text = "✅ *Submitted*\n⭐ " + (int)att.getScore() + "/" + (int)att.getMaxScore() + " (" + att.getPercentage() + "%)";
    Map<String,Object> kb = Map.of("inline_keyboard", List.of(List.of(Map.of("text","🏠 Main menu","callback_data","btn_home"))));
    if (messageId != null) client.editMessageText(chatId, messageId, text, kb); else client.sendMessage(chatId, text, kb);
  }
}
