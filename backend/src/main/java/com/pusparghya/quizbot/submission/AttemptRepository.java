package com.pusparghya.quizbot.submission;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;

public interface AttemptRepository extends JpaRepository<AttemptEntity, String> {
  List<AttemptEntity> findByExamId(String examId);
  List<AttemptEntity> findByExamIdIn(List<String> examIds);
  List<AttemptEntity> findByTelegramUserId(long telegramUserId);
  List<AttemptEntity> findByExamIdAndTelegramUserIdOrderByAttemptNumberAsc(String examId, long telegramUserId);
  Optional<AttemptEntity> findFirstByExamIdAndTelegramUserIdAndStatusOrderByAttemptNumberDesc(
      String examId, long telegramUserId, AttemptStatus status);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select a from AttemptEntity a where a.id = :id")
  Optional<AttemptEntity> findByIdForUpdate(String id);

  List<AttemptEntity> findByExamIdAndOfficialTrueAndStatusIn(String examId, List<AttemptStatus> statuses);
}
