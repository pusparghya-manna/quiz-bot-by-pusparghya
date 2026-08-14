package com.pusparghya.quizbot.common;

public final class CsvUtil {
  private CsvUtil() {}
  public static String cell(Object value) {
    String s = value == null ? "" : String.valueOf(value);
    if (!s.isEmpty() && ("=+-@\t\r".indexOf(s.charAt(0)) >= 0 || s.startsWith("=") || s.startsWith("+") || s.startsWith("-") || s.startsWith("@"))) {
      s = "'" + s;
    }
    s = s.replace("\"", "\"\"");
    return "\"" + s + "\"";
  }
}
