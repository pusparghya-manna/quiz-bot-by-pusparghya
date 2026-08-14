package com.pusparghya.quizbot.exam;

import com.pusparghya.quizbot.security.TeacherPrincipal;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/exams")
public class ExamController {
  private final ExamService exams;

  public ExamController(ExamService exams) {
    this.exams = exams;
  }

  @GetMapping
  public List<Map<String, Object>> list(@AuthenticationPrincipal TeacherPrincipal p) {
    return exams.list(p.username()).stream()
        .map(e -> exams.toMap(e, List.of()))
        .toList();
  }

  @GetMapping("/{id}")
  public Map<String, Object> get(@PathVariable String id, @AuthenticationPrincipal TeacherPrincipal p) {
    return exams.getWithQuestions(id, p.username());
  }

  @PostMapping
  public Map<String, Object> create(@RequestBody Map<String, Object> body, @AuthenticationPrincipal TeacherPrincipal p) {
    return exams.create(p.username(), body);
  }

  @PutMapping("/{id}")
  public Map<String, Object> update(@PathVariable String id, @RequestBody Map<String, Object> body,
                                   @AuthenticationPrincipal TeacherPrincipal p) {
    return exams.update(id, p.username(), body);
  }

  @DeleteMapping("/{id}")
  public Map<String, Object> delete(@PathVariable String id, @AuthenticationPrincipal TeacherPrincipal p) {
    exams.delete(id, p.username());
    return Map.of("success", true);
  }

  @PostMapping("/{id}/recalculate")
  public Map<String, Object> recalculate(@PathVariable String id, @AuthenticationPrincipal TeacherPrincipal p) {
    return exams.recalculate(id, p.username());
  }
}
