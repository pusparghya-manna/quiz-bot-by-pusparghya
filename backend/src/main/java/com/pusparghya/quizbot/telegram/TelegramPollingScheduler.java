package com.pusparghya.quizbot.telegram;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger; import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
@Component
@ConditionalOnProperty(name="app.telegram.polling-enabled", havingValue="true", matchIfMissing=true)
public class TelegramPollingScheduler {
  private static final Logger log = LoggerFactory.getLogger(TelegramPollingScheduler.class);
  private final TelegramClient client; private final TelegramUpdateService updates; private long offset;
  public TelegramPollingScheduler(TelegramClient client, TelegramUpdateService updates) { this.client=client; this.updates=updates; }
  @Scheduled(fixedDelay=500)
  public void poll() {
    if (!client.isConfigured()) return;
    try {
      JsonNode root = client.getUpdates(offset, 25);
      JsonNode result = root.get("result");
      if (result == null || !result.isArray()) return;
      for (JsonNode u : result) {
        offset = u.get("update_id").asLong() + 1;
        try { updates.process(u); } catch (Exception e) { log.warn("Update failed: {}", e.toString()); }
      }
    } catch (Exception e) { log.debug("poll: {}", e.toString()); }
  }
}
