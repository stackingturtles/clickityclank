export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export type MapEntry = {
  channel: string;
  agentId: string;
};

export type ProjectManifest = {
  project: string;
  maps: MapEntry[];
};

export type GlobalState = {
  version: 1;
  projects: Record<
    string,
    {
      guildId: string;
      categoryId: string;
      channelIds: Record<string, string>;
      workspacePaths: Record<string, string>;
      maps: MapEntry[];
      updatedAt: string;
    }
  >;
};

export type Plan = {
  discord: { create: string[]; delete: string[] };
  openclaw: { patch: string[] };
  filesystem: { create: string[]; delete: string[] };
};
