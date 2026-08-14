package com.pusparghya.quizbot.telegram;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/telegram")
public class TelegramWebhookController {
  private final TelegramUpdateService updates;
  private final String webhookSecret;
  private final boolean production;

  public TelegramWebhookController(
      TelegramUpdateService updates,
      @Value("${app.telegram.webhook-secret:}") String webhookSecret,
      @Value("${app.production:false}") boolean production) {
    this.updates = updates;
    this.webhookSecret = webhookSecret == null ? "" : webhookSecret;
    this.production = production;
  }

  @PostMapping("/webhook")
  public ResponseEntity<?> webhook(
      @RequestHeader(value = "X-Telegram-Bot-Api-Secret-Token", required = false) String secret,
      @RequestBody JsonNode body) {
    // When secret is configured (always required in production via ProductionSecurityValidator),
    // reject missing/wrong tokens.
    if (!webhookSecret.isBlank()) {
      if (secret == null || !webhookSecret.equals(secret)) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
            .body(Map.of("error", "Invalid webhook secret"));
      }
    } else if (production) {
      // Defense in depth if validator somehow skipped
      return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
          .body(Map.of("error", "Webhook secret not configured"));
    }
    try {
      updates.process(body);
    } catch (Exception ignored) {
    }
    return ResponseEntity.ok(Map.of("ok", true));
  }

  @PostMapping("/simulate")
  public ResponseEntity<?> simulate(@RequestBody JsonNode body) {
    if (production) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN)
          .body(Map.of("error", "Simulator disabled in production"));
    }
    updates.process(body);
    return ResponseEntity.ok(Map.of("status", "ok"));
  }
}
