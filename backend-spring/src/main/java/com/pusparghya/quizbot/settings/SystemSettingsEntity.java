package com.pusparghya.quizbot.settings;

import jakarta.persistence.*;

@Entity
@Table(name = "system_settings")
public class SystemSettingsEntity {
  @Id private Long id = 1L;
  @Column(name = "bot_username", length = 120) private String botUsername = "@quizbotbypusparghya_bot";
  @Column(name = "system_notice", columnDefinition = "text") private String systemNotice = "";
  @Column(name = "bot_active") private boolean botActive = true;
  @Column(name = "auto_publish_results") private boolean autoPublishResults = true;

  public Long getId() { return id; }
  public String getBotUsername() { return botUsername; }
  public void setBotUsername(String botUsername) { this.botUsername = botUsername; }
  public String getSystemNotice() { return systemNotice; }
  public void setSystemNotice(String systemNotice) { this.systemNotice = systemNotice; }
  public boolean isBotActive() { return botActive; }
  public void setBotActive(boolean botActive) { this.botActive = botActive; }
  public boolean isAutoPublishResults() { return autoPublishResults; }
  public void setAutoPublishResults(boolean autoPublishResults) { this.autoPublishResults = autoPublishResults; }
}
