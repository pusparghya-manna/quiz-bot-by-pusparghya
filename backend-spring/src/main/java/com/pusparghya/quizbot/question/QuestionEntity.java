package com.pusparghya.quizbot.question;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "questions", indexes = {
    @Index(name = "idx_questions_exam", columnList = "exam_id"),
    @Index(name = "idx_questions_teacher", columnList = "teacher_id")
})
public class QuestionEntity {
  @Id @Column(length = 64) private String id;
  @Column(name = "exam_id", length = 64) private String examId;
  @Column(name = "teacher_id", length = 64) private String teacherId;
  @Column(nullable = false, columnDefinition = "text") private String question;
  @JdbcTypeCode(SqlTypes.JSON)
  @Column(nullable = false, columnDefinition = "jsonb")
  private List<String> options = new ArrayList<>();
  private Integer answer;
  private double marks = 1;
  @Column(name = "negative_marks") private double negativeMarks;
  @Column(columnDefinition = "text") private String explanation;
  @Column(length = 120) private String subject;
  @Column(name = "sort_order") private int sortOrder;

  public String getId() { return id; }
  public void setId(String id) { this.id = id; }
  public String getExamId() { return examId; }
  public void setExamId(String examId) { this.examId = examId; }
  public String getTeacherId() { return teacherId; }
  public void setTeacherId(String teacherId) { this.teacherId = teacherId; }
  public String getQuestion() { return question; }
  public void setQuestion(String question) { this.question = question; }
  public List<String> getOptions() { return options; }
  public void setOptions(List<String> options) { this.options = options; }
  public Integer getAnswer() { return answer; }
  public void setAnswer(Integer answer) { this.answer = answer; }
  public double getMarks() { return marks; }
  public void setMarks(double marks) { this.marks = marks; }
  public double getNegativeMarks() { return negativeMarks; }
  public void setNegativeMarks(double negativeMarks) { this.negativeMarks = negativeMarks; }
  public String getExplanation() { return explanation; }
  public void setExplanation(String explanation) { this.explanation = explanation; }
  public String getSubject() { return subject; }
  public void setSubject(String subject) { this.subject = subject; }
  public int getSortOrder() { return sortOrder; }
  public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }
}
