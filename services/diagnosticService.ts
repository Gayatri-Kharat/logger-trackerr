
import type { DiagnosticSuggestion, Service } from "../types";

// Local heuristic engine replacing external AI dependency
// This runs entirely client-side for privacy and zero-latency.
export async function getDiagnosticAdvice(
  issueDescription: string, 
  availableServices: Service[]
): Promise<DiagnosticSuggestion[]> {
  
  // Simulate analysis computation time for better UX
  await new Promise(resolve => setTimeout(resolve, 600 + Math.random() * 600));

  const text = issueDescription.toLowerCase();
  const suggestions: DiagnosticSuggestion[] = [];

  // 1. Direct Service Name Matching (Dynamic)
  availableServices.forEach(service => {
    // Check if service name or ID appears in the text
    if (text.includes(service.name.toLowerCase()) || text.includes(service.id.toLowerCase())) {
      suggestions.push({
        serviceId: service.id,
        reason: `Log patterns correlate with ${service.name} identifiers.`,
        suggestedLevel: 'DEBUG'
      });
    }
  });

  // 2. Keyword Heuristics for Severity & Domain
  
  // Performance/Latency Issues
  if (text.includes('slow') || text.includes('latency') || text.includes('timeout') || text.includes('hang') || text.includes('lag')) {
    // Heuristic: Pick the service that looks most like an API or Backend if specific one not found
    const target = availableServices.find(s => s.id.includes('api') || s.id.includes('backend')) || availableServices[0];
    
    if (target && !suggestions.find(s => s.serviceId === target.id)) {
      suggestions.push({
        serviceId: target.id,
        reason: "Latency signature detected. Trace-level logging required for bottleneck analysis.",
        suggestedLevel: 'TRACE'
      });
    }
  }

  // Auth/Security Issues
  if (text.includes('auth') || text.includes('login') || text.includes('401') || text.includes('403') || text.includes('token') || text.includes('permission')) {
    const target = availableServices.find(s => s.id.includes('auth') || s.id.includes('identity') || s.id.includes('user')) || availableServices[0];
    
    if (target && !suggestions.find(s => s.serviceId === target.id)) {
       suggestions.push({
        serviceId: target.id,
        reason: "Authentication rejection sequence observed.",
        suggestedLevel: 'DEBUG'
      });
    }
  }

  // Database/Data Issues
  if (text.includes('db') || text.includes('sql') || text.includes('database') || text.includes('query') || text.includes('connection')) {
    const target = availableServices.find(s => s.id.includes('db') || s.id.includes('data') || s.id.includes('inventory')) || availableServices[0];
    
    if (target && !suggestions.find(s => s.serviceId === target.id)) {
       suggestions.push({
        serviceId: target.id,
        reason: "Database connectivity anomaly detected.",
        suggestedLevel: 'WARN'
      });
    }
  }

  // 3. Fallback / Generic Anomaly
  if (suggestions.length === 0 && availableServices.length > 0) {
    // If no specific keywords, suggest checking the first available service as a baseline
    const coreService = availableServices[0];
    suggestions.push({
      serviceId: coreService.id,
      reason: "Unclassified anomaly. Recommended baseline elevation for primary service.",
      suggestedLevel: 'DEBUG'
    });
  }

  // Deduplicate by serviceId and return top 3
  const uniqueSuggestions = Array.from(new Map(suggestions.map(item => [item.serviceId, item])).values());
  return uniqueSuggestions.slice(0, 3);
}
