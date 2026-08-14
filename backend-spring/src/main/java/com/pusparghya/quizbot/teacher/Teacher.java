package com.pusparghya.quizbot.teacher;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "teachers")
public class Teacher {
  @Id
  @Column(length = 64)
  private String username;
  @Column(nullable = false, length = 120)
  private String name;
  @Column(name = "password_hash", nullable = false, length = 200)
  private String passwordHash;
  @Column(name = "created_at", nullable = false)
  private Instant createdAt = Instant.now();

  public String getUsername() { return username; }
  public void setUsername(String username) { this.username = username; }
  public String getName() { return name; }
  public void setName(String name) { this.name = name; }
  public String getPasswordHash() { return passwordHash; }
  public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }
  public Instant getCreatedAt() { return createdAt; }
  public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
