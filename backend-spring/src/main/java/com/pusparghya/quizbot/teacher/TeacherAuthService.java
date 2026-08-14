package com.pusparghya.quizbot.teacher;

import com.pusparghya.quizbot.exception.ApiException;
import com.pusparghya.quizbot.security.JwtService;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.regex.Pattern;

@Service
public class TeacherAuthService {
  private static final Pattern USER = Pattern.compile("^[a-zA-Z0-9_]{3,32}$");
  private final TeacherRepository teachers;
  private final PasswordEncoder encoder;
  private final JwtService jwt;

  public TeacherAuthService(TeacherRepository teachers, PasswordEncoder encoder, JwtService jwt) {
    this.teachers = teachers;
    this.encoder = encoder;
    this.jwt = jwt;
  }

  @Transactional
  public AuthDtos.AuthResponse register(AuthDtos.RegisterRequest req) {
    String u = req.username().trim();
    if (!USER.matcher(u).matches()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Username: 3–32 letters, numbers, underscore only");
    }
    if (teachers.existsByUsername(u)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Username already taken");
    }
    Teacher t = new Teacher();
    t.setUsername(u);
    t.setName(req.name() == null || req.name().isBlank() ? u : req.name().trim());
    t.setPasswordHash(encoder.encode(req.password()));
    t.setCreatedAt(Instant.now());
    teachers.save(t);
    String token = jwt.createToken(t.getUsername(), t.getName());
    return new AuthDtos.AuthResponse(token, new AuthDtos.TeacherView(t.getUsername(), t.getName()));
  }

  public AuthDtos.AuthResponse login(AuthDtos.LoginRequest req) {
    Teacher t = teachers.findByUsername(req.username().trim())
        .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Invalid username or password"));
    if (!encoder.matches(req.password(), t.getPasswordHash())) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid username or password");
    }
    String token = jwt.createToken(t.getUsername(), t.getName());
    return new AuthDtos.AuthResponse(token, new AuthDtos.TeacherView(t.getUsername(), t.getName()));
  }
}
