"use client";

import { useState, useRef, useEffect } from "react";
import { loadCases, saveCases, TestCase } from "@/lib/storage";

export default function Home() {
  // Inputs
  const [system, setSystem] = useState("You are a helpful API tutor.");
  const [user, setUser] = useState(
    "Explain the difference between the Responses API and legacy Chat Completions in 5 bullets."
  );
  const [jsonMode, setJsonMode] = useState(false);
  const [reasoningEffort, setReasoningEffort] =
    useState<"low" | "medium" | "high">("medium");

  // Tools state
  const [enableTools, setEnableTools] = useState(false);
  const [detectedToolCall, setDetectedToolCall] = useState<any>(null);
  const [toolExecuting, setToolExecuting] = useState(false);
  const [toolResult, setToolResult] = useState<any>(null);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Non-stream result
  const [result, setResult] = useState<any>(null);

  // Stream result
  const [streamText, setStreamText] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  // Model selection
  const [model, setModel] = useState("gpt-5");

  // Saved test cases
  const [cases, setCases] = useState<TestCase[]>([]);
  const [caseName, setCaseName] = useState("");

  useEffect(() => {
    setCases(loadCases());
  }, []);

  function saveCurrentAsCase() {
    const id = crypto.randomUUID();
    const next: TestCase = {
      id,
      name: caseName || `Case ${new Date().toLocaleString()}`,
      system, user, json: jsonMode, reasoningEffort, model,
      enableTools,
    };
    const updated = [next, ...cases];
    setCases(updated);
    saveCases(updated);
    setCaseName("");
  }

  function loadCase(id: string) {
    const c = cases.find(x => x.id === id);
    if (!c) return;
    setSystem(c.system);
    setUser(c.user);
    setJsonMode(c.json);
    setReasoningEffort(c.reasoningEffort);
    setModel(c.model);
    setEnableTools(c.enableTools ?? false);
  }

  function deleteCase(id: string) {
    const updated = cases.filter(x => x.id !== id);
    setCases(updated);
    saveCases(updated);
  }

  async function runOnce(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setStreamText("");
    setDetectedToolCall(null);
    setToolResult(null);

    try {
      if (enableTools) {
        // First, detect if a tool call is needed
        const detectRes = await fetch("/api/tools/detect", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            system,
            user,
            json: jsonMode,
            reasoningEffort,
            model,
          }),
        });
        const detectData = await detectRes.json();
        if (!detectData.ok) throw new Error(detectData.error || "Tool detection failed");

        if (detectData.toolCall) {
          // Tool call detected
          setDetectedToolCall(detectData.toolCall);
          setResult(detectData);
        } else {
          // No tool call needed, just show the response
          setResult(detectData);
        }
      } else {
        // Tools disabled, use regular API
        const res = await fetch("/api/respond", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            system,
            user,
            json: jsonMode,
            reasoningEffort,
            model,
          }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "Request failed");
        setResult(data);
      }
    } catch (err: any) {
      setError(err.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  async function executeToolAndContinue() {
    if (!detectedToolCall) return;
    
    setToolExecuting(true);
    setError(null);
    setStreamText("");

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch("/api/tools/continue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          system,
          user,
          model,
          reasoningEffort,
          toolCall: detectedToolCall,
          json: jsonMode,
        }),
        signal: ac.signal,
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      
      // Store the tool execution info
      setToolResult({
        name: detectedToolCall.name,
        arguments: detectedToolCall.arguments,
        executedAt: new Date().toISOString(),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        setStreamText((t) => t + decoder.decode(value, { stream: true }));
      }
    } catch (err: any) {
      if (err.name !== "AbortError") setError(err.message ?? String(err));
    } finally {
      setToolExecuting(false);
      abortRef.current = null;
    }
  }

  async function runStream() {
    setError(null);
    setResult(null);
    setStreamText("");
    setDetectedToolCall(null);
    setToolResult(null);
    setLoading(true);

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const endpoint = enableTools ? "/api/tools/detect" : "/api/respond/stream";
      
      if (enableTools) {
        // For tools, we need to detect first (non-streaming), then continue with streaming
        const detectRes = await fetch("/api/tools/detect", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            system,
            user,
            json: jsonMode,
            reasoningEffort,
            model,
          }),
        });
        const detectData = await detectRes.json();
        
        if (detectData.toolCall) {
          setDetectedToolCall(detectData.toolCall);
          setResult(detectData);
          setLoading(false);
          // User will need to click "Execute Tool & Continue" to proceed
          return;
        } else {
          // No tool needed, show the text response
          setStreamText(detectData.text);
          setLoading(false);
          return;
        }
      }

      // Regular streaming without tools
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          system,
          user,
          json: jsonMode,
          reasoningEffort,
          model,
        }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        setStreamText((t) => t + decoder.decode(value, { stream: true }));
      }
    } catch (err: any) {
      if (err.name !== "AbortError") setError(err.message ?? String(err));
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  function stopStream() {
    abortRef.current?.abort();
    abortRef.current = null;
    setToolExecuting(false);
  }

  function clearResults() {
    setResult(null);
    setStreamText("");
    setDetectedToolCall(null);
    setToolResult(null);
    setError(null);
  }

  return (
    <main className="min-h-screen p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">OpenAI API Learning Tool</h1>

        <form onSubmit={runOnce} className="space-y-4">
          {/* System prompt */}
          <div>
            <label className="block text-sm font-medium">System Prompt</label>
            <textarea
              className="mt-1 w-full border rounded p-2"
              rows={2}
              value={system}
              onChange={(e) => setSystem(e.target.value)}
            />
          </div>

          {/* User prompt */}
          <div>
            <label className="block text-sm font-medium">User Prompt</label>
            <textarea
              className="mt-1 w-full border rounded p-2"
              rows={5}
              value={user}
              onChange={(e) => setUser(e.target.value)}
              required
            />
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3 flex-wrap">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={jsonMode}
                onChange={(e) => setJsonMode(e.target.checked)}
              />
              <span>JSON mode</span>
            </label>

            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={enableTools}
                onChange={(e) => setEnableTools(e.target.checked)}
              />
              <span>Enable Tools</span>
            </label>

            <div>
              <label className="block text-sm font-medium">Model</label>
              <select
                className="mt-1 border rounded p-2"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              >
                <option value="gpt-5">gpt-5</option>
                <option value="gpt-4.1">gpt-4.1</option>
                <option value="gpt-4.1-mini">gpt-4.1-mini</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium">
                Reasoning Effort
              </label>
              <select
                className="mt-1 border rounded p-2"
                value={reasoningEffort}
                onChange={(e) =>
                  setReasoningEffort(e.target.value as "low" | "medium" | "high")
                }
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </div>

            <button
              type="submit"
              className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
              disabled={loading || toolExecuting}
            >
              {loading ? "Running..." : "Run (non-streaming)"}
            </button>

            <button
              type="button"
              onClick={runStream}
              className="px-4 py-2 rounded border"
              disabled={loading || toolExecuting}
            >
              Stream
            </button>

            <button
              type="button"
              onClick={stopStream}
              className="px-4 py-2 rounded border"
            >
              Stop
            </button>

            <button
              type="button"
              onClick={clearResults}
              className="px-4 py-2 rounded border"
            >
              Clear
            </button>
          </div>

          {/* Tools info */}
          {enableTools && (
            <div className="border rounded p-3 bg-blue-50 text-blue-800">
              <div className="font-medium">Available Tools:</div>
              <ul className="mt-1 text-sm">
                <li>• <code>getServerTime</code> - Get current server time in a specific timezone</li>
                <li>• <code>calculate</code> - Perform mathematical calculations</li>
                <li>• <code>getRandomNumber</code> - Generate random numbers</li>
                <li>• <code>convertUnits</code> - Convert between units (temperature, length, weight)</li>
              </ul>
              <div className="mt-2 text-xs">
                Try: "What time is it in Tokyo?", "Calculate 15% of 847", "Convert 32F to Celsius", "Generate a random number between 1 and 100"
              </div>
            </div>
          )}

          {/* Save / load cases */}
          <div className="border rounded p-3 space-y-3 mt-4">
            <div className="flex items-center gap-2">
              <input
                className="border rounded p-2 flex-1"
                placeholder="Name this test case…"
                value={caseName}
                onChange={(e) => setCaseName(e.target.value)}
              />
              <button type="button" onClick={saveCurrentAsCase} className="px-3 py-2 rounded border">
                Save Case
              </button>
            </div>

            {cases.length > 0 ? (
              <ul className="space-y-2">
                {cases.map(c => (
                  <li key={c.id} className="flex items-center justify-between gap-2">
                    <div className="truncate">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-xs text-gray-500"> — {c.model}, {c.json ? "JSON" : "Text"}, {c.reasoningEffort}{c.enableTools ? ", Tools" : ""}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="px-2 py-1 rounded border" onClick={() => loadCase(c.id)}>Load</button>
                      <button className="px-2 py-1 rounded border" onClick={() => deleteCase(c.id)}>Delete</button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-gray-600">No saved cases yet.</div>
            )}
          </div>
        </form>

        {/* Errors */}
        {error && (
          <div className="border border-red-300 bg-red-50 text-red-700 p-3 rounded">
            {error}
          </div>
        )}

        {/* Tool Call Detected */}
        {detectedToolCall && !toolResult && (
          <div className="border-2 border-yellow-400 bg-yellow-50 p-4 rounded space-y-3">
            <div className="font-medium text-yellow-900">🔧 Tool Call Detected</div>
            <div className="space-y-1">
              <div className="text-sm">
                <span className="font-medium">Tool:</span> {detectedToolCall.name}
              </div>
              <div className="text-sm">
                <span className="font-medium">Arguments:</span>
                <pre className="mt-1 text-xs bg-white p-2 rounded border">
                  {JSON.stringify(detectedToolCall.arguments, null, 2)}
                </pre>
              </div>
            </div>
            <button
              onClick={executeToolAndContinue}
              className="px-4 py-2 bg-yellow-600 text-white rounded disabled:opacity-50"
              disabled={toolExecuting}
            >
              {toolExecuting ? "Executing..." : "Execute Tool & Continue"}
            </button>
          </div>
        )}

        {/* Tool Execution Result */}
        {toolResult && (
          <div className="border border-green-400 bg-green-50 p-3 rounded">
            <div className="font-medium text-green-900">✅ Tool Executed</div>
            <div className="text-sm mt-1">
              <span className="font-medium">{toolResult.name}</span>
              ({JSON.stringify(toolResult.arguments)})
            </div>
          </div>
        )}

        {/* Non-streamed result */}
        {result && !detectedToolCall && (
          <div className="space-y-3">
            <div className="text-sm text-gray-600">Model: {result.model}</div>
            <div className="border rounded p-3 whitespace-pre-wrap">
              {result.text}
            </div>
            <details className="border rounded p-3">
              <summary className="cursor-pointer">Raw response</summary>
              <pre className="mt-2 text-xs overflow-auto">
                {JSON.stringify(result.raw, null, 2)}
              </pre>
            </details>
          </div>
        )}

        {/* Streamed output */}
        {streamText && (
          <div className="border rounded p-3 whitespace-pre-wrap">
            {streamText}
          </div>
        )}
      </div>
    </main>
  );
}