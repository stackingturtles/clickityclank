import fs from "node:fs/promises";
import path from "node:path";
import { CLICKITYCLANK_TEMPLATES } from "./paths.js";
import { ensureDir, fileExists } from "./io.js";

const ROLE_MAP: Record<string, string> = {
  fe: "frontend",
  frontend: "frontend",
  be: "backend",
  backend: "backend",
  qa: "qa",
  handoff: "handoff",
  release: "release",
  mobile: "mobile"
};

const DEFAULT_AGENT_TEMPLATE = `# {{project}} {{channel}} Agent\n\nYou are the {{channel}} specialist for {{project}}.\n\n## Focus\n- Deliver high-quality {{channel}} outcomes\n- Keep changes scoped and testable\n- Coordinate through handoff/release channels when needed\n`;

const DEFAULT_SOUL_TEMPLATE = `# SOUL.md\n\nYou are {{agentId}} for {{project}} ({{channel}}).\nStay sharp, specific, and practical.\n`;

export function roleForChannel(channel: string) {
  return ROLE_MAP[channel] ?? channel;
}

export async function seedTemplates() {
  const roles = ["frontend", "backend", "qa", "handoff", "release", "mobile"];
  for (const role of roles) {
    const dir = path.join(CLICKITYCLANK_TEMPLATES, role);
    await ensureDir(dir);
    const agents = path.join(dir, "AGENTS.md");
    const soul = path.join(dir, "SOUL.md");
    if (!(await fileExists(agents))) await fs.writeFile(agents, DEFAULT_AGENT_TEMPLATE, "utf8");
    if (!(await fileExists(soul))) await fs.writeFile(soul, DEFAULT_SOUL_TEMPLATE, "utf8");
  }
}

function render(content: string, vars: Record<string, string>) {
  return content.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}

export async function applyTemplates(opts: {
  project: string;
  channel: string;
  agentId: string;
  workspacePath: string;
  overwrite?: boolean;
}) {
  const role = roleForChannel(opts.channel);
  const roleDir = path.join(CLICKITYCLANK_TEMPLATES, role);
  const srcAgents = path.join(roleDir, "AGENTS.md");
  const srcSoul = path.join(roleDir, "SOUL.md");
  const dstAgents = path.join(opts.workspacePath, "AGENTS.md");
  const dstSoul = path.join(opts.workspacePath, "SOUL.md");

  if (!(await fileExists(srcAgents)) || !(await fileExists(srcSoul))) {
    throw new Error(`Missing templates for role '${role}' at ${roleDir}`);
  }

  const vars = { project: opts.project, channel: opts.channel, agentId: opts.agentId };
  const actions: string[] = [];

  for (const [src, dst, label] of [
    [srcAgents, dstAgents, "AGENTS.md"],
    [srcSoul, dstSoul, "SOUL.md"]
  ] as const) {
    const exists = await fileExists(dst);
    if (exists && !opts.overwrite) {
      actions.push(`templates.skip:${opts.channel}/${label}`);
      continue;
    }
    const raw = await fs.readFile(src, "utf8");
    await fs.writeFile(dst, render(raw, vars), "utf8");
    actions.push(`${exists ? "templates.overwrite" : "templates.create"}:${opts.channel}/${label}`);
  }

  return actions;
}
