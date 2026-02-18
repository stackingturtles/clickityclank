const API = "https://discord.com/api/v10";

export type DiscordChannel = { id: string; name: string; type: number; parent_id?: string | null };

async function api<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok) throw new Error(`Discord API ${method} ${path} failed: ${r.status} ${await r.text()}`);
  if (r.status === 204) return undefined as T;
  return (await r.json()) as T;
}

export async function verifyToken(token: string) {
  return api<any>(token, "GET", "/users/@me");
}

export async function listGuildChannels(token: string, guildId: string) {
  return api<DiscordChannel[]>(token, "GET", `/guilds/${guildId}/channels`);
}

export async function createCategory(token: string, guildId: string, name: string) {
  return api<DiscordChannel>(token, "POST", `/guilds/${guildId}/channels`, { name, type: 4 });
}

export async function createTextChannel(token: string, guildId: string, parentId: string, name: string) {
  return api<DiscordChannel>(token, "POST", `/guilds/${guildId}/channels`, {
    name,
    type: 0,
    parent_id: parentId
  });
}

export async function deleteChannel(token: string, channelId: string) {
  return api<any>(token, "DELETE", `/channels/${channelId}`);
}
