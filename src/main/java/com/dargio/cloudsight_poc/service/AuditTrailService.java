package com.dargio.cloudsight_poc.service;

import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class AuditTrailService {

    private static final int MAX_EVENTS = 300;

    private final Deque<Map<String, Object>> events = new ArrayDeque<>();

    public synchronized void record(Map<String, Object> event) {
        Map<String, Object> enriched = new LinkedHashMap<>(event);
        enriched.put("recordedAt", Instant.now().toString());
        events.addFirst(enriched);
        while (events.size() > MAX_EVENTS) {
            events.removeLast();
        }
    }

    public synchronized List<Map<String, Object>> events() {
        return new ArrayList<>(events);
    }
}
