package com.pusparghya.quizbot.telegram;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import okhttp3.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.io.IOException;
import java.util.Map;
import java.util.concurrent.TimeUnit;
@Component
public class TelegramClient {
  private static final Logger log = LoggerFactory.getLogger(TelegramClient.class);
  private final OkHttpClient http = new OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS).readTimeout(70, TimeUnit.SECONDS).build();
  private final ObjectMapper mapper;
  private final String token;
  private final String base;
  public TelegramClient(ObjectMapper mapper, @Value("${app.telegram.bot-token:}") String token) {
    this.mapper = mapper; this.token = token == null ? "" : token; this.base = "https://api.telegram.org/bot" + this.token + "/";
  }
  public boolean isConfigured() { return token != null && !token.isBlank(); }
  public JsonNode getUpdates(long offset, int timeout) throws IOException {
    Request req = new Request.Builder().url(base + "getUpdates?offset=" + offset + "&timeout=" + timeout).get().build();
    try (Response res = http.newCall(req).execute()) {
      if (!res.isSuccessful() || res.body() == null) return mapper.createObjectNode();
      return mapper.readTree(res.body().string());
    }
  }
  public void sendMessage(long chatId, String text, Object replyMarkup) {
    post("sendMessage", Map.of("chat_id", chatId, "text", text, "parse_mode", "Markdown", "reply_markup", replyMarkup == null ? Map.of() : replyMarkup));
  }
  public void editMessageText(long chatId, long messageId, String text, Object replyMarkup) {
    post("editMessageText", Map.of("chat_id", chatId, "message_id", messageId, "text", text, "parse_mode", "Markdown", "reply_markup", replyMarkup == null ? Map.of() : replyMarkup));
  }
  public void answerCallback(String callbackId) { post("answerCallbackQuery", Map.of("callback_query_id", callbackId)); }
  private void post(String method, Map<String, Object> body) {
    if (!isConfigured()) return;
    try {
      RequestBody rb = RequestBody.create(mapper.writeValueAsBytes(body), MediaType.parse("application/json"));
      try (Response res = http.newCall(new Request.Builder().url(base + method).post(rb).build()).execute()) {
        if (!res.isSuccessful()) log.warn("Telegram {} failed: {}", method, res.code());
      }
    } catch (Exception e) { log.warn("Telegram {} error: {}", method, e.toString()); }
  }
}
