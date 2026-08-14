package com.pusparghya.quizbot.submission;

import com.pusparghya.quizbot.question.QuestionEntity;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
public class ScoringService {
  public record ScoreResult(double score, double maxScore, double percentage,
                            int correct, int wrong, int skipped, int timeTakenSeconds) {}

  public ScoreResult score(List<QuestionEntity> questions, Map<String, Integer> answers,
                           double examNegativeDefault, int totalMarksHint, int timeTakenSecs) {
    int correct = 0, wrong = 0, skipped = 0;
    double score = 0;
    double maxScore = 0;
    for (QuestionEntity q : questions) {
      maxScore += q.getMarks() <= 0 ? 1 : q.getMarks();
      Integer selected = answers.get(q.getId());
      if (selected == null) {
        skipped++;
      } else if (q.getAnswer() != null && selected.equals(q.getAnswer())) {
        correct++;
        score += q.getMarks() <= 0 ? 1 : q.getMarks();
      } else {
        wrong++;
        double neg = q.getNegativeMarks() > 0 ? q.getNegativeMarks() : examNegativeDefault;
        score -= neg;
      }
    }
    score = Math.max(0, score);
    if (totalMarksHint > 0) maxScore = totalMarksHint;
    double pct = maxScore > 0 ? Math.round((score / maxScore) * 1000.0) / 10.0 : 0;
    return new ScoreResult(score, maxScore, pct, correct, wrong, skipped, timeTakenSecs);
  }
}
