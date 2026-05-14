package com.dargio.cloudsight_poc.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.servlet.view.RedirectView;

import java.util.LinkedHashMap;
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
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("application", "cloudsight-poc-hybrid");
        info.put("mode", "hybrid");
        info.put("console", "/console.html");
        info.put("health", "/health");
        info.put("contract", "/demo/contract");
        info.put("bootstrap", "/demo/bootstrap");
        info.put("bootstrapRealtime", "/demo/bootstrap/realtime");
        info.put("audit", "/demo/audit");
        info.put("overview", "/demo/overview");
        info.put("scenarios", "/demo/scenarios");
        info.put("liveSetup", "/demo/live/setup");
        info.put("catalogs", "/demo/catalogs");
        info.put("liveRun", "/demo/live/providers/{provider}/run");
        return info;
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
