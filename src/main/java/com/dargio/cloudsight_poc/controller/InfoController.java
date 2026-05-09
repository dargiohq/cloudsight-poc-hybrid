package com.dargio.cloudsight_poc.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class InfoController {

    @GetMapping("/")
    public Map<String, Object> index() {
        return Map.of(
                "application", "cloudsight-poc-hybrid",
                "mode", "hybrid",
                "health", "/health",
                "contract", "/demo/contract",
                "bootstrap", "/demo/bootstrap",
                "audit", "/demo/audit"
        );
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of(
                "status", "ok",
                "application", "cloudsight-poc-hybrid"
        );
    }
}
