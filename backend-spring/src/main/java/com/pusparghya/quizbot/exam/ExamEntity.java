package com.pusparghya.quizbot.exam;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "exams", indexes = {
    @Index(name = "idx_exams_teacher", columnList = "teacher_id")
})
public class ExamEntity {
  @Id @Column(length = 64) private String id;
  @Column(name = "teacher_id", nullable = false, length = 64) private String teacherId;
  @Column(nullable = false, length = 300) private String title;
  @Column(length = 120) private String subject;
  @Column(name = "class_name", length = 120) private String className;
  @Column(name = "test_number", length = 64) private String testNumber;
  @Column(name = "total_questions") private int totalQuestions;
  @Column(name = "start_date", nullable = false) private Instant startDate;
  @Column(name = "duration_minutes", nullable = false) private int durationMinutes = 60;
  @Column(name = "total_marks") private int totalMarks;
  @Column(name = "negative_marking") private double negativeMarking;
  @Column(name = "randomize_questions") private boolean randomizeQuestions;
  @Column(name = "randomize_options") private boolean randomizeOptions;
  @Enumerated(EnumType.STRING) @Column(name = "result_visibility", length = 20)
  private VisibilityStatus resultVisibility = VisibilityStatus.PUBLISHED;
  @Enumerated(EnumType.STRING) @Column(name = "leaderboard_visibility", length = 20)
  private VisibilityStatus leaderboardVisibility = VisibilityStatus.PUBLISHED;
  @Enumerated(EnumType.STRING) @Column(nullable = false, length = 32)
  private ExamStatus status = ExamStatus.DRAFT;
  @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();
  @Column(name = "updated_at", nullable = false) private Instant updatedAt = Instant.now();

  public String getId() { return id; }
  public void setId(String id) { this.id = id; }
  public String getTeacherId() { return teacherId; }
  public void setTeacherId(String teacherId) { this.teacherId = teacherId; }
  public String getTitle() { return title; }
  public void setTitle(String title) { this.title = title; }
  public String getSubject() { return subject; }
  public void setSubject(String subject) { this.subject = subject; }
  public String getClassName() { return className; }
  public void setClassName(String className) { this.className = className; }
  public String getTestNumber() { return testNumber; }
  public void setTestNumber(String testNumber) { this.testNumber = testNumber; }
  public int getTotalQuestions() { return totalQuestions; }
  public void setTotalQuestions(int totalQuestions) { this.totalQuestions = totalQuestions; }
  public Instant getStartDate() { return startDate; }
  public void setStartDate(Instant startDate) { this.startDate = startDate; }
  public int getDurationMinutes() { return durationMinutes; }
  public void setDurationMinutes(int durationMinutes) { this.durationMinutes = durationMinutes; }
  public int getTotalMarks() { return totalMarks; }
  public void setTotalMarks(int totalMarks) { this.totalMarks = totalMarks; }
  public double getNegativeMarking() { return negativeMarking; }
  public void setNegativeMarking(double negativeMarking) { this.negativeMarking = negativeMarking; }
  public boolean isRandomizeQuestions() { return randomizeQuestions; }
  public void setRandomizeQuestions(boolean randomizeQuestions) { this.randomizeQuestions = randomizeQuestions; }
  public boolean isRandomizeOptions() { return randomizeOptions; }
  public void setRandomizeOptions(boolean randomizeOptions) { this.randomizeOptions = randomizeOptions; }
  public VisibilityStatus getResultVisibility() { return resultVisibility; }
  public void setResultVisibility(VisibilityStatus resultVisibility) { this.resultVisibility = resultVisibility; }
  public VisibilityStatus getLeaderboardVisibility() { return leaderboardVisibility; }
  public void setLeaderboardVisibility(VisibilityStatus leaderboardVisibility) { this.leaderboardVisibility = leaderboardVisibility; }
  public ExamStatus getStatus() { return status; }
  public void setStatus(ExamStatus status) { this.status = status; }
  public Instant getCreatedAt() { return createdAt; }
  public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
  public Instant getUpdatedAt() { return updatedAt; }
  public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }

  public Instant windowEnd() {
    return startDate.plusSeconds(Math.max(1, durationMinutes) * 60L);
  }
  public boolean isWindowOpen(Instant now) {
    return !now.isBefore(startDate) && now.isBefore(windowEnd());
  }
}
