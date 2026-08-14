package com.pusparghya.quizbot.submission;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

@Entity
@Table(name = "attempts", indexes = {
    @Index(name = "idx_attempts_exam", columnList = "exam_id"),
    @Index(name = "idx_attempts_telegram", columnList = "telegram_user_id"),
    @Index(name = "idx_attempts_exam_official", columnList = "exam_id,is_official,status")
}, uniqueConstraints = {
    @UniqueConstraint(name = "uk_official_attempt", columnNames = {"exam_id", "telegram_user_id", "attempt_number"})
})
public class AttemptEntity {
  @Id @Column(length = 64) private String id;
  @Column(name = "exam_id", nullable = false, length = 64) private String examId;
  @Column(name = "student_id", length = 64) private String studentId;
  @Column(name = "telegram_user_id", nullable = false) private long telegramUserId;
  @Column(name = "student_name", length = 200) private String studentName;
  @Column(name = "student_class", length = 120) private String studentClass;
  @Column(name = "started_at", nullable = false) private Instant startedAt;
  @Column(name = "expires_at", nullable = false) private Instant expiresAt;
  @Column(name = "submitted_at") private Instant submittedAt;
  @Enumerated(EnumType.STRING) @Column(nullable = false, length = 32)
  private AttemptStatus status = AttemptStatus.IN_PROGRESS;
  @JdbcTypeCode(SqlTypes.JSON)
  @Column(nullable = false, columnDefinition = "jsonb")
  private Map<String, Integer> answers = new HashMap<>();
  @Column(name = "current_question_index") private int currentQuestionIndex;
  private double score;
  @Column(name = "max_score") private double maxScore;
  private double percentage;
  @Column(name = "correct_count") private int correctCount;
  @Column(name = "wrong_count") private int wrongCount;
  @Column(name = "skipped_count") private int skippedCount;
  @Column(name = "time_taken_seconds") private int timeTakenSeconds;
  private Integer rank;
  @Column(name = "is_official") private boolean official = true;
  @Column(name = "attempt_number") private int attemptNumber = 1;
  @Version private long version;

  public String getId() { return id; }
  public void setId(String id) { this.id = id; }
  public String getExamId() { return examId; }
  public void setExamId(String examId) { this.examId = examId; }
  public String getStudentId() { return studentId; }
  public void setStudentId(String studentId) { this.studentId = studentId; }
  public long getTelegramUserId() { return telegramUserId; }
  public void setTelegramUserId(long telegramUserId) { this.telegramUserId = telegramUserId; }
  public String getStudentName() { return studentName; }
  public void setStudentName(String studentName) { this.studentName = studentName; }
  public String getStudentClass() { return studentClass; }
  public void setStudentClass(String studentClass) { this.studentClass = studentClass; }
  public Instant getStartedAt() { return startedAt; }
  public void setStartedAt(Instant startedAt) { this.startedAt = startedAt; }
  public Instant getExpiresAt() { return expiresAt; }
  public void setExpiresAt(Instant expiresAt) { this.expiresAt = expiresAt; }
  public Instant getSubmittedAt() { return submittedAt; }
  public void setSubmittedAt(Instant submittedAt) { this.submittedAt = submittedAt; }
  public AttemptStatus getStatus() { return status; }
  public void setStatus(AttemptStatus status) { this.status = status; }
  public Map<String, Integer> getAnswers() { return answers; }
  public void setAnswers(Map<String, Integer> answers) { this.answers = answers; }
  public int getCurrentQuestionIndex() { return currentQuestionIndex; }
  public void setCurrentQuestionIndex(int currentQuestionIndex) { this.currentQuestionIndex = currentQuestionIndex; }
  public double getScore() { return score; }
  public void setScore(double score) { this.score = score; }
  public double getMaxScore() { return maxScore; }
  public void setMaxScore(double maxScore) { this.maxScore = maxScore; }
  public double getPercentage() { return percentage; }
  public void setPercentage(double percentage) { this.percentage = percentage; }
  public int getCorrectCount() { return correctCount; }
  public void setCorrectCount(int correctCount) { this.correctCount = correctCount; }
  public int getWrongCount() { return wrongCount; }
  public void setWrongCount(int wrongCount) { this.wrongCount = wrongCount; }
  public int getSkippedCount() { return skippedCount; }
  public void setSkippedCount(int skippedCount) { this.skippedCount = skippedCount; }
  public int getTimeTakenSeconds() { return timeTakenSeconds; }
  public void setTimeTakenSeconds(int timeTakenSeconds) { this.timeTakenSeconds = timeTakenSeconds; }
  public Integer getRank() { return rank; }
  public void setRank(Integer rank) { this.rank = rank; }
  public boolean isOfficial() { return official; }
  public void setOfficial(boolean official) { this.official = official; }
  public int getAttemptNumber() { return attemptNumber; }
  public void setAttemptNumber(int attemptNumber) { this.attemptNumber = attemptNumber; }
  public long getVersion() { return version; }
}
