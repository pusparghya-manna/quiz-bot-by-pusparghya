package com.pusparghya.quizbot.telegram;

import com.fasterxml.jackson.databind.JsonNode;
import com.pusparghya.quizbot.common.Ids;
import com.pusparghya.quizbot.common.MarkdownEscaper;
import com.pusparghya.quizbot.exam.ExamEntity;
import com.pusparghya.quizbot.exam.ExamRepository;
import com.pusparghya.quizbot.exam.ExamStatus;
import com.pusparghya.quizbot.exam.VisibilityStatus;
import com.pusparghya.quizbot.question.QuestionEntity;
import com.pusparghya.quizbot.question.QuestionRepository;
import com.pusparghya.quizbot.result.RankingService;
import com.pusparghya.quizbot.settings.SystemSettingsService;
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
 * Telegram UX copied from main-branch bot.ts — same menus, labels, and wording.
 */
@Service
public class TelegramUpdateService {
  private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

  private final TelegramClient client;
  private final StudentRepository students;
  private final ExamRepository exams;
  private final QuestionRepository questions;
  private final AttemptRepository attempts;
  private final ScoringService scoring;
  private final RankingService ranking;
  private final SystemSettingsService settings;
  private final Set<Long> pendingNameUsers = ConcurrentHashMap.newKeySet();

  public TelegramUpdateService(TelegramClient client, StudentRepository students, ExamRepository exams,
                               QuestionRepository questions, AttemptRepository attempts,
                               ScoringService scoring, RankingService ranking,
                               SystemSettingsService settings) {
    this.client = client;
    this.students = students;
    this.exams = exams;
    this.questions = questions;
    this.attempts = attempts;
    this.scoring = scoring;
    this.ranking = ranking;
    this.settings = settings;
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
        client.sendMessage(chatId,
            "Please send a name between 2 and 60 characters.",
            Map.of("inline_keyboard", List.of(List.of(btn("🏠 Main menu", "btn_home")))));
        return;
      }
      student.setName(name);
      students.save(student);
      pendingNameUsers.remove(userId);
      client.sendMessage(chatId, "✅ Name updated to *" + esc(name) + "*.", mainMenuKb());
      return;
    }

    if (text.startsWith("/start")) {
      pendingNameUsers.remove(userId);
      String payload = text.length() > 7 ? text.substring(7).trim() : "";
      if (payload.startsWith("exam_")) {
        handleStartOrResume(payload.substring(5), student, chatId, null, false);
        return;
      }
      renderMainMenu(chatId, null, student);
      return;
    }
    renderMainMenu(chatId, null, student);
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
      renderMainMenu(chatId, messageId, student);
      return;
    }
    if ("btn_setname".equals(data)) {
      pendingNameUsers.add(from.get("id").asLong());
      edit(chatId, messageId,
          "✏️ *Set your name*\n\nPlease *type your full name* and send it as a message.\n\nThis name will appear on results and the leaderboard.",
          List.of(List.of(btn("🏠 Main menu", "btn_home"))));
      return;
    }
    if ("btn_exams".equals(data)) {
      renderExamsList(chatId, messageId, student);
      return;
    }
    if ("btn_results".equals(data)) {
      renderStudentResults(chatId, messageId, student);
      return;
    }
    if ("btn_leaderboard".equals(data)) {
      renderStudentLeaderboard(chatId, messageId, student, false);
      return;
    }
    if ("leaderboard_more".equals(data)) {
      renderStudentLeaderboard(chatId, messageId, student, true);
      return;
    }
    if (data.startsWith("start_exam_") || data.startsWith("resume_exam_")) {
      String examId = data.replace("start_exam_", "").replace("resume_exam_", "");
      handleStartOrResume(examId, student, chatId, messageId, false);
      return;
    }
    if (data.startsWith("reattempt_")) {
      handleStartOrResume(data.substring("reattempt_".length()), student, chatId, messageId, true);
      return;
    }
    if (data.startsWith("ans_")) {
      // ans_{examId}_{qIdx}_{opt} — examId may contain underscores
      String rest = data.substring(4);
      int last = rest.lastIndexOf('_');
      int prev = rest.lastIndexOf('_', last - 1);
      if (last > 0 && prev > 0) {
        String examId = rest.substring(0, prev);
        int qIdx = Integer.parseInt(rest.substring(prev + 1, last));
        int opt = Integer.parseInt(rest.substring(last + 1));
        handleOptionSelect(examId, qIdx, opt, student, chatId, messageId);
      }
      return;
    }
    if (data.startsWith("nav_")) {
      String rest = data.substring(4);
      int last = rest.lastIndexOf('_');
      if (last > 0) {
        String examId = rest.substring(0, last);
        int qIdx = Integer.parseInt(rest.substring(last + 1));
        renderQuestionView(examId, qIdx, student, chatId, messageId);
      }
      return;
    }
    if (data.startsWith("grid_")) {
      renderQuestionGrid(data.substring(5), student, chatId, messageId);
      return;
    }
    if (data.startsWith("confirm_submit_")) {
      renderSubmitConfirmation(data.substring("confirm_submit_".length()), student, chatId, messageId);
      return;
    }
    if (data.startsWith("do_submit_")) {
      handleFinalSubmit(data.substring("do_submit_".length()), student, chatId, messageId);
      return;
    }
  }

  private void renderMainMenu(long chatId, Long messageId, StudentEntity student) {
    String notice = settings.get().getSystemNotice();
    StringBuilder text = new StringBuilder();
    text.append("👋 *Welcome to Quiz Bot by Pusparghya!*\n\n");
    if (notice != null && !notice.isBlank()) {
      text.append("📢 ").append(notice).append("\n\n");
    }
    text.append("You are registered as *").append(esc(student.getName())).append("*.\n\n");
    text.append("Teachers share a special link for each exam. Open that link to start.");
    List<List<Map<String, String>>> kb = List.of(
        List.of(btn("📚 My Exams", "btn_exams")),
        List.of(btn("📊 My Results", "btn_results")),
        List.of(btn("🏆 Leaderboards", "btn_leaderboard")),
        List.of(btn("✏️ Set your name", "btn_setname"))
    );
    sendOrEdit(chatId, messageId, text.toString(), kb);
  }

  private void renderExamsList(long chatId, long messageId, StudentEntity student) {
    Instant now = Instant.now();
    List<AttemptEntity> myAttempts = attempts.findByTelegramUserId(student.getTelegramUserId());
    Set<String> examIds = myAttempts.stream().map(AttemptEntity::getExamId).collect(Collectors.toCollection(LinkedHashSet::new));
    List<ExamEntity> examList = examIds.isEmpty() ? List.of()
        : exams.findAllById(examIds).stream()
            .sorted(Comparator.comparing(ExamEntity::getStartDate).reversed())
            .toList();

    if (examList.isEmpty()) {
      edit(chatId, messageId,
          "📚 *My Exams*\n\nYou have no exams yet.\n\nAsk your teacher for the *exam link*. Opening that link starts the exam.",
          List.of(
              List.of(btn("📊 My Results", "btn_results")),
              List.of(btn("🏆 Leaderboards", "btn_leaderboard")),
              List.of(btn("🏠 Main menu", "btn_home"))
          ));
      return;
    }

    StringBuilder text = new StringBuilder("📚 *My Exams*\n\n");
    List<List<Map<String, String>>> keyboard = new ArrayList<>();
    int idx = 0;
    for (ExamEntity exam : examList) {
      idx++;
      Instant startDate = exam.getStartDate();
      boolean isLocked = now.isBefore(startDate);
      List<AttemptEntity> atts = attempts.findByExamIdAndTelegramUserIdOrderByAttemptNumberAsc(exam.getId(), student.getTelegramUserId());
      AttemptEntity active = atts.stream().filter(a -> a.getStatus() == AttemptStatus.IN_PROGRESS).findFirst().orElse(null);
      AttemptEntity officialDone = atts.stream()
          .filter(a -> a.isOfficial() && (a.getStatus() == AttemptStatus.SUBMITTED || a.getStatus() == AttemptStatus.AUTO_SUBMITTED))
          .findFirst().orElse(null);
      boolean anyDone = atts.stream().anyMatch(a -> a.getStatus() == AttemptStatus.SUBMITTED || a.getStatus() == AttemptStatus.AUTO_SUBMITTED);

      text.append("*").append(idx).append(". ").append(esc(exam.getTitle())).append("*\n");
      text.append("   ").append(exam.getSubject() != null ? exam.getSubject() : "").append(" · ")
          .append(exam.getTotalQuestions()).append(" Qs · ").append(exam.getDurationMinutes()).append(" min\n");

      if (isLocked) {
        text.append("   🔒 Locked until ").append(formatInIST(startDate)).append("\n\n");
        keyboard.add(List.of(btn("🔒 " + exam.getTitle(), "start_exam_" + exam.getId())));
      } else if (active != null) {
        text.append("   ⚡ In progress (").append(formatRemaining(active.getExpiresAt())).append(" left)\n\n");
        keyboard.add(List.of(btn("▶ Resume · " + exam.getTitle(), "resume_exam_" + exam.getId())));
      } else if (anyDone) {
        String score = officialDone != null ? ((int) officialDone.getScore() + "/" + (int) officialDone.getMaxScore()) : "done";
        text.append("   ✅ Attempted (").append(score).append(") — you can reattempt for practice\n\n");
        keyboard.add(List.of(
            btn("📊 Result · " + exam.getTitle(), "start_exam_" + exam.getId()),
            btn("🔁 Reattempt", "reattempt_" + exam.getId())));
      } else {
        text.append("   🟢 Ready to start\n\n");
        keyboard.add(List.of(btn("🚀 Start · " + exam.getTitle(), "start_exam_" + exam.getId())));
      }
    }
    keyboard.add(List.of(btn("📊 My Results", "btn_results")));
    keyboard.add(List.of(btn("🏠 Main menu", "btn_home")));
    edit(chatId, messageId, text.toString(), keyboard);
  }

  private void handleStartOrResume(String examId, StudentEntity student, long chatId, Long messageId, boolean forceNew) {
    Instant now = Instant.now();
    ExamEntity exam = exams.findById(examId).orElse(null);
    if (exam == null) {
      sendOrEdit(chatId, messageId, "❌ *Exam not found*\n\nAsk your teacher for a valid exam link.",
          List.of(List.of(btn("🏠 Main menu", "btn_home"))));
      return;
    }
    if (exam.getStatus() == ExamStatus.DRAFT) {
      sendOrEdit(chatId, messageId, "🔒 This exam is not open yet.",
          List.of(List.of(btn("🏠 Main menu", "btn_home"))));
      return;
    }
    if (exam.getTeacherId() == null || exam.getTeacherId().isBlank()) {
      sendOrEdit(chatId, messageId, "❌ This exam is not available.",
          List.of(List.of(btn("🏠 Main menu", "btn_home"))));
      return;
    }

    Instant startDate = exam.getStartDate();
    if (now.isBefore(startDate)) {
      sendOrEdit(chatId, messageId,
          "🔒 *Exam locked until start time*\n\n📝 *" + esc(exam.getTitle()) + "*\n📅 Starts: " + formatInIST(startDate),
          List.of(
              List.of(btn("🔄 Check again", "start_exam_" + exam.getId())),
              List.of(btn("🏠 Main menu", "btn_home"))));
      return;
    }

    linkStudentToTeacher(student, exam.getTeacherId());

    List<AttemptEntity> allMine = attempts.findByExamIdAndTelegramUserIdOrderByAttemptNumberAsc(examId, student.getTelegramUserId());
    AttemptEntity open = allMine.stream().filter(a -> a.getStatus() == AttemptStatus.IN_PROGRESS).findFirst().orElse(null);
    AttemptEntity latestDone = allMine.stream()
        .filter(a -> a.getStatus() == AttemptStatus.SUBMITTED || a.getStatus() == AttemptStatus.AUTO_SUBMITTED)
        .reduce((a, b) -> b).orElse(null);
    boolean officialExists = allMine.stream()
        .anyMatch(a -> a.isOfficial() && (a.getStatus() == AttemptStatus.SUBMITTED || a.getStatus() == AttemptStatus.AUTO_SUBMITTED));

    if (!forceNew && latestDone != null && open == null) {
      renderAttemptSummary(exam, latestDone, chatId, messageId);
      return;
    }
    if (!forceNew && open != null) {
      if (now.isAfter(open.getExpiresAt())) {
        autoSubmitExam(exam, open, student, chatId, messageId);
        return;
      }
      renderQuestionView(examId, open.getCurrentQuestionIndex(), student, chatId, messageId);
      return;
    }

    Instant end = startDate.plus(Duration.ofMinutes(exam.getDurationMinutes()));
    boolean windowOpen = !now.isAfter(end);
    boolean isOfficial = windowOpen && !officialExists;
    int attemptNumber = allMine.size() + 1;

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
    att.setOfficial(isOfficial);
    att.setAttemptNumber(attemptNumber);
    attempts.save(att);

    // Jump straight into questions (same as resume path after start on main)
    renderQuestionView(examId, 0, student, chatId, messageId);
  }

  private void handleOptionSelect(String examId, int qIdx, int optIdx, StudentEntity student, long chatId, long messageId) {
    Instant now = Instant.now();
    ExamEntity exam = exams.findById(examId).orElse(null);
    if (exam == null) {
      edit(chatId, messageId, "❌ Examination not found. Please type /exams to see available tests.",
          List.of(List.of(btn("🏠 Main menu", "btn_home"))));
      return;
    }
    List<AttemptEntity> allMine = attempts.findByExamIdAndTelegramUserIdOrderByAttemptNumberAsc(examId, student.getTelegramUserId());
    AttemptEntity attempt = allMine.stream().filter(a -> a.getStatus() == AttemptStatus.IN_PROGRESS).findFirst().orElse(null);
    if (attempt == null) {
      handleStartOrResume(examId, student, chatId, messageId, false);
      return;
    }
    if (now.isAfter(attempt.getExpiresAt())) {
      autoSubmitExam(exam, attempt, student, chatId, messageId);
      return;
    }
    if (attempt.getStatus() != AttemptStatus.IN_PROGRESS) {
      renderAttemptSummary(exam, attempt, chatId, messageId);
      return;
    }
    List<QuestionEntity> qs = questions.findByExamIdOrderBySortOrderAsc(examId);
    if (qIdx < 0 || qIdx >= qs.size()) return;
    Map<String, Integer> answers = new HashMap<>(attempt.getAnswers() != null ? attempt.getAnswers() : Map.of());
    answers.put(qs.get(qIdx).getId(), optIdx);
    attempt.setAnswers(answers);
    attempt.setCurrentQuestionIndex(qIdx);
    attempts.save(attempt);
    // Stay on same question (main branch behavior after selecting option)
    renderQuestionView(examId, qIdx, student, chatId, messageId);
  }

  private void renderQuestionView(String examId, int qIdx, StudentEntity student, long chatId, Long messageId) {
    Instant now = Instant.now();
    ExamEntity exam = exams.findById(examId).orElse(null);
    if (exam == null) {
      sendOrEdit(chatId, messageId, "❌ Examination not found. Please type /exams to see available tests.",
          List.of(List.of(btn("🏠 Main menu", "btn_home"))));
      return;
    }
    linkStudentToTeacher(student, exam.getTeacherId());
    List<AttemptEntity> allMine = attempts.findByExamIdAndTelegramUserIdOrderByAttemptNumberAsc(examId, student.getTelegramUserId());
    AttemptEntity attempt = allMine.stream().filter(a -> a.getStatus() == AttemptStatus.IN_PROGRESS).findFirst().orElse(null);
    if (attempt == null) {
      handleStartOrResume(examId, student, chatId, messageId, false);
      return;
    }
    if (now.isAfter(attempt.getExpiresAt())) {
      autoSubmitExam(exam, attempt, student, chatId, messageId);
      return;
    }

    List<QuestionEntity> qs = questions.findByExamIdOrderBySortOrderAsc(examId);
    if (qs.isEmpty()) {
      sendOrEdit(chatId, messageId, "❌ No questions in this exam.", List.of(List.of(btn("🏠 Main menu", "btn_home"))));
      return;
    }
    if (qIdx < 0) qIdx = 0;
    if (qIdx >= qs.size()) qIdx = qs.size() - 1;
    attempt.setCurrentQuestionIndex(qIdx);
    attempts.save(attempt);

    QuestionEntity question = qs.get(qIdx);
    Integer selectedOpt = attempt.getAnswers() != null ? attempt.getAnswers().get(question.getId()) : null;
    String remaining = formatRemaining(attempt.getExpiresAt());
    int total = qs.size();

    StringBuilder text = new StringBuilder();
    text.append("📝 *").append(esc(exam.getTitle())).append("*\n");
    text.append("⏱️ *").append(remaining).append(" remaining* | Question ").append(qIdx + 1).append("/").append(total).append("\n\n");
    text.append(question.getQuestion()).append("\n\n");

    List<String> opts = question.getOptions() != null ? question.getOptions() : List.of();
    if (selectedOpt != null && selectedOpt >= 0 && selectedOpt < opts.size()) {
      text.append("*Your Selected Answer:* Option ")
          .append((char) ('A' + selectedOpt)).append(": ")
          .append(esc(opts.get(selectedOpt))).append("\n");
    } else {
      text.append("*Status:* ⚪ Unanswered\n");
    }

    List<List<Map<String, String>>> keyboard = new ArrayList<>();
    for (int oIdx = 0; oIdx < opts.size(); oIdx++) {
      boolean isSelected = selectedOpt != null && selectedOpt == oIdx;
      String prefix = isSelected ? "🔘 " : "⚪ ";
      String label = prefix + (char) ('A' + oIdx) + ". " + opts.get(oIdx);
      // Telegram button text max ~64 chars
      if (label.length() > 64) label = label.substring(0, 61) + "...";
      keyboard.add(List.of(btn(label, "ans_" + exam.getId() + "_" + qIdx + "_" + oIdx)));
    }

    List<Map<String, String>> navRow = new ArrayList<>();
    if (qIdx > 0) {
      navRow.add(btn("◀ Previous", "nav_" + exam.getId() + "_" + (qIdx - 1)));
    }
    if (qIdx < total - 1) {
      navRow.add(btn("Next ▶", "nav_" + exam.getId() + "_" + (qIdx + 1)));
    }
    if (!navRow.isEmpty()) keyboard.add(navRow);

    keyboard.add(List.of(
        btn("📋 Question Grid", "grid_" + exam.getId()),
        btn("✅ Submit Exam", "confirm_submit_" + exam.getId())));
    keyboard.add(List.of(btn("🏠 Main menu", "btn_home")));

    sendOrEdit(chatId, messageId, text.toString(), keyboard);
  }

  private void renderQuestionGrid(String examId, StudentEntity student, long chatId, long messageId) {
    ExamEntity exam = exams.findById(examId).orElse(null);
    if (exam == null) {
      edit(chatId, messageId, "❌ Examination not found.", List.of(List.of(btn("🏠 Main menu", "btn_home"))));
      return;
    }
    linkStudentToTeacher(student, exam.getTeacherId());
    List<AttemptEntity> allMine = attempts.findByExamIdAndTelegramUserIdOrderByAttemptNumberAsc(examId, student.getTelegramUserId());
    AttemptEntity attempt = allMine.stream().filter(a -> a.getStatus() == AttemptStatus.IN_PROGRESS).findFirst().orElse(null);
    if (attempt == null) {
      handleStartOrResume(examId, student, chatId, messageId, false);
      return;
    }
    List<QuestionEntity> qs = questions.findByExamIdOrderBySortOrderAsc(examId);
    int answeredCount = attempt.getAnswers() != null ? attempt.getAnswers().size() : 0;
    int total = qs.size();
    String remaining = formatRemaining(attempt.getExpiresAt());

    StringBuilder text = new StringBuilder();
    text.append("📋 *Question Review Grid*\n");
    text.append("📝 *").append(esc(exam.getTitle())).append("*\n");
    text.append("⏱️ Time Remaining: *").append(remaining).append("*\n");
    text.append("🟢 Answered: ").append(answeredCount).append("/").append(total)
        .append(" | ⚪ Unanswered: ").append(total - answeredCount).append("\n\n");
    text.append("Tap any question number below to jump directly to it:");

    List<List<Map<String, String>>> keyboard = new ArrayList<>();
    List<Map<String, String>> currentRow = new ArrayList<>();
    Map<String, Integer> answers = attempt.getAnswers() != null ? attempt.getAnswers() : Map.of();
    for (int idx = 0; idx < total; idx++) {
      boolean isAnswered = answers.containsKey(qs.get(idx).getId());
      boolean isCurrent = attempt.getCurrentQuestionIndex() == idx;
      String label = isAnswered ? "🟢 Q" + (idx + 1) : "⚪ Q" + (idx + 1);
      if (isCurrent) label = "👉 " + label;
      currentRow.add(btn(label, "nav_" + exam.getId() + "_" + idx));
      if (currentRow.size() == 4 || idx == total - 1) {
        keyboard.add(currentRow);
        currentRow = new ArrayList<>();
      }
    }
    keyboard.add(List.of(
        btn("🔙 Back to question", "nav_" + exam.getId() + "_" + attempt.getCurrentQuestionIndex()),
        btn("✅ Submit Exam", "confirm_submit_" + exam.getId())));
    keyboard.add(List.of(btn("🏠 Main menu", "btn_home")));
    edit(chatId, messageId, text.toString(), keyboard);
  }

  private void renderSubmitConfirmation(String examId, StudentEntity student, long chatId, long messageId) {
    ExamEntity exam = exams.findById(examId).orElse(null);
    List<AttemptEntity> allMine = attempts.findByExamIdAndTelegramUserIdOrderByAttemptNumberAsc(examId, student.getTelegramUserId());
    AttemptEntity attempt = allMine.stream().filter(a -> a.getStatus() == AttemptStatus.IN_PROGRESS).findFirst().orElse(null);
    if (exam == null || attempt == null) {
      edit(chatId, messageId, "❌ Exam session missing.", List.of(List.of(btn("🏠 Main menu", "btn_home"))));
      return;
    }
    List<QuestionEntity> qs = questions.findByExamIdOrderBySortOrderAsc(examId);
    int answered = attempt.getAnswers() != null ? attempt.getAnswers().size() : 0;
    int total = qs.size();
    String text = "⚠️ *Submit exam?*\n\n📝 *" + esc(exam.getTitle()) + "*\n"
        + "Answered: *" + answered + "/" + total + "*\n"
        + "Unanswered: *" + (total - answered) + "*\n\n"
        + "You cannot change answers after submit.";
    edit(chatId, messageId, text, List.of(
        List.of(btn("✅ Yes, submit now", "do_submit_" + exam.getId())),
        List.of(btn("🔙 Back to question", "nav_" + exam.getId() + "_" + attempt.getCurrentQuestionIndex())),
        List.of(btn("🏠 Main menu", "btn_home"))));
  }

  private void handleFinalSubmit(String examId, StudentEntity student, long chatId, long messageId) {
    ExamEntity exam = exams.findById(examId).orElse(null);
    List<AttemptEntity> allMine = attempts.findByExamIdAndTelegramUserIdOrderByAttemptNumberAsc(examId, student.getTelegramUserId());
    AttemptEntity attempt = allMine.stream().filter(a -> a.getStatus() == AttemptStatus.IN_PROGRESS).findFirst().orElse(null);
    if (exam == null || attempt == null) {
      edit(chatId, messageId, "❌ Exam session missing.", List.of(List.of(btn("🏠 Main menu", "btn_home"))));
      return;
    }
    if (attempt.getStatus() == AttemptStatus.SUBMITTED || attempt.getStatus() == AttemptStatus.AUTO_SUBMITTED) {
      renderAttemptSummary(exam, attempt, chatId, messageId);
      return;
    }
    finalizeAttempt(exam, attempt, AttemptStatus.SUBMITTED);
    renderAttemptSummary(exam, attempt, chatId, messageId);
  }

  private void autoSubmitExam(ExamEntity exam, AttemptEntity attempt, StudentEntity student, long chatId, Long messageId) {
    finalizeAttempt(exam, attempt, AttemptStatus.AUTO_SUBMITTED);
    renderAttemptSummary(exam, attempt, chatId, messageId);
  }

  private void finalizeAttempt(ExamEntity exam, AttemptEntity attempt, AttemptStatus status) {
    List<QuestionEntity> qs = questions.findByExamIdOrderBySortOrderAsc(exam.getId());
    int secs = (int) Math.max(1, Instant.now().getEpochSecond() - attempt.getStartedAt().getEpochSecond());
    if (status == AttemptStatus.AUTO_SUBMITTED) {
      secs = (int) Math.max(1, attempt.getExpiresAt().getEpochSecond() - attempt.getStartedAt().getEpochSecond());
    }
    var r = scoring.score(qs, attempt.getAnswers() != null ? attempt.getAnswers() : Map.of(),
        exam.getNegativeMarking(), exam.getTotalMarks(), secs);
    attempt.setScore(r.score());
    attempt.setMaxScore(r.maxScore());
    attempt.setPercentage(r.percentage());
    attempt.setCorrectCount(r.correct());
    attempt.setWrongCount(r.wrong());
    attempt.setSkippedCount(r.skipped());
    attempt.setTimeTakenSeconds(secs);
    attempt.setSubmittedAt(Instant.now());
    attempt.setStatus(status);
    attempts.save(attempt);
    ranking.recalculate(exam.getId());
  }

  private void renderAttemptSummary(ExamEntity exam, AttemptEntity attempt, long chatId, Long messageId) {
    StringBuilder text = new StringBuilder();
    text.append("🎉 *Exam submitted*\n\n");
    text.append("📝 *").append(esc(exam.getTitle())).append("*\n");
    text.append("👤 *").append(esc(attempt.getStudentName() != null ? attempt.getStudentName() : "Student")).append("*\n");
    if (attempt.getAttemptNumber() > 1) {
      text.append("🔁 Practice attempt #").append(attempt.getAttemptNumber()).append(" (not ranked)\n");
    }
    text.append("📌 ").append(attempt.getStatus() == AttemptStatus.AUTO_SUBMITTED
        ? "⏰ Auto-submitted (time up)" : "✅ Submitted").append("\n\n");

    if (exam.getResultVisibility() == VisibilityStatus.PUBLISHED) {
      text.append("📊 *Your score*\n");
      text.append("⭐ ").append((int) attempt.getScore()).append(" / ").append((int) attempt.getMaxScore())
          .append(" (").append(attempt.getPercentage()).append("%)\n");
      text.append("✅ ").append(attempt.getCorrectCount())
          .append("  ❌ ").append(attempt.getWrongCount())
          .append("  ⚪ ").append(attempt.getSkippedCount()).append("\n");
      int mins = attempt.getTimeTakenSeconds() / 60;
      int secs = attempt.getTimeTakenSeconds() % 60;
      text.append("⏱️ Time: ").append(mins).append("m ").append(secs).append("s\n");
      boolean ended = isExamTimeEnded(exam);
      if (attempt.isOfficial() && ended && attempt.getRank() != null) {
        text.append("🏆 Rank: #").append(attempt.getRank()).append("\n");
      } else if (attempt.isOfficial() && !ended) {
        text.append("🏆 Rank after exam ends\n");
      }
      text.append("\n*Question-wise*\n");
      List<QuestionEntity> qs = questions.findByExamIdOrderBySortOrderAsc(exam.getId());
      Map<String, Integer> answers = attempt.getAnswers() != null ? attempt.getAnswers() : Map.of();
      for (int i = 0; i < qs.size(); i++) {
        QuestionEntity q = qs.get(i);
        Integer sel = answers.get(q.getId());
        boolean has = sel != null;
        String mark = "⚪";
        String extra = "Skipped";
        List<String> opts = q.getOptions() != null ? q.getOptions() : List.of();
        if (has) {
          boolean ok = q.getAnswer() != null && sel.equals(q.getAnswer());
          mark = ok ? "✅" : "❌";
          String chosen = sel >= 0 && sel < opts.size() ? opts.get(sel) : ("opt " + sel);
          String correct = q.getAnswer() != null && q.getAnswer() >= 0 && q.getAnswer() < opts.size()
              ? opts.get(q.getAnswer()) : "—";
          extra = ok ? "Your answer: " + chosen : "Yours: " + chosen + " · Correct: " + correct;
        }
        String shortQ = q.getQuestion() != null ? q.getQuestion() : "";
        if (shortQ.length() > 60) shortQ = shortQ.substring(0, 60) + "…";
        text.append(mark).append(" Q").append(i + 1).append(". ").append(esc(shortQ)).append("\n   ").append(esc(extra)).append("\n");
      }
    } else {
      text.append("🔒 Results are hidden by the teacher for now.\n");
    }

    sendOrEdit(chatId, messageId, text.toString(), List.of(
        List.of(btn("📚 My Exams", "btn_exams")),
        List.of(btn("🏆 Leaderboard", "btn_leaderboard")),
        List.of(btn("🔁 Reattempt", "reattempt_" + exam.getId())),
        List.of(btn("🏠 Main menu", "btn_home"))));
  }

  private void renderStudentResults(long chatId, long messageId, StudentEntity student) {
    List<AttemptEntity> atts = attempts.findByTelegramUserId(student.getTelegramUserId()).stream()
        .filter(a -> a.getStatus() == AttemptStatus.SUBMITTED || a.getStatus() == AttemptStatus.AUTO_SUBMITTED)
        .sorted(Comparator.comparing(AttemptEntity::getSubmittedAt, Comparator.nullsLast(Comparator.reverseOrder())))
        .toList();

    if (atts.isEmpty()) {
      edit(chatId, messageId, "📊 *My Results*\n\nNo results yet.\nComplete an exam to see your scores here.",
          List.of(
              List.of(btn("📚 My Exams", "btn_exams")),
              List.of(btn("🏠 Main menu", "btn_home"))));
      return;
    }

    StringBuilder text = new StringBuilder("📊 *My Results*\n\n");
    int i = 0;
    for (AttemptEntity att : atts) {
      if (i >= 15) break;
      i++;
      ExamEntity exam = exams.findById(att.getExamId()).orElse(null);
      String title = exam != null ? exam.getTitle() : att.getExamId();
      String practice = (att.getAttemptNumber() > 1 || !att.isOfficial()) ? " _(practice)_" : "";
      text.append("*").append(i).append(". ").append(esc(title)).append("*").append(practice).append("\n");
      if (exam != null && exam.getResultVisibility() == VisibilityStatus.PUBLISHED) {
        text.append("   Score: *").append((int) att.getScore()).append("/").append((int) att.getMaxScore())
            .append("* (").append(att.getPercentage()).append("%)");
        if (att.isOfficial() && isExamTimeEnded(exam) && att.getRank() != null) {
          text.append(" · Rank #").append(att.getRank());
        }
        text.append("\n\n");
      } else {
        text.append("   🔒 Results hidden\n\n");
      }
    }
    edit(chatId, messageId, text.toString(), List.of(
        List.of(btn("📚 My Exams", "btn_exams")),
        List.of(btn("🏆 Leaderboard", "btn_leaderboard")),
        List.of(btn("🏠 Main menu", "btn_home"))));
  }

  private void renderStudentLeaderboard(long chatId, long messageId, StudentEntity student, boolean showAll) {
    Set<String> myExamIds = attempts.findByTelegramUserId(student.getTelegramUserId()).stream()
        .map(AttemptEntity::getExamId).collect(Collectors.toCollection(LinkedHashSet::new));
    List<ExamEntity> examList = myExamIds.stream()
        .map(id -> exams.findById(id).orElse(null))
        .filter(Objects::nonNull)
        .filter(this::isExamTimeEnded)
        .toList();

    if (examList.isEmpty()) {
      edit(chatId, messageId,
          "🏆 *Leaderboard*\n\nRankings appear only *after an exam ends*.",
          List.of(
              List.of(btn("🏠 Main menu", "btn_home")),
              List.of(btn("📚 My Exams", "btn_exams"))));
      return;
    }

    StringBuilder text = new StringBuilder("🏆 *Leaderboard*\n_(First attempt only)_\n\n");
    boolean hasMore = false;
    int limit = showAll ? 50 : 10;

    for (ExamEntity exam : examList) {
      text.append("📝 *").append(esc(exam.getTitle())).append("*\n");
      List<AttemptEntity> board = attempts.findByExamIdAndOfficialTrueAndStatusIn(
              exam.getId(), List.of(AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED)).stream()
          .sorted(Comparator.comparingDouble(AttemptEntity::getScore).reversed()
              .thenComparingInt(AttemptEntity::getTimeTakenSeconds))
          .toList();
      if (board.isEmpty()) {
        text.append("   _No ranked submissions._\n\n");
        continue;
      }
      int shown = 0;
      for (AttemptEntity a : board) {
        if (shown >= limit) {
          hasMore = true;
          break;
        }
        shown++;
        int rank = a.getRank() != null ? a.getRank() : shown;
        text.append("   ").append(rank).append(". ")
            .append(esc(a.getStudentName() != null ? a.getStudentName() : "Student"))
            .append(" — *").append((int) a.getScore()).append("*\n");
      }
      text.append("\n");
    }

    List<List<Map<String, String>>> keyboard = new ArrayList<>();
    if (hasMore && !showAll) {
      keyboard.add(List.of(btn("Show more", "leaderboard_more")));
    }
    keyboard.add(List.of(btn("📚 My Exams", "btn_exams")));
    keyboard.add(List.of(btn("🏠 Main menu", "btn_home")));
    edit(chatId, messageId, text.toString(), keyboard);
  }

  private void linkStudentToTeacher(StudentEntity student, String teacherId) {
    if (teacherId == null || teacherId.isBlank()) return;
    if (student.getTeacherIds() == null) student.setTeacherIds(new ArrayList<>());
    if (!student.getTeacherIds().contains(teacherId)) {
      student.getTeacherIds().add(teacherId);
      students.save(student);
    }
  }

  private boolean isExamTimeEnded(ExamEntity exam) {
    Instant end = exam.getStartDate().plus(Duration.ofMinutes(exam.getDurationMinutes()));
    return !Instant.now().isBefore(end);
  }

  private StudentEntity getOrCreate(JsonNode from) {
    long id = from.get("id").asLong();
    return students.findByTelegramUserId(id).orElseGet(() -> {
      StudentEntity s = new StudentEntity();
      s.setId("STU_" + id);
      s.setStudentCode("S" + String.valueOf(id).substring(Math.max(0, String.valueOf(id).length() - 6)));
      String name = from.has("first_name") ? from.get("first_name").asText("") : "";
      if (from.has("last_name")) name = (name + " " + from.get("last_name").asText("")).trim();
      String username = from.has("username") ? "@" + from.get("username").asText() : null;
      if (name.isBlank() && username != null) name = username;
      if (name.isBlank()) name = "Student";
      s.setName(name);
      s.setClassName("ALL");
      s.setTelegramUserId(id);
      s.setTelegramUsername(username);
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

  private static String formatInIST(Instant instant) {
    if (instant == null) return "—";
    DateTimeFormatter fmt = DateTimeFormatter.ofPattern("d MMM yyyy, h:mm a").withZone(IST);
    String raw = fmt.format(instant);
    return raw.replace(" am", " AM").replace(" pm", " PM");
  }

  private static String formatRemaining(Instant expiresAt) {
    long diff = Math.max(0, expiresAt.toEpochMilli() - Instant.now().toEpochMilli());
    long mins = diff / 60000;
    long secs = (diff % 60000) / 1000;
    return mins + ":" + String.format("%02d", secs);
  }
}
