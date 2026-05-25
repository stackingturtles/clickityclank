export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export type RuntimeKind = "openclaw" | "hermes";

export type MapEntry = {
  channel: string;
  agentId: string;
  accountId?: string;

  // Hermes-only routing hints. These are optional so existing OpenClaw manifests remain valid.
  profile?: string;
  skills?: string[];
  workdir?: string;
  contextFile?: string;
};

export type ProjectManifest = {
  project: string;
  runtime?: RuntimeKind;
  repo?: string;
  contextFile?: string;
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
};

export type HermesRoutesFile = {
  schemaVersion: 1;
  routes: Record<string, HermesRoute>;
};

export type HermesConfigFragment = {
  group_sessions_per_user: boolean;
  discord: {
    require_mention: boolean;
    free_response_channels: string[];
    no_thread_channels: string[];
    channel_prompts: Record<string, string>;
  };
  gateway: {
    platforms: {
      discord: {
        extra: {
          channel_skill_bindings: { id: string; skills: string[] }[];
        };
      };
    };
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
