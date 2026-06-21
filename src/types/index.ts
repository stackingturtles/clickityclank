export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export type RuntimeKind = "openclaw" | "hermes";

export type HermesPriority = "normal" | "fast";
export type HermesReasoning = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type HermesModelPolicy = {
  provider?: string;
  default?: string;
};

export type HermesRuntimePolicy = {
  priority?: HermesPriority;
  reasoning?: HermesReasoning;
  model?: HermesModelPolicy;
  toolsets?: string[];
  maxTurns?: number;
};

export type HermesModeDefinition = HermesRuntimePolicy & {
  description?: string;
};

export type HermesManifestDefaults = {
  mode?: string;
};

export type MapEntry = {
  channel: string;
  agentId: string;
  accountId?: string;

  // Hermes-only routing hints. These are optional so existing OpenClaw manifests remain valid.
  profile?: string;
  skills?: string[];
  workdir?: string;
  contextFile?: string;

  // Hermes runtime policy hints. These become effective only for Hermes projects.
  mode?: string;
  priority?: HermesPriority;
  reasoning?: HermesReasoning;
  model?: HermesModelPolicy;
  toolsets?: string[];
  maxTurns?: number;
};

export type ProjectManifest = {
  project: string;
  runtime?: RuntimeKind;
  repo?: string;
  contextFile?: string;
  defaults?: HermesManifestDefaults;
  modes?: Record<string, HermesModeDefinition>;
  maps: MapEntry[];
};

export type HermesRoute = {
  project: string;
  channel: string;
  agentId: string;
  profile: string;
  skills: string[];
  workdir: string;
  contextFile: string;
  sessionKeyMode: "channel" | "user";
  mode?: string;
  runtime?: HermesRuntimePolicy;
};

export type HermesRoutesFile = {
  schemaVersion: 1;
  routes: Record<string, HermesRoute>;
};

export type HermesConfigFragment = {
  group_sessions_per_user: boolean;
  skills: {
    external_dirs: string[];
  };
  channel_routes?: Record<
    string,
    {
      project: string;
      channel: string;
      profile: string;
      workdir: string;
      context_file: string;
      skills: string[];
      mode?: string;
      runtime?: HermesRuntimePolicy;
    }
  >;
  discord: {
    require_mention: boolean;
    free_response_channels: string[];
    no_thread_channels: string[];
    auto_thread: boolean;
    reply_to_mode: "off" | "first" | "all";
    allow_mentions: {
      everyone: boolean;
      roles: boolean;
      users: boolean;
      replied_user: boolean;
    };
    channel_prompts: Record<string, string>;
    channel_skill_bindings: { id: string; skills: string[] }[];
  };
};

export type GlobalState = {
  version: 1;
  projects: Record<
    string,
    {
      runtime?: RuntimeKind;
      guildId: string;
      categoryId: string;
      channelIds: Record<string, string>;
      workspacePaths: Record<string, string>;
      maps: MapEntry[];
      repo?: string;
      contextFile?: string;
      hermesRoutesFile?: string;
      hermesConfigFragment?: string;
      updatedAt: string;
    }
  >;
};

export type Plan = {
  discord: { create: string[]; delete: string[] };
  openclaw: { patch: string[] };
  hermes: { patch: string[] };
  filesystem: { create: string[]; delete: string[] };
};
