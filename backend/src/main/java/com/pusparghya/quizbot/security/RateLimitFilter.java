package com.pusparghya.quizbot.security;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class RateLimitFilter extends OncePerRequestFilter {
  private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

  private Bucket bucket(String key, long capacity, Duration window) {
    return buckets.computeIfAbsent(key, k -> Bucket.builder()
        .addLimit(Bandwidth.builder().capacity(capacity).refillGreedy(capacity, window).build())
        .build());
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    String path = request.getRequestURI();
    String ip = request.getRemoteAddr();
    Bucket b = null;
    if (path.startsWith("/api/auth/login") || path.startsWith("/api/auth/register")) {
      b = bucket("auth:" + ip, 30, Duration.ofMinutes(15));
    } else if (path.startsWith("/api/ocr/parse")) {
      b = bucket("ocr:" + ip, 20, Duration.ofMinutes(15));
    }
    if (b != null && !b.tryConsume(1)) {
      response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
      response.setContentType("application/json");
      response.getWriter().write("{\"error\":\"Too many requests. Try again later.\"}");
      return;
    }
    chain.doFilter(request, response);
  }
}
