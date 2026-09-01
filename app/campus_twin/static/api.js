async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  let body = null;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok) {
    const detail = body?.detail || body?.message || `${response.status} ${response.statusText}`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return body;
}

export const api = {
  health: () => request("/api/health"),
  summary: () => request("/api/twin/summary"),
  topology: () => request("/api/twin/topology"),
  rooms: () => request("/api/twin/rooms"),
  schedule: () => request("/api/twin/schedule"),
  energy: () => request("/api/twin/energy"),
  quality: () => request("/api/data/quality"),
  priorities: () => request("/api/ops/priorities"),
  interactions: () => request("/api/ops/interactions"),
  simulate: (payload) => request("/api/scenarios/simulate", { method: "POST", body: JSON.stringify(payload) }),
  scenarioHistory: () => request("/api/scenarios/history"),
  scenarioCompare: () => request("/api/scenarios/compare"),
  genie: (payload) => request("/api/genie/chat", { method: "POST", body: JSON.stringify(payload) }),
  feedback: (payload) => request("/api/feedback", { method: "POST", body: JSON.stringify(payload) }),
  feedbackHistory: () => request("/api/feedback/history"),
  bootstrap: (payload) => request("/api/admin/bootstrap", { method: "POST", body: JSON.stringify(payload) }),
};
