export interface AgentProfile {
  id: string;
  designation: string;
  system_prompt: string;
  geometric_avatar_seed: string;
}

export type AgentState = 'PENDING' | 'GATHERING_TELEMETRY' | 'SYNTHESIZING_VECTORS' | 'RESOLVED';

export interface AgentExecutionState {
  profile: AgentProfile;
  state: AgentState;
  result: string | null;
  error?: string;
}

export interface SwarmResponse {
  dossier: string;
}

export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
}

export interface AppConfig {
  providers: {
    openai: ProviderConfig;
    openrouter: ProviderConfig;
    anthropic: ProviderConfig;
    veniceai: ProviderConfig;
    ollama: ProviderConfig;
    lmstudio: ProviderConfig;
    gemini: ProviderConfig;
    [key: string]: ProviderConfig;
  };
  models: {
    orchestrator: { provider: string; model: string };
    specialist: { provider: string; model: string };
    synthesizer: { provider: string; model: string };
  };
}

