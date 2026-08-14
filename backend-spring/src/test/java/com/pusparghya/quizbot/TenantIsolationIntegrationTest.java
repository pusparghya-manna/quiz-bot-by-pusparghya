package com.pusparghya.quizbot;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;
import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class TenantIsolationIntegrationTest {

  @Autowired MockMvc mvc;
  @Autowired ObjectMapper mapper;

  private String register(String user) throws Exception {
    MvcResult res = mvc.perform(post("/api/auth/register")
            .contentType(MediaType.APPLICATION_JSON)
            .content(mapper.writeValueAsString(Map.of(
                "username", user, "password", "password123", "name", user))))
        .andExpect(status().isOk())
        .andReturn();
    return mapper.readTree(res.getResponse().getContentAsString()).get("token").asText();
  }

  private String createExam(String token, String title) throws Exception {
    String body = mapper.writeValueAsString(Map.of(
        "title", title,
        "status", "DRAFT",
        "durationMinutes", 30,
        "questions", List.of(Map.of(
            "question", "Q1?",
            "options", List.of("A", "B", "C", "D"),
            "answer", 0,
            "marks", 1
        ))
    ));
    MvcResult res = mvc.perform(post("/api/exams")
            .header("Authorization", "Bearer " + token)
            .contentType(MediaType.APPLICATION_JSON)
            .content(body))
        .andExpect(status().isOk())
        .andReturn();
    JsonNode json = mapper.readTree(res.getResponse().getContentAsString());
    return json.has("id") ? json.get("id").asText() : json.get("exam").get("id").asText();
  }

  @Test
  void teacherBCannotAccessTeacherAExam() throws Exception {
    String tokenA = register("iso_teacher_a");
    String tokenB = register("iso_teacher_b");
    String examId = createExam(tokenA, "A private exam");

    mvc.perform(get("/api/exams/" + examId).header("Authorization", "Bearer " + tokenB))
        .andExpect(status().isNotFound());

    mvc.perform(put("/api/exams/" + examId)
            .header("Authorization", "Bearer " + tokenB)
            .contentType(MediaType.APPLICATION_JSON)
            .content(mapper.writeValueAsString(Map.of("title", "Hijacked"))))
        .andExpect(status().isNotFound());

    mvc.perform(delete("/api/exams/" + examId).header("Authorization", "Bearer " + tokenB))
        .andExpect(status().isNotFound());

    mvc.perform(get("/api/leaderboard").param("examId", examId)
            .header("Authorization", "Bearer " + tokenB))
        .andExpect(status().isNotFound());

    // Owner still can
    mvc.perform(get("/api/exams/" + examId).header("Authorization", "Bearer " + tokenA))
        .andExpect(status().isOk());
  }

  @Test
  void loginFailures() throws Exception {
    register("login_user_x");
    mvc.perform(post("/api/auth/login")
            .contentType(MediaType.APPLICATION_JSON)
            .content(mapper.writeValueAsString(Map.of("username", "login_user_x", "password", "wrong-password"))))
        .andExpect(status().isUnauthorized());
  }
}
