export type TestCase = {
  id: string;
  name: string;
  system: string;
  user: string;
  json: boolean;
  reasoningEffort: "low" | "medium" | "high";
  model: string;
  enableTools?: boolean; // Added tools support
};

const KEY = "api-learning-tool:testcases";

export function loadCases(): TestCase[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TestCase[]) : [];
  } catch {
    return [];
  }
}

export function saveCases(cases: TestCase[]) {
  localStorage.setItem(KEY, JSON.stringify(cases));
}