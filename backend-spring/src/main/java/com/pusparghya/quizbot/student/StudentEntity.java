package com.pusparghya.quizbot.student;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "students", indexes = {
    @Index(name = "idx_students_telegram", columnList = "telegram_user_id", unique = true)
})
public class StudentEntity {
  @Id @Column(length = 64) private String id;
  @Column(name = "student_code", nullable = false, length = 64) private String studentCode;
  @Column(nullable = false, length = 200) private String name;
  @Column(name = "class_name", length = 120) private String className;
  @Column(name = "telegram_user_id") private Long telegramUserId;
  @Column(name = "telegram_username", length = 120) private String telegramUsername;
  @Column(name = "link_code", length = 32) private String linkCode;
  @Column(nullable = false, length = 20) private String status = "unlinked";
  @Column(name = "linked_at") private Instant linkedAt;
  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "teacher_ids", columnDefinition = "jsonb")
  private List<String> teacherIds = new ArrayList<>();

  public String getId() { return id; }
  public void setId(String id) { this.id = id; }
  public String getStudentCode() { return studentCode; }
  public void setStudentCode(String studentCode) { this.studentCode = studentCode; }
  public String getName() { return name; }
  public void setName(String name) { this.name = name; }
  public String getClassName() { return className; }
  public void setClassName(String className) { this.className = className; }
  public Long getTelegramUserId() { return telegramUserId; }
  public void setTelegramUserId(Long telegramUserId) { this.telegramUserId = telegramUserId; }
  public String getTelegramUsername() { return telegramUsername; }
  public void setTelegramUsername(String telegramUsername) { this.telegramUsername = telegramUsername; }
  public String getLinkCode() { return linkCode; }
  public void setLinkCode(String linkCode) { this.linkCode = linkCode; }
  public String getStatus() { return status; }
  public void setStatus(String status) { this.status = status; }
  public Instant getLinkedAt() { return linkedAt; }
  public void setLinkedAt(Instant linkedAt) { this.linkedAt = linkedAt; }
  public List<String> getTeacherIds() { return teacherIds; }
  public void setTeacherIds(List<String> teacherIds) { this.teacherIds = teacherIds; }
}
