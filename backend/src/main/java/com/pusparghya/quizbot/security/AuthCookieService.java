package com.pusparghya.quizbot.security;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Service;

import java.time.Duration;

@Service
public class AuthCookieService {
  private final boolean production;
  private final long ttlSeconds;

  public AuthCookieService(
      @Value("${app.production:false}") boolean production,
      @Value("${app.jwt.ttl-seconds:604800}") long ttlSeconds) {
    this.production = production;
    this.ttlSeconds = ttlSeconds;
  }

  public void setSessionCookie(HttpServletResponse response, String token) {
    ResponseCookie cookie = ResponseCookie.from(JwtAuthFilter.COOKIE_NAME, token)
        .httpOnly(true)
        .secure(production) // Secure in production (HTTPS)
        .path("/")
        .maxAge(Duration.ofSeconds(ttlSeconds))
        .sameSite("Lax")
        .build();
    response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
  }

  public void clearSessionCookie(HttpServletResponse response) {
    ResponseCookie cookie = ResponseCookie.from(JwtAuthFilter.COOKIE_NAME, "")
        .httpOnly(true)
        .secure(production)
        .path("/")
        .maxAge(Duration.ZERO)
        .sameSite("Lax")
        .build();
    response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
  }
}
