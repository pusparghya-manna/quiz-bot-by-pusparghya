package com.pusparghya.quizbot.teacher;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class AuthDtos {
  private AuthDtos() {}
  public record LoginRequest(
      @NotBlank @Size(min = 3, max = 32) String username,
      @NotBlank @Size(min = 8, max = 128) String password) {}
  public record RegisterRequest(
      @NotBlank @Size(min = 3, max = 32) String username,
      @NotBlank @Size(min = 8, max = 128) String password,
      @Size(max = 80) String name) {}
  public record TeacherView(String username, String name) {}
  public record AuthResponse(String token, TeacherView teacher) {}
}
