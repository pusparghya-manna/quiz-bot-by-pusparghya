package com.pusparghya.quizbot.exam;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface ExamRepository extends JpaRepository<ExamEntity, String> {
  List<ExamEntity> findByTeacherIdOrderByCreatedAtDesc(String teacherId);
  Optional<ExamEntity> findByIdAndTeacherId(String id, String teacherId);
}
