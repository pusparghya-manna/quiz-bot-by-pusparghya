package com.pusparghya.quizbot.config;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Fail-fast in production when critical secrets are missing/weak.
 * JWT length is also enforced inside JwtService construction.
 */
@Component
public class ProductionSecurityValidator {
  private final boolean production;
  private final String webhookSecret;
  private final String jwtSecret;

  public ProductionSecurityValidator(
      @Value("${app.production:false}") boolean production,
      @Value("${app.telegram.webhook-secret:}") String webhookSecret,
      @Value("${app.jwt.secret}") String jwtSecret) {
    this.production = production;
    this.webhookSecret = webhookSecret;
    this.jwtSecret = jwtSecret;
  }

  @PostConstruct
  public void validate() {
    if (!production) return;
    if (jwtSecret == null || jwtSecret.length() < 24) {
      throw new IllegalStateException(
          "FATAL: app.jwt.secret (JWT_SECRET) must be at least 24 characters in production");
    }
    if (webhookSecret == null || webhookSecret.isBlank()) {
      throw new IllegalStateException(
          "FATAL: app.telegram.webhook-secret (TELEGRAM_WEBHOOK_SECRET) is required in production");
    }
    if (webhookSecret.length() < 16) {
      throw new IllegalStateException(
          "FATAL: TELEGRAM_WEBHOOK_SECRET must be at least 16 characters in production");
    }
  }
}
