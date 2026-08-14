package com.pusparghya.quizbot.settings;

import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/settings")
public class SettingsController {
  private final SystemSettingsService settings;
  public SettingsController(SystemSettingsService settings) { this.settings = settings; }

  @GetMapping
  public Map<String, Object> get() { return settings.publicView(); }

  @PutMapping
  public Map<String, Object> put(@RequestBody Map<String, Object> body) { return settings.update(body); }

  @PostMapping
  public Map<String, Object> post(@RequestBody Map<String, Object> body) { return settings.update(body); }
}
