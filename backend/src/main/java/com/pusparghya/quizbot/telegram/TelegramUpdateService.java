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
import com.pusparghya.quizbot.submission.AttemptEntity;
import com.pusparghya.quizbot.submission.AttemptRepository;
import com.pusparghya.quizbot.submission.AttemptStatus;
import com.pusparghya.quizbot.submission.ScoringService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * Single-screen Telegram UX (edit message), aligned with the original bot menus.
 */
@Service
public class TelegramUpdateService {
  private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
  private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("h:mm a").withZone(IST);
  private static final String[] LABELS = {"A", "B", "C", "D", "E", "F"};

  private final TelegramClient client;
  private final StudentRepository students;
  private final ExamRepository exams;
  private final QuestionRepository questions;
  private final AttemptRepository attempts;
  private final ScoringService scoring;
  private final RankingService ranking;
  private final Set<Long> pendingNameUsers = ConcurrentHashMap.newKeySet();

  public TelegramUpdateService(TelegramClient client, StudentRepository students, ExamRepository exams,
                               QuestionRepository questions, AttemptRepository attempts,
                               ScoringService scoring, RankingService ranking) {
    this.client = client;
    this.students = students;
    this.exams = exams;
    this.questions = questions;
    this.attempts = attempts;
    this.scoring = scoring;
    this.ranking = ranking;
  }

  @Transactional
  public void process(JsonNode update) {
    if (update.has("callback_query")) {
      handleCallback(update.get("callback_query"));
      return;
    }
    if (update.has("message")) {
      handleMessage(update.get("message"));
    }
  }

  private void handleMessage(JsonNode msg) {
    if (!msg.has("from") || !msg.has("chat")) return;
    long chatId = msg.get("chat").get("id").asLong();
    JsonNode from = msg.get("from");
    long userId = from.get("id").asLong();
    String text = msg.has("text") ? msg.get("text").asText("") : "";
    StudentEntity student = getOrCreate(from);

    if (pendingNameUsers.contains(userId) && !text.startsWith("/")) {
      String name = text.trim();
      if (name.length() < 2 || name.length() > 60) {
        client.sendMessage(chatId, "Please send a name between 2 and 60 characters.", mainMenuKb());
        return;
      }
      student.setName(name);
      students.save(student);
      pendingNameUsers.remove(userId);
      client.sendMessage(chatId, "✅ Name set to *" + esc(name) + "*", mainMenuKb());
      return;
    }

    if (text.startsWith("/start")) {
      pendingNameUsers.remove(userId);
      String payload = text.length() > 7 ? text.substring(7).trim() : "";
      if (payload.startsWith("exam_")) {
        startExam(payload.substring(5), student, chatId, null);
        return;
      }
      showMainMenu(chatId, null, student);
      return;
    }
    showMainMenu(chatId, null, student);
  }

  private void handleCallback(JsonNode cb) {
    client.answerCallback(cb.get("id").asText());
    if (!cb.has("from") || !cb.has("message")) return;
    long chatId = cb.get("message").get("chat").get("id").asLong();
    long messageId = cb.get("message").get("message_id").asLong();
    JsonNode from = cb.get("from");
    StudentEntity student = getOrCreate(from);
    String data = cb.path("data").asText("");

    if ("btn_home".equals(data) || "btn_menu".equals(data)) {
      pendingNameUsers.remove(from.get("id").asLong());
      showMainMenu(chatId, messageId, student);
      return;
    }
    if ("btn_setname".equals(data)) {
      pendingNameUsers.add(from.get("id").asLong());
      edit(chatId, messageId,
          "✏️ *Set your name*\n\nSend your display name as the next message.",
          List.of(List.of(btn("🏠 Main menu", "btn_home"))));
      return;
    }
    if ("btn_exams".equals(data)) {
      showExams(chatId, messageId, student);
      return;
    }
    if ("btn_results".equals(data)) {
      showResults(chatId, messageId, student);
      return;
    }
    if ("btn_leaderboard".equals(data)) {
      showLeaderboardPicker(chatId, messageId, student);
      return;
    }
    if (data.startsWith("start_exam_")) {
      startExam(data.substring("start_exam_".length()), student, chatId, messageId);
      return;
    }
    if (data.startsWith("resume_exam_")) {
      resumeExam(data.substring("resume_exam_".length()), student, chatId, messageId);
      return;
    }
    if (data.startsWith("reattempt_")) {
      startExam(data.substring("reattempt_".length()), student, chatId, messageId, true);
      return;
    }
    if (data.startsWith("lb_")) {
      showLeaderboard(data.substring(3), student, chatId, messageId);
      return;
    }
    if (data.startsWith("ans_")) {
      String[] p = data.split("_");
      // ans_EXAM_qIdx_opt
      if (p.length >= 4) {
        String examId = String.join("_", Arrays.copyOfRange(p, 1, p.length - 2));
        int qIdx = Integer.parseInt(p[p.length - 2]);
        int opt = Integer.parseInt(p[p.length - 1]);
        answer(examId, qIdx, opt, student, chatId, messageId);
      }
      return;
    }
    if (data.startsWith("nav_")) {
      String[] p = data.split("_");
      if (p.length >= 3) {
        String examId = String.join("_", Arrays.copyOfRange(p, 1, p.length - 1));
        int qIdx = Integer.parseInt(p[p.length - 1]);
        renderQuestion(examId, qIdx, student, chatId, messageId);
      }
      return;
    }
    if (data.startsWith("grid_")) {
      showGrid(data.substring(5), student, chatId, messageId);
      return;
    }
    if (data.startsWith("confirm_submit_")) {
      confirmSubmit(data.substring("confirm_submit_".length()), student, chatId, messageId);
      return;
    }
    if (data.startsWith("do_submit_")) {
      doSubmit(data.substring("do_submit_".length()), student, chatId, messageId);
      return;
    }
  }

  private void showMainMenu(long chatId, Long messageId, StudentEntity student) {
    String name = student.getName() != null ? student.getName() : "Student";
    String text = "🎓 *Quiz Bot by Pusparghya*\n\n👋 Hello, *" + esc(name) + "*!\n\nChoose an option:";
    List<List<Map<String, String>>> kb = List.of(
        List.of(btn("📚 My Exams", "btn_exams")),
        List.of(btn("📊 My Results", "btn_results")),
        List.of(btn("🏆 Leaderboards", "btn_leaderboard")),
        List.of(btn("✏️ Set your name", "btn_setname"))
    );
    if (messageId != null) edit(chatId, messageId, text, kb);
    else client.sendMessage(chatId, text, Map.of("inline_keyboard", kb));
  }

  private void showExams(long chatId, long messageId, StudentEntity student) {
    // Only exams the student already has attempts for, or LIVE exams linked via teacher
    List<AttemptEntity> myAttempts = attempts.findByTelegramUserId(student.getTelegramUserId());
    Set<String> examIds = myAttempts.stream().map(AttemptEntity::getExamId).collect(Collectors.toSet());
    List<ExamEntity> list = examIds.isEmpty() ? List.of()
        : exams.findAllById(examIds).stream()
            .sorted(Comparator.comparing(ExamEntity::getStartDate).reversed())
            .toList();

    StringBuilder sb = new StringBuilder("📚 *My Exams*\n\n");
    List<List<Map<String, String>>> rows = new ArrayList<>();
    if (list.isEmpty()) {
      sb.append("No exams yet.\nOpen the link your teacher shared to start an exam.");
    } else {
      for (ExamEntity e : list) {
        List<AttemptEntity> atts = attempts.findByExamIdAndTelegramUserIdOrderByAttemptNumberAsc(e.getId(), student.getTelegramUserId());
        AttemptEntity open = atts.stream().filter(a -> a.getStatus() == AttemptStatus.IN_PROGRESS).findFirst().orElse(null);
        boolean done = atts.stream().anyMatch(a -> a.getStatus() == AttemptStatus.SUBMITTED || a.getStatus() == AttemptStatus.AUTO_SUBMITTED);
        if (open != null) {
          rows.add(List.of(btn("▶ Resume · " + trunc(e.getTitle()), "resume_exam_" + e.getId())));
        } else if (done) {
          rows.add(List.of(
              btn("📊 Result · " + trunc(e.getTitle()), "start_exam_" + e.getId()),
              btn("🔁 Reattempt", "reattempt_" + e.getId())));
        } else {
          rows.add(List.of(btn("🚀 Start · " + trunc(e.getTitle()), "start_exam_" + e.getId())));
        }
      }
    }
    rows.add(List.of(btn("📊 My Results", "btn_results")));
    rows.add(List.of(btn("🏠 Main menu", "btn_home")));
    edit(chatId, messageId, sb.toString(), rows);
  }

  private void showResults(long chatId, long messageId, StudentEntity student) {
    List<AttemptEntity> atts = attempts.findByTelegramUserId(student.getTelegramUserId()).stream()
        .filter(a -> a.getStatus() == AttemptStatus.SUBMITTED || a.getStatus() == AttemptStatus.AUTO_SUBMITTED)
        .sorted(Comparator.comparing(AttemptEntity::getSubmittedAt, Comparator.nullsLast(Comparator.reverseOrder())))
        .limit(20)
        .toList();
    StringBuilder sb = new StringBuilder("📊 *My Results*\n\n");
    if (atts.isEmpty()) sb.append("No submitted attempts yet.");
    for (AttemptEntity a : atts) {
      ExamEntity e = exams.findById(a.getExamId()).orElse(null);
      String title = e != null ? e.getTitle() : a.getExamId();
      String kind = a.isOfficial() ? "Official" : "Practice #" + a.getAttemptNumber();
      sb.append("• *").append(esc(title)).append("*\n")
          .append("  ").append(kind).append(" — ")
          .append((int) a.getScore()).append("/").append((int) a.getMaxScore())
          .append(" (").append(a.getPercentage()).append("%)\n");
    }
    edit(chatId, messageId, sb.toString(), List.of(
        List.of(btn("📚 My Exams", "btn_exams")),
        List.of(btn("🏠 Main menu", "btn_home"))));
  }

  private void showLeaderboardPicker(long chatId, long messageId, StudentEntity student) {
    Set<String> examIds = attempts.findByTelegramUserId(student.getTelegramUserId()).stream()
        .map(AttemptEntity::getExamId).collect(Collectors.toSet());
    List<List<Map<String, String>>> rows = new ArrayList<>();
    StringBuilder sb = new StringBuilder("🏆 *Leaderboards*\n\nSelect an exam:");
    if (examIds.isEmpty()) sb.append("\nNo exams yet.");
    for (String id : examIds) {
      exams.findById(id).ifPresent(e -> rows.add(List.of(btn("🏆 " + trunc(e.getTitle()), "lb_" + e.getId()))));
    }
    rows.add(List.of(btn("🏠 Main menu", "btn_home")));
    edit(chatId, messageId, sb.toString(), rows);
  }

  private void showLeaderboard(String examId, StudentEntity student, long chatId, long messageId) {
    ExamEntity exam = exams.findById(examId).orElse(null);
    if (exam == null) {
      edit(chatId, messageId, "Exam not found.", List.of(List.of(btn("🏠 Main menu", "btn_home"))));
      return;
    }
    // Ranking only after exam window ends (same as product rule)
    Instant end = exam.getStartDate().plus(Duration.ofMinutes(exam.getDurationMinutes()));
    if (Instant.now().isBefore(end)) {
      edit(chatId, messageId,
          "🏆 *Leaderboard*\n\nRanking will be available after the exam time ends.\nEnds: " + FMT.format(end),
          List.of(List.of(btn("🏠 Main menu", "btn_home"))));
      return;
    }
    List<AttemptEntity> board = attempts.findByExamIdAndOfficialTrueAndStatusIn(
            examId, List.of(AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED)).stream()
        .sorted(Comparator.comparing(AttemptEntity::getScore).reversed()
            .thenComparing(AttemptEntity::getTimeTakenSeconds))
        .toList();
    StringBuilder sb = new StringBuilder("🏆 *").append(esc(exam.getTitle())).append("*\n\n");
    if (board.isEmpty()) sb.append("No official results yet.");
    int i = 1;
    for (AttemptEntity a : board) {
      if (i > 50) break;
      sb.append(i++).append(". ").append(esc(a.getStudentName() != null ? a.getStudentName() : "Student"))
          .append(" — ").append((int) a.getScore()).append("\n");
    }
    edit(chatId, messageId, sb.toString(), List.of(
        List.of(btn("🏆 Leaderboards", "btn_leaderboard")),
        List.of(btn("🏠 Main menu", "btn_home"))));
  }

  private void startExam(String examId, StudentEntity student, long chatId, Long messageId) {
    startExam(examId, student, chatId, messageId, false);
  }

  private void startExam(String examId, StudentEntity student, long chatId, Long messageId, boolean forcePractice) {
    ExamEntity exam = exams.findById(examId).orElse(null);
    if (exam == null) {
      sendOrEdit(chatId, messageId, "Exam not found.", List.of(List.of(btn("🏠 Main menu", "btn_home"))));
      return;
    }
    Instant now = Instant.now();
    Instant start = exam.getStartDate();
    Instant end = start.plus(Duration.ofMinutes(exam.getDurationMinutes()));

    if (now.isBefore(start)) {
      sendOrEdit(chatId, messageId,
          "⏳ *Exam not started yet*\n\n*" + esc(exam.getTitle()) + "*\nStarts: " + FMT.format(start),
          List.of(List.of(btn("🔄 Check again", "start_exam_" + examId)), List.of(btn("🏠 Main menu", "btn_home"))));
      return;
    }

    List<AttemptEntity> prior = attempts.findByExamIdAndTelegramUserIdOrderByAttemptNumberAsc(examId, student.getTelegramUserId());
    AttemptEntity open = prior.stream().filter(a -> a.getStatus() == AttemptStatus.IN_PROGRESS).findFirst().orElse(null);
    if (open != null) {
      renderQuestion(examId, open.getCurrentQuestionIndex(), student, chatId, messageId);
      return;
    }

    boolean windowOpen = !now.isAfter(end);
    boolean official = windowOpen && !forcePractice
        && prior.stream().noneMatch(a -> a.isOfficial()
        && (a.getStatus() == AttemptStatus.SUBMITTED || a.getStatus() == AttemptStatus.AUTO_SUBMITTED));

    if (!windowOpen && !forcePractice && prior.isEmpty()) {
      // first time after window → practice only
      official = false;
    }

    int nextNum = prior.stream().mapToInt(AttemptEntity::getAttemptNumber).max().orElse(0) + 1;
    AttemptEntity att = new AttemptEntity();
    att.setId(Ids.attempt());
    att.setExamId(examId);
    att.setStudentId(student.getStudentCode());
    att.setTelegramUserId(student.getTelegramUserId());
    att.setStudentName(student.getName());
    att.setStudentClass(student.getClassName());
    att.setStartedAt(now);
    att.setExpiresAt(windowOpen ? end : now.plus(Duration.ofMinutes(exam.getDurationMinutes())));
    att.setStatus(AttemptStatus.IN_PROGRESS);
    att.setAnswers(new HashMap<>());
    att.setCurrentQuestionIndex(0);
    att.setMaxScore(exam.getTotalMarks());
    att.setOfficial(official);
    att.setAttemptNumber(nextNum);
    attempts.save(att);

    // link student to teacher
    if (student.getTeacherIds() == null) student.setTeacherIds(new ArrayList<>());
    if (!student.getTeacherIds().contains(exam.getTeacherId())) {
      student.getTeacherIds().add(exam.getTeacherId());
      students.save(student);
    }

    String intro = "📝 *" + esc(exam.getTitle()) + "*\n"
        + (official ? "Mode: *Official exam*\n" : "Mode: *Practice*\n")
        + "Questions: " + exam.getTotalQuestions() + "\n"
        + "Duration: " + exam.getDurationMinutes() + " min\n\n"
        + "Good luck!";
    sendOrEdit(chatId, messageId, intro, List.of(
        List.of(btn("▶ Continue to questions", "resume_exam_" + examId)),
        List.of(btn("🏠 Main menu", "btn_home"))));
  }

  private void resumeExam(String examId, StudentEntity student, long chatId, long messageId) {
    List<AttemptEntity> prior = attempts.findByExamIdAndTelegramUserIdOrderByAttemptNumberAsc(examId, student.getTelegramUserId());
    AttemptEntity open = prior.stream().filter(a -> a.getStatus() == AttemptStatus.IN_PROGRESS).findFirst().orElse(null);
    if (open == null) {
      startExam(examId, student, chatId, messageId);
      return;
    }
    if (Instant.now().isAfter(open.getExpiresAt())) {
      doSubmit(examId, student, chatId, messageId);
      return;
    }
    renderQuestion(examId, open.getCurrentQuestionIndex(), student, chatId, messageId);
  }

  private void renderQuestion(String examId, int qIdx, StudentEntity student, long chatId, Long messageId) {
    ExamEntity exam = exams.findById(examId).orElse(null);
    if (exam == null) return;
    List<QuestionEntity> qs = questions.findByExamIdOrderBySortOrderAsc(examId);
    if (qs.isEmpty()) {
      sendOrEdit(chatId, messageId, "No questions in this exam.", List.of(List.of(btn("🏠 Main menu", "btn_home"))));
      return;
    }
    if (qIdx < 0) qIdx = 0;
    if (qIdx >= qs.size()) qIdx = qs.size() - 1;
    QuestionEntity q = qs.get(qIdx);
    List<AttemptEntity> prior = attempts.findByExamIdAndTelegramUserIdOrderByAttemptNumberAsc(examId, student.getTelegramUserId());
    AttemptEntity open = prior.stream().filter(a -> a.getStatus() == AttemptStatus.IN_PROGRESS).findFirst().orElse(null);
    Integer chosen = open != null ? open.getAnswers().get(q.getId()) : null;

    StringBuilder text = new StringBuilder();
    text.append("📝 *").append(esc(exam.getTitle())).append("*\n");
    text.append("Question ").append(qIdx + 1).append("/").append(qs.size()).append("\n\n");
    text.append("*").append(esc(q.getQuestion())).append("*\n\n");
    List<String> opts = q.getOptions() != null ? q.getOptions() : List.of();
    for (int i = 0; i < opts.size(); i++) {
      String mark = (chosen != null && chosen == i) ? "✅ " : "";
      text.append(mark).append(LABELS[Math.min(i, LABELS.length - 1)]).append(") ")
          .append(esc(opts.get(i))).append("\n");
    }
    if (open != null) {
      text.append("\n⏱ Remaining: ").append(remaining(open.getExpiresAt()));
    }

    List<List<Map<String, String>>> rows = new ArrayList<>();
    for (int i = 0; i < opts.size(); i++) {
      String label = LABELS[Math.min(i, LABELS.length - 1)] + " · " + trunc(opts.get(i), 28);
      rows.add(List.of(btn(label, "ans_" + examId + "_" + qIdx + "_" + i)));
    }
    List<Map<String, String>> nav = new ArrayList<>();
    if (qIdx > 0) nav.add(btn("◀ Previous", "nav_" + examId + "_" + (qIdx - 1)));
    if (qIdx < qs.size() - 1) nav.add(btn("Next ▶", "nav_" + examId + "_" + (qIdx + 1)));
    if (!nav.isEmpty()) rows.add(nav);
    rows.add(List.of(btn("📋 Question Grid", "grid_" + examId), btn("✅ Submit Exam", "confirm_submit_" + examId)));
    rows.add(List.of(btn("🏠 Main menu", "btn_home")));
    sendOrEdit(chatId, messageId, text.toString(), rows);
  }

  private void answer(String examId, int qIdx, int option, StudentEntity student, long chatId, long messageId) {
    List<AttemptEntity> prior = attempts.findByExamIdAndTelegramUserIdOrderByAttemptNumberAsc(examId, student.getTelegramUserId());
    AttemptEntity att = prior.stream().filter(a -> a.getStatus() == AttemptStatus.IN_PROGRESS).findFirst().orElse(null);
    if (att == null) return;
    if (Instant.now().isAfter(att.getExpiresAt())) {
      doSubmit(examId, student, chatId, messageId);
      return;
    }
    List<QuestionEntity> qs = questions.findByExamIdOrderBySortOrderAsc(examId);
    if (qIdx < 0 || qIdx >= qs.size()) return;
    Map<String, Integer> answers = new HashMap<>(att.getAnswers() != null ? att.getAnswers() : Map.of());
    answers.put(qs.get(qIdx).getId(), option);
    att.setAnswers(answers);
    int next = Math.min(qIdx + 1, qs.size() - 1);
    att.setCurrentQuestionIndex(next);
    attempts.save(att);
    renderQuestion(examId, next, student, chatId, messageId);
  }

  private void showGrid(String examId, StudentEntity student, long chatId, long messageId) {
    List<QuestionEntity> qs = questions.findByExamIdOrderBySortOrderAsc(examId);
    List<AttemptEntity> prior = attempts.findByExamIdAndTelegramUserIdOrderByAttemptNumberAsc(examId, student.getTelegramUserId());
    AttemptEntity att = prior.stream().filter(a -> a.getStatus() == AttemptStatus.IN_PROGRESS).findFirst().orElse(null);
    Map<String, Integer> answers = att != null && att.getAnswers() != null ? att.getAnswers() : Map.of();
    List<List<Map<String, String>>> rows = new ArrayList<>();
    List<Map<String, String>> row = new ArrayList<>();
    for (int i = 0; i < qs.size(); i++) {
      boolean answered = answers.containsKey(qs.get(i).getId());
      row.add(btn((answered ? "✅" : "▫️") + (i + 1), "nav_" + examId + "_" + i));
      if (row.size() == 5) {
        rows.add(row);
        row = new ArrayList<>();
      }
    }
    if (!row.isEmpty()) rows.add(row);
    rows.add(List.of(btn("✅ Submit Exam", "confirm_submit_" + examId)));
    rows.add(List.of(btn("🏠 Main menu", "btn_home")));
    edit(chatId, messageId, "📋 *Question Grid*\nTap a number to jump.", rows);
  }

  private void confirmSubmit(String examId, StudentEntity student, long chatId, long messageId) {
    edit(chatId, messageId, "Submit this exam now?", List.of(
        List.of(btn("✅ Yes, submit", "do_submit_" + examId)),
        List.of(btn("◀ Back", "resume_exam_" + examId)),
        List.of(btn("🏠 Main menu", "btn_home"))));
  }

  private void doSubmit(String examId, StudentEntity student, long chatId, long messageId) {
    List<AttemptEntity> prior = attempts.findByExamIdAndTelegramUserIdOrderByAttemptNumberAsc(examId, student.getTelegramUserId());
    AttemptEntity att = prior.stream().filter(a -> a.getStatus() == AttemptStatus.IN_PROGRESS).findFirst().orElse(null);
    ExamEntity exam = exams.findById(examId).orElse(null);
    if (att == null || exam == null) {
      edit(chatId, messageId, "Nothing to submit.", List.of(List.of(btn("🏠 Main menu", "btn_home"))));
      return;
    }
    List<QuestionEntity> qs = questions.findByExamIdOrderBySortOrderAsc(examId);
    int secs = (int) Math.max(0, Instant.now().getEpochSecond() - att.getStartedAt().getEpochSecond());
    var r = scoring.score(qs, att.getAnswers() != null ? att.getAnswers() : Map.of(),
        exam.getNegativeMarking(), exam.getTotalMarks(), secs);
    att.setScore(r.score());
    att.setMaxScore(r.maxScore());
    att.setPercentage(r.percentage());
    att.setCorrectCount(r.correct());
    att.setWrongCount(r.wrong());
    att.setSkippedCount(r.skipped());
    att.setTimeTakenSeconds(secs);
    att.setSubmittedAt(Instant.now());
    att.setStatus(Instant.now().isAfter(att.getExpiresAt()) ? AttemptStatus.AUTO_SUBMITTED : AttemptStatus.SUBMITTED);
    attempts.save(att);
    ranking.recalculate(examId);
    String text = "✅ *Submitted*\n\n*" + esc(exam.getTitle()) + "*\n"
        + "⭐ " + (int) att.getScore() + "/" + (int) att.getMaxScore()
        + " (" + att.getPercentage() + "%)\n"
        + (att.isOfficial() ? "Official attempt" : "Practice attempt #" + att.getAttemptNumber());
    edit(chatId, messageId, text, List.of(
        List.of(btn("📊 My Results", "btn_results")),
        List.of(btn("🏠 Main menu", "btn_home"))));
  }

  private StudentEntity getOrCreate(JsonNode from) {
    long id = from.get("id").asLong();
    return students.findByTelegramUserId(id).orElseGet(() -> {
      StudentEntity s = new StudentEntity();
      s.setId("STU_" + id);
      s.setStudentCode("S" + (id % 1000000));
      String name = from.has("first_name") ? from.get("first_name").asText("Student") : "Student";
      if (from.has("last_name")) name = name + " " + from.get("last_name").asText("");
      s.setName(name.trim());
      s.setTelegramUserId(id);
      if (from.has("username")) s.setTelegramUsername("@" + from.get("username").asText());
      s.setStatus("linked");
      s.setLinkedAt(Instant.now());
      s.setTeacherIds(new ArrayList<>());
      s.setLinkCode(s.getStudentCode());
      return students.save(s);
    });
  }

  private Map<String, Object> mainMenuKb() {
    return Map.of("inline_keyboard", List.of(
        List.of(btn("📚 My Exams", "btn_exams")),
        List.of(btn("📊 My Results", "btn_results")),
        List.of(btn("🏆 Leaderboards", "btn_leaderboard")),
        List.of(btn("✏️ Set your name", "btn_setname"))
    ));
  }

  private static Map<String, String> btn(String text, String data) {
    return Map.of("text", text, "callback_data", data);
  }

  private void edit(long chatId, long messageId, String text, List<List<Map<String, String>>> rows) {
    client.editMessageText(chatId, messageId, text, Map.of("inline_keyboard", rows));
  }

  private void sendOrEdit(long chatId, Long messageId, String text, List<List<Map<String, String>>> rows) {
    if (messageId != null) edit(chatId, messageId, text, rows);
    else client.sendMessage(chatId, text, Map.of("inline_keyboard", rows));
  }

  private static String esc(String s) {
    return MarkdownEscaper.escape(s == null ? "" : s);
  }

  private static String trunc(String s) {
    return trunc(s, 32);
  }

  private static String trunc(String s, int n) {
    if (s == null) return "";
    return s.length() <= n ? s : s.substring(0, n - 1) + "…";
  }

  private static String remaining(Instant expires) {
    long sec = Math.max(0, expires.getEpochSecond() - Instant.now().getEpochSecond());
    long m = sec / 60;
    long s = sec % 60;
    return m + "m " + s + "s";
  }
}
