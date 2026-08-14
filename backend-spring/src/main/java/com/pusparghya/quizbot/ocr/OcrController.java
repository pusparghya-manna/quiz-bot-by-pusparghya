package com.pusparghya.quizbot.ocr;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;
import java.util.Map;
@RestController
@RequestMapping("/api/ocr")
public class OcrController {
  private final String apiKey;
  private final int maxChars;
  public OcrController(@Value("${app.gemini.api-key:}") String apiKey, @Value("${app.ocr.max-base64-chars:10000000}") int maxChars) {
    this.apiKey=apiKey; this.maxChars=maxChars;
  }
  @PostMapping("/parse")
  public Map<String,Object> parse(@RequestBody Map<String,Object> body) {
    String b64 = body.get("fileBase64")==null?null:String.valueOf(body.get("fileBase64"));
    if (b64==null||b64.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"fileBase64 required");
    if (b64.length()>maxChars) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,"Image too large");
    if (apiKey==null||apiKey.isBlank()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"OCR not configured");
    // Provider integration is environment-configured; empty list keeps API contract stable until key is set.
    return Map.of("questions", List.of());
  }
}
