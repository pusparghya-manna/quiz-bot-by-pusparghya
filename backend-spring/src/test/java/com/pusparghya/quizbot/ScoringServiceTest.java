package com.pusparghya.quizbot;
import com.pusparghya.quizbot.question.QuestionEntity;
import com.pusparghya.quizbot.submission.ScoringService;
import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
class ScoringServiceTest {
  @Test void scoresCorrectWrongSkip() {
    QuestionEntity q1 = new QuestionEntity(); q1.setId("q1"); q1.setAnswer(0); q1.setMarks(1);
    QuestionEntity q2 = new QuestionEntity(); q2.setId("q2"); q2.setAnswer(1); q2.setMarks(1); q2.setNegativeMarks(0.25);
    QuestionEntity q3 = new QuestionEntity(); q3.setId("q3"); q3.setAnswer(2); q3.setMarks(1);
    var r = new ScoringService().score(List.of(q1,q2,q3), Map.of("q1",0,"q2",0), 0, 3, 12);
    assertEquals(1, r.correct());
    assertEquals(1, r.wrong());
    assertEquals(1, r.skipped());
    assertEquals(0.75, r.score());
    assertEquals(12, r.timeTakenSeconds());
  }
}
