package com.pusparghya.quizbot.settings;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class SystemSettingsService {
  private final SystemSettingsRepository repo;

  public SystemSettingsService(SystemSettingsRepository repo) {
    this.repo = repo;
  }

  public SystemSettingsEntity get() {
    return repo.findById(1L).orElseGet(() -> repo.save(new SystemSettingsEntity()));
  }

  public Map<String, Object> publicView() {
    SystemSettingsEntity s = get();
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("telegramBotToken", "••••••••");
    m.put("webhookUrl", "");
    m.put("botUsername", s.getBotUsername());
    m.put("botActive", true);
    m.put("autoPublishResults", s.isAutoPublishResults());
    m.put("systemNotice", s.getSystemNotice());
    return m;
  }

  @Transactional
  public Map<String, Object> update(Map<String, Object> body) {
    SystemSettingsEntity s = get();
    if (body.get("systemNotice") != null) s.setSystemNotice(String.valueOf(body.get("systemNotice")));
    if (body.get("autoPublishResults") != null) s.setAutoPublishResults(Boolean.parseBoolean(String.valueOf(body.get("autoPublishResults"))));
    // bot token/username not updatable by teachers
    repo.save(s);
    return publicView();
  }
}
