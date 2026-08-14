package com.pusparghya.quizbot.common;

import java.util.UUID;

public final class Ids {
  private Ids() {}
  public static String exam() { return "EXAM_" + System.currentTimeMillis() + "_" + (int)(Math.random()*1000); }
  public static String question() { return "QB_" + System.currentTimeMillis() + "_" + (int)(Math.random()*1000); }
  public static String student() { return "STU_" + UUID.randomUUID().toString().substring(0, 8); }
  public static String attempt() { return "ATT_" + System.currentTimeMillis() + "_" + (int)(Math.random()*1000); }
  public static String studentCode() { return "TG-" + UUID.randomUUID().toString().substring(0, 6).toUpperCase(); }
  public static String linkCode() { return "LINK-" + (10000 + (int)(Math.random()*90000)); }
}
