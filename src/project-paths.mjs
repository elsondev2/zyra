import path from "node:path";

const PROJECT_DATA_DIRECTORY = ".zyra";

export function getProjectDataDir(project = process.cwd()) {
  return path.join(path.resolve(project), PROJECT_DATA_DIRECTORY);
}

export function getProjectSessionsDir(project = process.cwd()) {
  return path.join(getProjectDataDir(project), "sessions");
}
