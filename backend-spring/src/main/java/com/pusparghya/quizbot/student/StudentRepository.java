package com.pusparghya.quizbot.student;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.List;
import java.util.Optional;

public interface StudentRepository extends JpaRepository<StudentEntity, String> {
  Optional<StudentEntity> findByTelegramUserId(Long telegramUserId);
  Optional<StudentEntity> findByStudentCode(String studentCode);

  @Query(value = "SELECT * FROM students s WHERE s.teacher_ids @> CAST(:teacherJson AS jsonb)", nativeQuery = true)
  List<StudentEntity> findLinkedToTeacher(String teacherJson);
}
