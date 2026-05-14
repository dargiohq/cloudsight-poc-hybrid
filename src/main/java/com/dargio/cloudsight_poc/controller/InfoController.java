package com.dargio.cloudsight_poc.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.servlet.view.RedirectView;

import java.util.Map;

@Controller
public class InfoController {

    @GetMapping("/")
    public RedirectView index() {
        return new RedirectView("/console.html");
    }

    @GetMapping("/api/info")
    @ResponseBody
    public Map<String, Object> info() {
        return Map.of(
                "application", "cloudsight-poc-hybrid",
                "mode", "hybrid",
                "console", "/console.html",
                "health", "/health",
                "contract", "/demo/contract",
                "bootstrap", "/demo/bootstrap",
                "bootstrapRealtime", "/demo/bootstrap/realtime",
                "audit", "/demo/audit",
                "overview", "/demo/overview",
                "scenarios", "/demo/scenarios"
        );
    }

    @GetMapping("/health")
    @ResponseBody
    public Map<String, String> health() {
        return Map.of(
                "status", "ok",
                "application", "cloudsight-poc-hybrid"
        );
    }
}
