package com.pusparghya.quizbot;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import java.util.Map;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AuthIntegrationTest {
  @Autowired MockMvc mvc;
  @Autowired ObjectMapper mapper;
  @Test void registerLoginMeAndOwnership() throws Exception {
    String body = mapper.writeValueAsString(Map.of("username","teacher_a","password","password123","name","A"));
    mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content(body))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.token").isString());
    String login = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content(mapper.writeValueAsString(Map.of("username","teacher_a","password","password123"))))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();
    String token = mapper.readTree(login).get("token").asText();
    mvc.perform(get("/api/auth/me").header("Authorization","Bearer "+token))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.teacher.username").value("teacher_a"));
    mvc.perform(get("/api/exams")).andExpect(status().isForbidden());
    mvc.perform(get("/api/exams").header("Authorization","Bearer "+token)).andExpect(status().isOk());
  }
}
