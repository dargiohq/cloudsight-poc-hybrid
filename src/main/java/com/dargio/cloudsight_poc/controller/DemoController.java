package com.dargio.cloudsight_poc.controller;

import com.dargio.cloudsight_poc.service.CloudSightHybridClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/demo")
public class DemoController {

    private final CloudSightHybridClient cloudSightHybridClient;

    public DemoController(CloudSightHybridClient cloudSightHybridClient) {
        this.cloudSightHybridClient = cloudSightHybridClient;
    }

    @GetMapping("/contract")
    public Map<String, Object> contract() {
        return cloudSightHybridClient.contract();
    }

    @GetMapping("/overview")
    public Map<String, Object> overview() {
        return cloudSightHybridClient.overview();
    }

    @GetMapping("/scenarios")
    public List<Map<String, Object>> scenarios() {
        return cloudSightHybridClient.scenarios();
    }

    @PostMapping("/bootstrap")
    public Map<String, Object> bootstrap(
            @RequestParam(defaultValue = "1") int eventsPerProfile,
            @RequestParam(defaultValue = "14") int spreadDays
    ) {
        return cloudSightHybridClient.bootstrap(eventsPerProfile, spreadDays);
    }

    @PostMapping("/bootstrap/realtime")
    public Map<String, Object> bootstrapRealtimeCollectors() {
        return cloudSightHybridClient.bootstrapRealtimeCollectors();
    }

    @PostMapping("/scenarios/{scenarioId}/run")
    public Map<String, Object> runScenario(
            @org.springframework.web.bind.annotation.PathVariable String scenarioId,
            @RequestParam(defaultValue = "true") boolean verify
    ) {
        return cloudSightHybridClient.runScenario(scenarioId, verify);
    }

    @GetMapping("/audit")
    public List<Map<String, Object>> audit() {
        return cloudSightHybridClient.audit();
    }
}
