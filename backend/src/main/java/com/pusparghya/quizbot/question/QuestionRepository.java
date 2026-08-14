package com.pusparghya.quizbot.question;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface QuestionRepository extends JpaRepository<QuestionEntity, String> {
  List<QuestionEntity> findByExamIdOrderBySortOrderAsc(String examId);
  List<QuestionEntity> findByTeacherIdAndExamIdIsNullOrderByIdDesc(String teacherId);
  Optional<QuestionEntity> findByIdAndTeacherId(String id, String teacherId);
  void deleteByExamId(String examId);
}
