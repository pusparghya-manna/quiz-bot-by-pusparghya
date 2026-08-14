package com.pusparghya.quizbot;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class QuizBotApplication {
  public static void main(String[] args) {
    SpringApplication.run(QuizBotApplication.class, args);
  }
}
