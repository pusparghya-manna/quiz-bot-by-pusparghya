package com.pusparghya.quizbot.exam;

import com.pusparghya.quizbot.common.Ids;
import com.pusparghya.quizbot.exception.ApiException;
import com.pusparghya.quizbot.question.QuestionEntity;
import com.pusparghya.quizbot.question.QuestionRepository;
import com.pusparghya.quizbot.result.RankingService;
import com.pusparghya.quizbot.submission.AttemptEntity;
import com.pusparghya.quizbot.submission.AttemptRepository;
import com.pusparghya.quizbot.submission.ScoringService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.*;

@Service
public class ExamService {
  private final ExamRepository exams;
  private final QuestionRepository questions;
  private final AttemptRepository attempts;
  private final ScoringService scoring;
  private final RankingService ranking;

  public ExamService(ExamRepository exams, QuestionRepository questions, AttemptRepository attempts,
                     ScoringService scoring, RankingService ranking) {
    this.exams = exams; this.questions = questions; this.attempts = attempts;
    this.scoring = scoring; this.ranking = ranking;
  }


  /** Status is time-driven — not manually set by teachers. */
  public static ExamStatus effectiveStatus(ExamEntity e) {
    Instant start = e.getStartDate();
    if (start == null) return ExamStatus.SCHEDULED;
    Instant now = Instant.now();
    Instant end = start.plus(Duration.ofMinutes(Math.max(1, e.getDurationMinutes())));
    if (now.isBefore(start)) return ExamStatus.SCHEDULED;
    if (now.isBefore(end)) return ExamStatus.LIVE;
    return ExamStatus.RESULTS_PUBLISHED;
  }

  public List<ExamEntity> list(String teacherId) {
    return exams.findByTeacherIdOrderByCreatedAtDesc(teacherId);
  }

  public ExamEntity requireOwned(String examId, String teacherId) {
    return exams.findByIdAndTeacherId(examId, teacherId)
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Exam not found"));
  }

  public Map<String, Object> getWithQuestions(String examId, String teacherId) {
    ExamEntity exam = requireOwned(examId, teacherId);
    List<QuestionEntity> qs = questions.findByExamIdOrderBySortOrderAsc(examId);
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("exam", toMap(exam, qs));
    body.put("attempts", attempts.findByExamId(examId));
    return body;
  }

  @Transactional
  public Map<String, Object> create(String teacherId, Map<String, Object> data) {
    ExamEntity e = new ExamEntity();
    e.setId(Ids.exam());
    e.setTeacherId(teacherId);
    apply(e, data, true);
    e.setStatus(effectiveStatus(e));
    e.setCreatedAt(Instant.now());
    e.setUpdatedAt(Instant.now());
    exams.save(e);
    List<QuestionEntity> qs = saveQuestions(teacherId, e.getId(), data.get("questions"));
    e.setTotalQuestions(qs.size());
    exams.save(e);
    return toMap(e, qs);
  }

  @Transactional
  public Map<String, Object> update(String examId, String teacherId, Map<String, Object> data) {
    ExamEntity e = requireOwned(examId, teacherId);
    apply(e, data, false);
    e.setUpdatedAt(Instant.now());
    if (data.containsKey("questions")) {
      questions.deleteByExamId(examId);
      List<QuestionEntity> qs = saveQuestions(teacherId, examId, data.get("questions"));
      e.setTotalQuestions(qs.size());
      exams.save(e);
      return toMap(e, qs);
    }
    exams.save(e);
    return toMap(e, questions.findByExamIdOrderBySortOrderAsc(examId));
  }

  @Transactional
  public void delete(String examId, String teacherId) {
    requireOwned(examId, teacherId);
    questions.deleteByExamId(examId);
    attempts.findByExamId(examId).forEach(attempts::delete);
    exams.deleteById(examId);
  }

  @Transactional
  public Map<String, Object> recalculate(String examId, String teacherId) {
    ExamEntity exam = requireOwned(examId, teacherId);
    List<QuestionEntity> qs = questions.findByExamIdOrderBySortOrderAsc(examId);
    List<AttemptEntity> list = attempts.findByExamId(examId);
    for (AttemptEntity a : list) {
      if (a.getStatus() == com.pusparghya.quizbot.submission.AttemptStatus.IN_PROGRESS) continue;
      int secs = a.getTimeTakenSeconds();
      var r = scoring.score(qs, a.getAnswers(), exam.getNegativeMarking(), exam.getTotalMarks(), secs);
      a.setScore(r.score()); a.setMaxScore(r.maxScore()); a.setPercentage(r.percentage());
      a.setCorrectCount(r.correct()); a.setWrongCount(r.wrong()); a.setSkippedCount(r.skipped());
    }
    attempts.saveAll(list);
    ranking.recalculate(examId);
    return Map.of("success", true, "count", list.size());
  }

  @SuppressWarnings("unchecked")
  private List<QuestionEntity> saveQuestions(String teacherId, String examId, Object raw) {
    List<QuestionEntity> saved = new ArrayList<>();
    if (!(raw instanceof List<?> list)) return saved;
    int i = 0;
    for (Object o : list) {
      if (!(o instanceof Map<?, ?> m)) continue;
      QuestionEntity q = new QuestionEntity();
      q.setId(m.get("id") != null ? String.valueOf(m.get("id")) : Ids.question());
      q.setExamId(examId);
      q.setTeacherId(teacherId);
      q.setQuestion(m.get("question") != null ? String.valueOf(m.get("question")) : "");
      Object opts = m.get("options");
      if (opts instanceof List<?> ol) q.setOptions(ol.stream().map(String::valueOf).toList());
      else q.setOptions(List.of("A", "B", "C", "D"));
      if (m.get("answer") != null) q.setAnswer(Integer.valueOf(String.valueOf(m.get("answer"))));
      q.setMarks(m.get("marks") != null ? Double.parseDouble(String.valueOf(m.get("marks"))) : 1);
      q.setNegativeMarks(m.get("negativeMarks") != null ? Double.parseDouble(String.valueOf(m.get("negativeMarks"))) : 0);
      if (m.get("explanation") != null) q.setExplanation(String.valueOf(m.get("explanation")));
      q.setSortOrder(i++);
      saved.add(questions.save(q));
    }
    return saved;
  }

  private void apply(ExamEntity e, Map<String, Object> data, boolean creating) {
    if (data.get("title") != null) e.setTitle(String.valueOf(data.get("title")));
    else if (creating) e.setTitle("Untitled Examination");
    if (data.get("subject") != null) e.setSubject(String.valueOf(data.get("subject")));
    if (data.get("className") != null) e.setClassName(String.valueOf(data.get("className")));
    if (data.get("testNumber") != null) e.setTestNumber(String.valueOf(data.get("testNumber")));
    if (data.get("startDate") != null) e.setStartDate(Instant.parse(String.valueOf(data.get("startDate"))));
    else if (creating) e.setStartDate(Instant.now());
    if (data.get("durationMinutes") != null) e.setDurationMinutes(Integer.parseInt(String.valueOf(data.get("durationMinutes"))));
    if (data.get("totalMarks") != null) e.setTotalMarks(Integer.parseInt(String.valueOf(data.get("totalMarks"))));
    if (data.get("negativeMarking") != null) e.setNegativeMarking(Double.parseDouble(String.valueOf(data.get("negativeMarking"))));
    if (data.get("randomizeQuestions") != null) e.setRandomizeQuestions(Boolean.parseBoolean(String.valueOf(data.get("randomizeQuestions"))));
    if (data.get("randomizeOptions") != null) e.setRandomizeOptions(Boolean.parseBoolean(String.valueOf(data.get("randomizeOptions"))));
    // status is automatic from startDate + duration — ignore client overrides
    e.setStatus(effectiveStatus(e));
  }

  public Map<String, Object> toMap(ExamEntity e, List<QuestionEntity> qs) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", e.getId());
    m.put("teacherId", e.getTeacherId());
    m.put("title", e.getTitle());
    m.put("subject", e.getSubject());
    m.put("className", e.getClassName());
    m.put("testNumber", e.getTestNumber());
    m.put("totalQuestions", e.getTotalQuestions());
    m.put("startDate", e.getStartDate().toString());
    m.put("durationMinutes", e.getDurationMinutes());
    m.put("totalMarks", e.getTotalMarks());
    m.put("negativeMarking", e.getNegativeMarking());
    m.put("randomizeQuestions", e.isRandomizeQuestions());
    m.put("randomizeOptions", e.isRandomizeOptions());
    m.put("resultVisibility", e.getResultVisibility().name());
    m.put("leaderboardVisibility", e.getLeaderboardVisibility().name());
    m.put("status", effectiveStatus(e).name());
    m.put("storedStatus", e.getStatus() != null ? e.getStatus().name() : null);
    m.put("createdAt", e.getCreatedAt().toString());
    m.put("updatedAt", e.getUpdatedAt().toString());
    m.put("questions", qs.stream().map(this::qMap).toList());
    return m;
  }

  private Map<String, Object> qMap(QuestionEntity q) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", q.getId());
    m.put("examId", q.getExamId());
    m.put("teacherId", q.getTeacherId());
    m.put("question", q.getQuestion());
    m.put("options", q.getOptions());
    m.put("answer", q.getAnswer());
    m.put("marks", q.getMarks());
    m.put("negativeMarks", q.getNegativeMarks());
    m.put("explanation", q.getExplanation());
    m.put("subject", q.getSubject());
    return m;
  }
}
