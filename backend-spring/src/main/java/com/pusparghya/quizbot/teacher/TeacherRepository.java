package com.pusparghya.quizbot.teacher;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface TeacherRepository extends JpaRepository<Teacher, String> {
  Optional<Teacher> findByUsername(String username);
  boolean existsByUsername(String username);
}
