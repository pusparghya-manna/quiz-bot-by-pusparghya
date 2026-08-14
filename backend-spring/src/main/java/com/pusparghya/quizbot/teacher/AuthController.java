package com.pusparghya.quizbot.teacher;

import com.pusparghya.quizbot.security.TeacherPrincipal;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
  private final TeacherAuthService auth;

  public AuthController(TeacherAuthService auth) {
    this.auth = auth;
  }

  @PostMapping("/login")
  public AuthDtos.AuthResponse login(@Valid @RequestBody AuthDtos.LoginRequest req) {
    return auth.login(req);
  }

  @PostMapping("/register")
  public AuthDtos.AuthResponse register(@Valid @RequestBody AuthDtos.RegisterRequest req) {
    return auth.register(req);
  }

  @GetMapping("/me")
  public Map<String, Object> me(@AuthenticationPrincipal TeacherPrincipal principal) {
    return Map.of("teacher", Map.of("username", principal.username(), "name", principal.name()));
  }
}
