package com.pusparghya.quizbot.exam;

import com.pusparghya.quizbot.question.QuestionRepository;
import com.pusparghya.quizbot.security.TeacherPrincipal;
import com.pusparghya.quizbot.settings.SystemSettingsService;
import com.pusparghya.quizbot.student.StudentEntity;
import com.pusparghya.quizbot.student.StudentRepository;
import com.pusparghya.quizbot.submission.AttemptEntity;
import com.pusparghya.quizbot.submission.AttemptRepository;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api")
public class DashboardController {
  private final ExamRepository exams;
  private final ExamService examService;
  private final AttemptRepository attempts;
  private final StudentRepository students;
  private final SystemSettingsService settings;

  public DashboardController(ExamRepository exams, ExamService examService, AttemptRepository attempts,
                             StudentRepository students, SystemSettingsService settings) {
    this.exams = exams; this.examService = examService; this.attempts = attempts;
    this.students = students; this.settings = settings;
  }

  @GetMapping("/data")
  public Map<String, Object> data(@AuthenticationPrincipal TeacherPrincipal p) {
    String teacherId = p.username();
    List<ExamEntity> examList = exams.findByTeacherIdOrderByCreatedAtDesc(teacherId);
    List<String> examIds = examList.stream().map(ExamEntity::getId).toList();
    List<AttemptEntity> att = examIds.isEmpty() ? List.of() : attempts.findByExamIdIn(examIds);
    Set<Long> tg = att.stream().map(AttemptEntity::getTelegramUserId).collect(Collectors.toSet());
    List<StudentEntity> stus = students.findAll().stream()
        .filter(s -> (s.getTeacherIds() != null && s.getTeacherIds().contains(teacherId))
            || (s.getTelegramUserId() != null && tg.contains(s.getTelegramUserId())))
        .toList();
    // dedupe by telegram
    Map<String, StudentEntity> dedup = new LinkedHashMap<>();
    for (StudentEntity s : stus) {
      String key = s.getTelegramUserId() != null ? "tg:" + s.getTelegramUserId() : "id:" + s.getId();
      dedup.putIfAbsent(key, s);
    }
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("exams", examList.stream().map(e -> examService.toMap(e, List.of())).toList());
    out.put("questions", List.of());
    out.put("students", dedup.values().stream().map(this::studentMap).toList());
    out.put("attempts", att);
    out.put("settings", settings.publicView());
    out.put("auditLogs", List.of());
    return out;
  }

  @GetMapping("/stats")
  public Map<String, Object> stats(@AuthenticationPrincipal TeacherPrincipal p) {
    List<ExamEntity> examList = exams.findByTeacherIdOrderByCreatedAtDesc(p.username());
    List<String> ids = examList.stream().map(ExamEntity::getId).toList();
    long live = examList.stream().filter(e -> e.getStatus() == ExamStatus.LIVE).count();
    long att = ids.isEmpty() ? 0 : attempts.findByExamIdIn(ids).size();
    return Map.of("exams", examList.size(), "live", live, "attempts", att);
  }

  @GetMapping("/health")
  public Map<String, Object> healthAlias() {
    return Map.of("ok", true);
  }

  private Map<String, Object> studentMap(StudentEntity s) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", s.getId());
    m.put("studentId", s.getStudentCode());
    m.put("name", s.getName());
    m.put("className", s.getClassName());
    m.put("telegramUserId", s.getTelegramUserId());
    m.put("telegramUsername", s.getTelegramUsername());
    m.put("linkCode", s.getLinkCode());
    m.put("status", s.getStatus());
    m.put("linkedAt", s.getLinkedAt() != null ? s.getLinkedAt().toString() : null);
    m.put("teacherIds", s.getTeacherIds());
    return m;
  }
}
