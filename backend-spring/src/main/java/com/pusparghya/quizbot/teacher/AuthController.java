package com.pusparghya.quizbot.teacher;

import com.pusparghya.quizbot.security.AuthCookieService;
import com.pusparghya.quizbot.security.TeacherPrincipal;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
  private final TeacherAuthService auth;
  private final AuthCookieService cookies;

  public AuthController(TeacherAuthService auth, AuthCookieService cookies) {
    this.auth = auth;
    this.cookies = cookies;
  }

  @PostMapping("/login")
  public AuthDtos.AuthResponse login(
      @Valid @RequestBody AuthDtos.LoginRequest req,
      HttpServletResponse response) {
    AuthDtos.AuthResponse result = auth.login(req);
    cookies.setSessionCookie(response, result.token());
    // Token still returned for API clients; browser should rely on cookie
    return result;
  }

  @PostMapping("/register")
  public AuthDtos.AuthResponse register(
      @Valid @RequestBody AuthDtos.RegisterRequest req,
      HttpServletResponse response) {
    AuthDtos.AuthResponse result = auth.register(req);
    cookies.setSessionCookie(response, result.token());
    return result;
  }

  @PostMapping("/logout")
  public Map<String, Object> logout(HttpServletResponse response) {
    cookies.clearSessionCookie(response);
    return Map.of("ok", true);
  }

  @GetMapping("/me")
  public Map<String, Object> me(@AuthenticationPrincipal TeacherPrincipal principal) {
    return Map.of("teacher", Map.of("username", principal.username(), "name", principal.name()));
  }
}
