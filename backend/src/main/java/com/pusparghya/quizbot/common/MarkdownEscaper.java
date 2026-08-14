package com.pusparghya.quizbot.common;

public final class MarkdownEscaper {
  private MarkdownEscaper() {}
  public static String escape(String text) {
    if (text == null) return "";
    return text.replaceAll("([_*\\`\\[\\]()])", "\\\\$1");
  }
}
