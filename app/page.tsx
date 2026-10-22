"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Analysis,
  CATEGORIES,
  Category,
  MAX_TICKET_LENGTH,
  POLICY,
  RUBRIC,
  TEAMS,
  parseAnalysis,
  parseResponse,
  queueFor,
  validateTicket,
} from "../lib/triage";
import { demoResponse, HistoryEntry, SAMPLES } from "../lib/samples";
const STORAGE_KEY = "triage-history-v1";
const pct = (n: number) => `${Math.round(n * 100)}%`;
export default function Home() {
  const [mode, setMode] = useState<"demo" | "live">("demo");
  const [ticket, setTicket] = useState(SAMPLES[0].ticket);
  const [code, setCode] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [current, setCurrent] = useState<HistoryEntry>();
  const [category, setCategory] = useState<Category>("payments");
  const [urgent, setUrgent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const resultRef = useRef<HTMLElement>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        if (!Array.isArray(value) || value.length > 30) throw new Error();
        const valid = value.filter((v): v is HistoryEntry => {
          try {
            validateTicket(v.ticket);
            v.analysis = parseAnalysis(v.analysis);
            return (
              typeof v.id === "string" &&
              typeof v.policyVersion === "string" &&
              typeof v.createdAt === "string" &&
              Number.isFinite(Date.parse(v.createdAt)) &&
              ["demo", "live"].includes(v.mode) &&
              (!v.correction ||
                (CATEGORIES.includes(v.correction.category) &&
                  typeof v.correction.urgent === "boolean" &&
                  typeof v.correction.savedAt === "string"))
            );
          } catch {
            return false;
          }
        });
        setHistory(valid);
        if (valid.length !== value.length)
          setNotice("Some unreadable history entries were skipped.");
      } catch {
        setNotice(
          "Device history could not be read. You can still analyze and export this session.",
        );
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  function save(entries: HistoryEntry[]) {
    const recent = entries.slice(0, 30);
    setHistory(recent);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(recent));
    } catch {
      setNotice(
        "Device storage is unavailable or full. Export JSON to keep this session.",
      );
    }
  }
  function open(entry: HistoryEntry) {
    setCurrent(entry);
    setCategory(entry.correction?.category || entry.analysis.category);
    setUrgent(
      entry.correction?.urgent ??
        entry.analysis.urgentProbability >= POLICY.urgent,
    );
    setTimeout(() => resultRef.current?.focus(), 0);
  }
  async function analyze(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    setError("");
    setNotice("");
    try {
      validateTicket(ticket);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    const index = SAMPLES.findIndex((sample) => sample.ticket === ticket);
    if (mode === "demo" && index < 0) {
      setError(
        "Demo results are fixed. Select a synthetic example, or choose Live for your own text.",
      );
      return;
    }
    inFlight.current = true;
    setLoading(true);
    try {
      let analysis: Analysis;
      if (mode === "demo") analysis = parseResponse(demoResponse(index));
      else {
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-triage-access-code": code,
          },
          body: JSON.stringify({ ticket }),
          signal: AbortSignal.timeout(25000),
        });
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            typeof body.error === "string"
              ? body.error
              : "Live analysis failed.",
          );
        analysis = parseAnalysis(body.analysis);
      }
      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        mode,
        ticket,
        analysis,
        policyVersion: POLICY.version,
      };
      save([entry, ...history]);
      open(entry);
    } catch (e) {
      setError(
        e instanceof Error && e.name === "TimeoutError"
          ? "The request timed out. Retry explicitly; a live request may already have incurred a charge."
          : e instanceof Error
            ? e.message
            : "The request failed. Please retry later.",
      );
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }
  function correct() {
    if (!current) return;
    const updated = {
      ...current,
      correction: { category, urgent, savedAt: new Date().toISOString() },
    };
    save(history.map((h) => (h.id === updated.id ? updated : h)));
    setCurrent(updated);
    setNotice(
      "Review saved on this device. Original predictions are preserved.",
    );
  }
  function exportHistory() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              schemaVersion: 1,
              exportedAt: new Date().toISOString(),
              policy: POLICY,
              analyses: history,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "ticket-triage.json";
    link.click();
    URL.revokeObjectURL(url);
  }
  const a = current?.analysis,
    routing = a && queueFor(a);
  return (
    <main>
      <header>
        <Link className="brand" href="/" aria-label="Support Triage home">
          <span className="brand-icon">↗</span> TRIAGE
          <span className="brand-light"> / SUPPORT CONSOLE</span>
        </Link>
        <span className="status">
          <span /> Recommendations only
        </span>
      </header>
      <section className="intro">
        <p className="eyebrow">A LITTLE CLARITY FOR YOUR QUEUE</p>
        <h1>
          Every ticket.
          <br />
          <span>A clearer next step.</span>
        </h1>
        <p className="lede">
          Turn a customer’s message into a routing recommendation.
          <br className="desktop" /> Inspect the signals. Keep a person in
          control.
        </p>
      </section>
      <div className="workspace">
        <section className="card composer" aria-labelledby="compose-title">
          <div className="card-top">
            <h2 id="compose-title">
              <span className="step">01</span> The ticket
            </h2>
            <div className="segmented" aria-label="Analysis mode">
              <button
                type="button"
                aria-pressed={mode === "demo"}
                onClick={() => {
                  setMode("demo");
                  setError("");
                }}
                disabled={loading}
              >
                Demo
              </button>
              <button
                type="button"
                aria-pressed={mode === "live"}
                onClick={() => {
                  setMode("live");
                  setError("");
                }}
                disabled={loading}
              >
                Live
              </button>
            </div>
          </div>
          <div className="mode-note">
            {mode === "demo" ? (
              <>
                <strong>Sample playground</strong> · Fixed, illustrative
                results. No API calls or credentials.
              </>
            ) : (
              <>
                <strong>Live Jev analysis</strong> · Sends your ticket to
                TypeSafe AI. An access code is required.
              </>
            )}
          </div>
          <form onSubmit={analyze}>
            <label htmlFor="sample">Start with a synthetic example</label>
            <select
              id="sample"
              disabled={loading}
              value={SAMPLES.find((s) => s.ticket === ticket)?.id || ""}
              onChange={(e) => {
                const s = SAMPLES.find((s) => s.id === e.target.value);
                if (s) setTicket(s.ticket);
              }}
            >
              <option value="" disabled>
                Custom ticket
              </option>
              {SAMPLES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                  {s.id === "ambiguous" ? " · needs review" : ""}
                </option>
              ))}
            </select>
            <div className="label-row">
              <label htmlFor="ticket">Customer message</label>
              <span>{ticket.length.toLocaleString()} / 6,000</span>
            </div>
            <textarea
              id="ticket"
              value={ticket}
              onChange={(e) => setTicket(e.target.value)}
              maxLength={MAX_TICKET_LENGTH}
              minLength={10}
              required
              disabled={loading}
              aria-describedby="privacy"
              rows={8}
            />
            <p className="hint" id="privacy">
              Use synthetic or redacted tickets. Remove names, payment details,
              and other sensitive information.
            </p>
            {mode === "live" && (
              <div className="access">
                <label htmlFor="access">Live access code</label>
                <input
                  id="access"
                  type="password"
                  autoComplete="off"
                  maxLength={256}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  disabled={loading}
                />
                <p className="hint">
                  Kept only in memory for this session. Never included in
                  exports.
                </p>
              </div>
            )}
            <button className="primary" type="submit" disabled={loading}>
              {loading ? "Analyzing ticket…" : "Analyze ticket"}{" "}
              <span aria-hidden="true">↗</span>
            </button>
          </form>
          <p className="footnote">
            {mode === "demo"
              ? "Select a sample to explore. Custom text requires Live mode."
              : "One request. Three questions. No automatic external actions."}
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div role="status" className="notice">
            {notice}
          </div>
        </section>
        <section
          className="card results"
          ref={resultRef}
          tabIndex={-1}
          aria-labelledby="result-title"
          aria-busy={loading}
        >
          <div className="card-top">
            <h2 id="result-title">
              <span className="step">02</span> The recommendation
            </h2>
            {current && (
              <span className="small-tag">
                {current.mode === "demo" ? "FIXED DEMO" : "LIVE RESULT"}
              </span>
            )}
          </div>
          {a && routing ? (
            <>
              <blockquote className="analyzed-ticket">
                <span className="metric-label">Analyzed message</span>
                {current?.ticket}
              </blockquote>
              <div className={`queue ${routing.queue.replace(" ", "-")}`}>
                <span className="eyebrow">SUGGESTED QUEUE</span>
                <h3>{routing.queue}</h3>
                <p>{routing.reason}</p>
              </div>
              <div className="result-metrics">
                <div>
                  <span className="metric-label">Category</span>
                  <strong className="capitalize">{a.category}</strong>
                  <p>{TEAMS[a.category]}</p>
                </div>
                <div>
                  <span className="metric-label">Category confidence</span>
                  <strong>{pct(a.categoryConfidence)}</strong>
                  <p>Concentration of the model’s probabilities</p>
                </div>
              </div>
              <div className="signal">
                <div>
                  <span>Frustration</span>
                  <strong>
                    {a.frustration.toFixed(2)} <small>/ 2</small>
                  </strong>
                </div>
                <meter
                  min={0}
                  max={2}
                  value={a.frustration}
                  aria-label="Frustration out of two"
                />
                <p>
                  0 = calm · 1 = frustrated but civil · 2 = very angry.
                  <br />A weighted average; values can fall between levels.
                  Confidence: {pct(a.frustrationConfidence)}.
                </p>
              </div>
              <div className="signal">
                <div>
                  <span>Urgent attention needed</span>
                  <strong>{pct(a.urgentProbability)}</strong>
                </div>
                <meter
                  min={0}
                  max={1}
                  value={a.urgentProbability}
                  aria-label="Probability urgent attention is needed"
                />
                <p>
                  Estimated probability of urgency. Noul provides no separate
                  confidence field.
                </p>
              </div>
              <details>
                <summary>Inspect option probabilities</summary>
                <div className="probabilities">
                  {CATEGORIES.map((c) => (
                    <div key={c}>
                      <span className="capitalize">{c}</span>
                      <span>{pct(a.categoryProbabilities[c])}</span>
                    </div>
                  ))}
                </div>
                <p className="metric-label">Frustration levels</p>
                <div className="probabilities">
                  {RUBRIC.map((r, i) => (
                    <div key={r}>
                      <span>
                        {i} · {r}
                      </span>
                      <span>{pct(a.frustrationProbabilities[String(i)])}</span>
                    </div>
                  ))}
                </div>
              </details>
              <p className="hint">
                Confidence describes the distribution, not guaranteed accuracy.
                Queue thresholds are initial values that need evaluation.
              </p>
              <fieldset className="review">
                <legend>Keep a human in the loop</legend>
                <p>
                  Accept the suggestion or correct it. Urgency starts at{" "}
                  {pct(POLICY.urgent)} probability; review cases still need your
                  judgment.
                </p>
                <div className="review-fields">
                  <div>
                    <label htmlFor="category">Reviewed category</label>
                    <select
                      id="category"
                      value={category}
                      onChange={(e) => setCategory(e.target.value as Category)}
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="urgency">Reviewed urgency</label>
                    <select
                      id="urgency"
                      value={urgent ? "urgent" : "not-urgent"}
                      onChange={(e) => setUrgent(e.target.value === "urgent")}
                    >
                      <option value="not-urgent">Not urgent</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>
                <button className="secondary" onClick={correct}>
                  Save review
                </button>
                {current?.correction && (
                  <p className="saved">
                    ✓ Review saved · {TEAMS[current.correction.category]} ·{" "}
                    {current.correction.urgent ? "urgent" : "not urgent"}
                  </p>
                )}
              </fieldset>
              <p className="footnote">
                {a.model} · Policy v{current?.policyVersion} ·{" "}
                {current && new Date(current.createdAt).toLocaleString()}
              </p>
            </>
          ) : (
            <div className="empty">
              <div className="empty-icon" aria-hidden="true">
                ◎
              </div>
              <h3>A next step, with the signals behind it.</h3>
              <p>
                Analyze a ticket to see its category, customer frustration,
                urgency, and suggested queue.
              </p>
              <div className="empty-pills">
                <span>Category</span>
                <span>Frustration</span>
                <span>Urgency</span>
              </div>
            </div>
          )}
        </section>
      </div>
      <section className="card history" aria-labelledby="history-title">
        <div className="history-heading">
          <div>
            <h2 id="history-title">
              <span className="step">03</span> Recent analyses{" "}
              <span className="count">{history.length}</span>
            </h2>
            <p>
              Up to 30 analyses and reviews, stored in this browser on this
              device. History is not shared between devices.
            </p>
          </div>
          <div className="history-actions">
            <button
              className="secondary"
              disabled={!history.length}
              onClick={exportHistory}
            >
              Export JSON ↓
            </button>
            <button
              className="text-button"
              disabled={!history.length}
              onClick={() => {
                try {
                  localStorage.removeItem(STORAGE_KEY);
                  setHistory([]);
                  setCurrent(undefined);
                  setNotice("History cleared from this device.");
                } catch {
                  setNotice(
                    "Could not clear device storage. Check your browser permissions.",
                  );
                }
              }}
            >
              Clear history
            </button>
          </div>
        </div>
        {history.length ? (
          <ul className="history-list">
            {history.map((h) => (
              <li key={h.id}>
                <button onClick={() => open(h)}>
                  <div>
                    <span className="history-ticket">{h.ticket}</span>
                    <span className="history-meta">
                      {h.mode === "demo" ? "Fixed demo" : "Live"} ·{" "}
                      {new Date(h.createdAt).toLocaleString()} ·{" "}
                      {h.correction ? "Reviewed" : "Awaiting review"}
                    </span>
                  </div>
                  <span className="queue-chip">
                    {queueFor(h.analysis).queue}
                  </span>
                  <span aria-hidden="true">↗</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="history-empty">
            Your next analysis will appear here.
          </div>
        )}
      </section>
      <footer>
        <span>Powered by Jev / TypeSafe AI</span>
        <span>
          Routing advice only. Every final decision stays with your team.
        </span>
      </footer>
    </main>
  );
}
