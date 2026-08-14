package com.pusparghya.quizbot;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = {
    "app.telegram.webhook-secret=test-webhook-secret-32chars!!",
    "app.production=false"
})
class WebhookSecurityIntegrationTest {

  @Autowired MockMvc mvc;
  @Autowired ObjectMapper mapper;

  @Test
  void rejectsMissingSecret() throws Exception {
    mvc.perform(post("/api/telegram/webhook")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{}"))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void rejectsWrongSecret() throws Exception {
    mvc.perform(post("/api/telegram/webhook")
            .header("X-Telegram-Bot-Api-Secret-Token", "wrong")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{}"))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void acceptsValidSecret() throws Exception {
    mvc.perform(post("/api/telegram/webhook")
            .header("X-Telegram-Bot-Api-Secret-Token", "test-webhook-secret-32chars!!")
            .contentType(MediaType.APPLICATION_JSON)
            .content(mapper.writeValueAsString(Map.of("update_id", 1))))
        .andExpect(status().isOk());
  }
}
