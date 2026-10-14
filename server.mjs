import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const gitlabBase = (process.env.GITLAB_URL || "https://gitlab.com").replace(/\/+$/, "");
const profilePageSize = 100;

function inferLevel(title = "") {
  const text = title.toLowerCase();
  if (/\b(head|director|vp|vice president|chief|principal|staff|lead|manager)\b/.test(text)) return "Lead";
  if (/\b(senior|sr\.?|iii|3)\b/.test(text)) return "Senior";
  if (/\b(junior|jr\.?|entry|intern|graduate|associate|i|1)\b/.test(text)) return "Entry";
  if (text.trim()) return "Mid";
  return "Unspecified";
}

async function gitlab(path, token) {
  const response = await fetch(`${gitlabBase}/api/v4${path}`, {
    headers: { "PRIVATE-TOKEN": token, Accept: "application/json" },
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) {
    const error = new Error(`GitLab API returned ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function hydrateUsers(users, token) {
  const results = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(6, users.length) }, async () => {
    while (cursor < users.length) {
      const user = users[cursor++];
      try {
        const profile = await gitlab(`/users/${encodeURIComponent(user.id)}`, token);
        results.push({
          name: profile.name || user.name || user.username,
          username: profile.username || user.username,
          web_url: profile.web_url || user.web_url,
          avatar_url: profile.avatar_url || user.avatar_url || "",
          location: profile.location || "",
          job_title: profile.job_title || "",
          public_email: profile.public_email || ""
        });
      } catch {
        // Skip inaccessible profiles and never fall back to private or commit email fields.
      }
    }
  });
  await Promise.all(workers);
  return results;
}

function json(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  response.end(JSON.stringify(data));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (url.pathname === "/api/search" && request.method === "GET") {
    const token = (request.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
    if (!token || token.length > 500) return json(response, 401, { error: "Enter a valid GitLab personal access token in the token field." });
    const location = (url.searchParams.get("location") || "").trim();
    if (location.length < 2 || location.length > 100) return json(response, 400, { error: "Enter a location (2-100 characters)." });
    const title = (url.searchParams.get("title") || "").trim().toLocaleLowerCase();
    if (title.length > 100) return json(response, 400, { error: "Job title must be 100 characters or fewer." });
    const wantedLevel = url.searchParams.get("level") || "";
    try {
      const params = new URLSearchParams({ page: "1", per_page: String(profilePageSize), humans: "true", active: "true", exclude_internal: "true" });
      const users = await gitlab(`/users?${params}`, token);
      const profiles = await hydrateUsers(Array.isArray(users) ? users : [], token);
      const wantedLocation = location.toLocaleLowerCase();
      const people = profiles.map(profile => ({ ...profile, level: inferLevel(profile.job_title) }))
        .filter(profile => /^[^@\s]+@gmail\.com$/i.test(profile.public_email)
          && profile.location.toLocaleLowerCase().includes(wantedLocation)
          && (!title || profile.job_title.toLocaleLowerCase().includes(title))
          && (!wantedLevel || profile.level === wantedLevel));
      return json(response, 200, { people, checked: profiles.length });
    } catch (error) {
      const detail = error.status === 401 || error.status === 403
        ? "GitLab rejected the token. Check that it is valid and has read_api access."
        : error.status === 429
          ? "GitLab rate limit reached. Wait a little, then try again."
          : error.name === "TimeoutError" || error.name === "AbortError"
            ? "GitLab did not respond in time. Try again."
            : "Could not reach GitLab. Check the GitLab URL and network, then try again.";
      return json(response, 502, { error: detail });
    }
  }
  if (request.method !== "GET") return json(response, 405, { error: "Method not allowed." });
  if (url.pathname !== "/" && url.pathname !== "/index.html") return json(response, 404, { error: "Not found." });
  try {
    const html = await readFile(join(root, "index.html"));
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
    response.end(html);
  } catch {
    json(response, 500, { error: "Could not read index.html." });
  }
});

server.listen(port, () => console.log(`Find GitLab people is running at http://localhost:${port}`));
