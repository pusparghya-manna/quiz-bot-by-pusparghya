package com.pusparghya.quizbot.result;

import com.pusparghya.quizbot.submission.AttemptEntity;
import com.pusparghya.quizbot.submission.AttemptRepository;
import com.pusparghya.quizbot.submission.AttemptStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;

@Service
public class RankingService {
  private final AttemptRepository attempts;

  public RankingService(AttemptRepository attempts) {
    this.attempts = attempts;
  }

  @Transactional
  public void recalculate(String examId) {
    List<AttemptEntity> all = attempts.findByExamId(examId);
    for (AttemptEntity a : all) {
      if (!a.isOfficial()) {
        a.setRank(null);
      }
    }
    List<AttemptEntity> official = all.stream()
        .filter(a -> a.isOfficial() && (a.getStatus() == AttemptStatus.SUBMITTED || a.getStatus() == AttemptStatus.AUTO_SUBMITTED))
        .sorted(Comparator
            .comparingDouble(AttemptEntity::getScore).reversed()
            .thenComparingInt(AttemptEntity::getTimeTakenSeconds)
            .thenComparing(a -> a.getSubmittedAt() == null ? java.time.Instant.MAX : a.getSubmittedAt()))
        .toList();
    int rank = 1;
    for (AttemptEntity a : official) {
      a.setRank(rank++);
    }
    attempts.saveAll(all);
  }
}
