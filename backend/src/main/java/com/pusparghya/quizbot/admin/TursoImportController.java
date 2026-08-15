package com.pusparghya.quizbot.admin;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

@RestController
@RequestMapping("/api/admin")
public class TursoImportController {
  private final JdbcTemplate jdbc;
  private final ObjectMapper mapper;
  private final PasswordEncoder encoder;
  private final String importSecret;

  public TursoImportController(
      JdbcTemplate jdbc, ObjectMapper mapper, PasswordEncoder encoder,
      @Value("${app.import-secret:}") String importSecret) {
    this.jdbc = jdbc;
    this.mapper = mapper;
    this.encoder = encoder;
    this.importSecret = importSecret == null ? "" : importSecret;
  }

  @PostMapping("/import-turso")
  @Transactional
  public ResponseEntity<?> importTurso(
      @RequestHeader(value = "X-Import-Secret", required = false) String secret,
      @RequestBody JsonNode body) {
    if (importSecret.isBlank() || secret == null || !importSecret.equals(secret)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Forbidden"));
    }
    try {
      return ResponseEntity.ok(doImport(body));
    } catch (Exception e) {
      e.printStackTrace();
      String msg = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
      Throwable c = e.getCause();
      if (c != null && c.getMessage() != null) msg = msg + " | " + c.getMessage();
      return ResponseEntity.status(500).body(Map.of("error", msg));
    }
  }

  private Map<String, Object> doImport(JsonNode body) throws Exception {
    List<JsonNode> rows = new ArrayList<>();
    if (body.isArray()) body.forEach(rows::add);
    else if (body.has("rows")) body.get("rows").forEach(rows::add);
    else throw new IllegalArgumentException("Expected JSON array");

    Map<String, JsonNode> byKey = new HashMap<>();
    for (JsonNode r : rows) {
      byKey.put(r.path("teacher_id").asText() + "|" + r.path("key").asText(),
          mapper.readTree(r.path("data").asText("null")));
    }

    final String teacher = "TinkoriSir";
    jdbc.update(
        "INSERT INTO teachers (username, name, password_hash) VALUES (?,?,?) ON CONFLICT (username) DO UPDATE SET name = EXCLUDED.name",
        teacher, "Tinkori Sir", encoder.encode("OnlineQuiz@123"));

    Map<String, JsonNode> students = new LinkedHashMap<>();
    for (String k : List.of("default|students", "TCH_TINKORI|students")) {
      JsonNode arr = byKey.get(k);
      if (arr != null && arr.isArray()) for (JsonNode s : arr) students.put(s.path("id").asText(), s);
    }

    // Clear conflicting telegram IDs gently: update by telegram if exists
    int studentCount = 0;
    for (JsonNode s : students.values()) {
      String id = s.path("id").asText();
      String code = textOr(s, "studentId", id);
      String name = textOr(s, "name", "Student");
      String className = textOr(s, "className", null);
      Long tgId = s.hasNonNull("telegramUserId") ? s.get("telegramUserId").asLong() : null;
      String tgUser = textOr(s, "telegramUsername", null);
      String link = textOr(s, "linkCode", code);
      String status = textOr(s, "status", "linked");
      Timestamp linkedAt = ts(textOr(s, "linkedAt", null));
      List<String> tids = new ArrayList<>();
      if (s.has("teacherIds") && s.get("teacherIds").isArray()) s.get("teacherIds").forEach(n -> tids.add(n.asText()));
      if (!tids.contains(teacher)) tids.add(teacher);
      String tidsJson = mapper.writeValueAsString(tids);

      if (tgId != null) {
        jdbc.update("DELETE FROM students WHERE telegram_user_id = ? AND id <> ?", tgId, id);
      }
      jdbc.update(
          "INSERT INTO students (id, student_code, name, class_name, telegram_user_id, telegram_username, link_code, status, linked_at, teacher_ids) "
              + "VALUES (?,?,?,?,?,?,?,?,?,?::jsonb) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, telegram_user_id=EXCLUDED.telegram_user_id, "
              + "telegram_username=EXCLUDED.telegram_username, teacher_ids=EXCLUDED.teacher_ids, status=EXCLUDED.status",
          id, code, name, className, tgId, tgUser, link, status, linkedAt, tidsJson);
      studentCount++;
    }

    int examCount = 0, questionCount = 0;
    JsonNode exams = byKey.get("default|exams");
    if (exams != null && exams.isArray()) {
      for (JsonNode e : exams) {
        String eid = e.path("id").asText();
        Timestamp start = ts(textOr(e, "startDate", "2026-01-01T00:00:00Z"));
        Timestamp created = ts(textOr(e, "createdAt", null));
        Timestamp updated = ts(textOr(e, "updatedAt", null));
        jdbc.update(
            "INSERT INTO exams (id, teacher_id, title, subject, class_name, test_number, total_questions, start_date, duration_minutes, total_marks, "
                + "negative_marking, randomize_questions, randomize_options, result_visibility, leaderboard_visibility, status, created_at, updated_at) "
                + "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, status=EXCLUDED.status, teacher_id=EXCLUDED.teacher_id",
            eid, teacher, textOr(e, "title", "Exam"), textOr(e, "subject", null), textOr(e, "className", null),
            textOr(e, "testNumber", null), e.path("totalQuestions").asInt(e.path("questions").size()),
            start, e.path("durationMinutes").asInt(60), e.path("totalMarks").asInt(0),
            e.path("negativeMarking").asDouble(0), e.path("randomizeQuestions").asBoolean(false),
            e.path("randomizeOptions").asBoolean(false), textOr(e, "resultVisibility", "PUBLISHED"),
            textOr(e, "leaderboardVisibility", "PUBLISHED"), textOr(e, "status", "DRAFT"),
            created != null ? created : new Timestamp(System.currentTimeMillis()),
            updated != null ? updated : new Timestamp(System.currentTimeMillis()));
        examCount++;
        int order = 0;
        for (JsonNode q : e.path("questions")) {
          List<String> opts = mapper.convertValue(q.path("options"), new TypeReference<>() {});
          if (opts == null) opts = List.of();
          Integer answer = q.hasNonNull("answer") ? q.get("answer").asInt() : null;
          jdbc.update(
              "INSERT INTO questions (id, exam_id, teacher_id, question, options, answer, marks, negative_marks, explanation, subject, sort_order) "
                  + "VALUES (?,?,?,?,?::jsonb,?,?,?,?,?,?) ON CONFLICT (id) DO UPDATE SET question=EXCLUDED.question, options=EXCLUDED.options, answer=EXCLUDED.answer",
              q.path("id").asText(), eid, teacher, textOr(q, "question", ""), mapper.writeValueAsString(opts),
              answer, q.path("marks").asDouble(1), q.path("negativeMarks").asDouble(0),
              textOr(q, "explanation", ""), textOr(q, "subject", null), order++);
          questionCount++;
        }
      }
    }

    int attemptCount = 0;
    JsonNode attempts = byKey.get("default|attempts");
    if (attempts != null && attempts.isArray()) {
      for (JsonNode a : attempts) {
        Integer rank = a.hasNonNull("rank") ? a.get("rank").asInt() : null;
        jdbc.update(
            "INSERT INTO attempts (id, exam_id, student_id, telegram_user_id, student_name, student_class, started_at, expires_at, submitted_at, status, "
                + "answers, current_question_index, score, max_score, percentage, correct_count, wrong_count, skipped_count, time_taken_seconds, rank, is_official, attempt_number) "
                + "VALUES (?,?,?,?,?,?,?,?,?,?,?::jsonb,?,?,?,?,?,?,?,?,?,?,?) "
                + "ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, score=EXCLUDED.score, answers=EXCLUDED.answers, submitted_at=EXCLUDED.submitted_at",
            a.path("id").asText(), a.path("examId").asText(), textOr(a, "studentId", null),
            a.path("telegramUserId").asLong(), textOr(a, "studentName", null), textOr(a, "studentClass", null),
            ts(textOr(a, "startedAt", "2026-01-01T00:00:00Z")),
            ts(textOr(a, "expiresAt", "2026-01-01T01:00:00Z")),
            ts(textOr(a, "submittedAt", null)),
            textOr(a, "status", "IN_PROGRESS"),
            mapper.writeValueAsString(a.path("answers")),
            a.path("currentQuestionIndex").asInt(0), a.path("score").asDouble(0), a.path("maxScore").asDouble(0),
            a.path("percentage").asDouble(0), a.path("correctCount").asInt(0), a.path("wrongCount").asInt(0),
            a.path("skippedCount").asInt(0), a.path("timeTakenSeconds").asInt(0), rank,
            a.path("isOfficial").asBoolean(true), a.path("attemptNumber").asInt(1));
        attemptCount++;
      }
    }

    JsonNode settings = byKey.getOrDefault("default|settings", byKey.get("TCH_TINKORI|settings"));
    if (settings != null && settings.isObject()) {
      jdbc.update(
          "UPDATE system_settings SET bot_username=?, system_notice=?, bot_active=?, auto_publish_results=? WHERE id=1",
          textOr(settings, "botUsername", "@quizbotbypusparghya_bot"),
          textOr(settings, "systemNotice", ""),
          settings.path("botActive").asBoolean(true),
          settings.path("autoPublishResults").asBoolean(true));
    }

    return Map.of(
        "ok", true,
        "teacher", teacher,
        "students", studentCount,
        "exams", examCount,
        "questions", questionCount,
        "attempts", attemptCount);
  }

  private static String textOr(JsonNode n, String field, String fallback) {
    JsonNode v = n.get(field);
    if (v == null || v.isNull()) return fallback;
    String s = v.asText();
    return (s == null || s.isBlank() || "null".equals(s)) ? fallback : s;
  }

  private static Timestamp ts(String iso) {
    if (iso == null || iso.isBlank()) return null;
    try {
      return Timestamp.from(Instant.parse(iso));
    } catch (Exception e) {
      try {
        return Timestamp.from(Instant.parse(iso.replace(" ", "T")));
      } catch (Exception e2) {
        return null;
      }
    }
  }
}
