import { projectController } from "../controllers/project.controller.ts";

export async function projectRoutes(method: string, path: string, query: URLSearchParams, user: never, body: Record<string, unknown>) {
  if (method === "GET" && path === "/api/projects") return projectController.list(query);
  if (method === "PATCH" && path.endsWith("/complete")) return projectController.complete(user, path.split("/").at(-2) ?? "");
  if (method === "GET" && path.startsWith("/api/projects/")) return projectController.detail(path.split("/").at(-1) ?? "");
  if (method === "POST" && path === "/api/projects") return projectController.create(user, body);
  return undefined;
}
