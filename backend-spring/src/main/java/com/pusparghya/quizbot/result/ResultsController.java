package com.pusparghya.quizbot.result;

import com.pusparghya.quizbot.common.CsvUtil;
import com.pusparghya.quizbot.exam.ExamEntity;
import com.pusparghya.quizbot.exam.ExamRepository;
import com.pusparghya.quizbot.exception.ApiException;
import com.pusparghya.quizbot.security.TeacherPrincipal;
import com.pusparghya.quizbot.student.StudentRepository;
import com.pusparghya.quizbot.submission.AttemptEntity;
import com.pusparghya.quizbot.submission.AttemptRepository;
import com.pusparghya.quizbot.submission.AttemptStatus;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@RestController
public class ResultsController {
  private final ExamRepository exams;
  private final AttemptRepository attempts;
  private final StudentRepository students;

  public ResultsController(ExamRepository exams, AttemptRepository attempts, StudentRepository students) {
    this.exams = exams; this.attempts = attempts; this.students = students;
  }

  private Set<String> myExamIds(String teacherId) {
    return exams.findByTeacherIdOrderByCreatedAtDesc(teacherId).stream().map(ExamEntity::getId).collect(Collectors.toSet());
  }

  @GetMapping("/api/results")
  public List<AttemptEntity> results(@RequestParam(required = false) String examId,
                                     @AuthenticationPrincipal TeacherPrincipal p) {
    Set<String> mine = myExamIds(p.username());
    List<AttemptEntity> list = attempts.findByExamIdIn(List.copyOf(mine));
    if (examId != null) {
      if (!mine.contains(examId)) throw new ApiException(HttpStatus.NOT_FOUND, "Exam not found");
      list = list.stream().filter(a -> a.getExamId().equals(examId)).toList();
    }
    return list;
  }

  @GetMapping("/api/results/export")
  public ResponseEntity<String> export(@RequestParam(required = false) String examId,
                                       @AuthenticationPrincipal TeacherPrincipal p) {
    Set<String> mine = myExamIds(p.username());
    List<AttemptEntity> list = attempts.findByExamIdIn(List.copyOf(mine)).stream()
        .filter(a -> a.getStatus() == AttemptStatus.SUBMITTED || a.getStatus() == AttemptStatus.AUTO_SUBMITTED)
        .filter(a -> examId == null || a.getExamId().equals(examId))
        .sorted(Comparator.comparingDouble(AttemptEntity::getScore).reversed())
        .toList();
    if (examId != null && !mine.contains(examId)) throw new ApiException(HttpStatus.NOT_FOUND, "Exam not found");
    StringBuilder csv = new StringBuilder("Rank,Student ID,Student Name,Class,Status,Score,Max Score,Percentage,Time Taken (sec),Submitted At\n");
    int i = 0;
    for (AttemptEntity a : list) {
      csv.append(String.join(",",
          CsvUtil.cell(a.getRank() != null ? a.getRank() : ++i),
          CsvUtil.cell(a.getStudentId()),
          CsvUtil.cell(a.getStudentName()),
          CsvUtil.cell(a.getStudentClass()),
          CsvUtil.cell(a.getStatus().name()),
          CsvUtil.cell(a.getScore()),
          CsvUtil.cell(a.getMaxScore()),
          CsvUtil.cell(a.getPercentage()),
          CsvUtil.cell(a.getTimeTakenSeconds()),
          CsvUtil.cell(a.getSubmittedAt() != null ? a.getSubmittedAt().toString() : "")
      )).append("\n");
    }
    return ResponseEntity.ok()
        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=exam_results.csv")
        .contentType(MediaType.parseMediaType("text/csv"))
        .body(csv.toString());
  }

  @GetMapping("/api/leaderboard")
  public List<AttemptEntity> leaderboard(@RequestParam String examId, @AuthenticationPrincipal TeacherPrincipal p) {
    exams.findByIdAndTeacherId(examId, p.username())
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Exam not found"));
    return attempts.findByExamIdAndOfficialTrueAndStatusIn(examId,
            List.of(AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED)).stream()
        .sorted(Comparator.comparing(AttemptEntity::getRank, Comparator.nullsLast(Comparator.naturalOrder())))
        .toList();
  }
}
