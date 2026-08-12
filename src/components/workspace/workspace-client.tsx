"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import {
  Activity,
  ArrowUp,
  Bot,
  ChevronRight,
  Command,
  FlaskConical,
  History,
  LayoutDashboard,
  MessageSquareText,
  Sparkles,
  User,
} from "lucide-react";
import { z } from "zod";

import { ApprovalCard } from "@/src/components/approval-card";
import { RunArtifacts } from "@/src/components/run-artifacts";
import { RunTimeline } from "@/src/components/run-timeline";
import { StatusBadge } from "@/src/components/status-badge";
import {
  ConversationMessageSchema,
  ConversationSchema,
  type Conversation,
  type ConversationMessage,
} from "@/src/domain/conversation";
import { AgentRunSchema, type AgentRun } from "@/src/domain/run";
import type { RunEvent } from "@/src/domain/run-event";
import { consumeSse, StreamResponseError } from "@/src/lib/consume-sse";
import { formatTimestamp } from "@/src/lib/format";
import type { StreamFrame } from "@/src/server/stream-contract";

const ConversationResponseSchema = z.object({
  conversation: ConversationSchema,
  messages: z.array(ConversationMessageSchema),
  runs: z.array(AgentRunSchema),
});

const examplePrompt =
  "Design three experiments to improve trial-to-paid conversion, then turn the strongest one into an implementation plan.";

export function WorkspaceClient({
  initialConversation,
  initialMessages,
  initialRuns,
  mode,
}: {
  initialConversation: Conversation;
  initialMessages: ConversationMessage[];
  initialRuns: AgentRun[];
  mode: "mock" | "live";
}) {
  const [conversation, setConversation] = useState(initialConversation);
  const [messages, setMessages] = useState(initialMessages);
  const [runs, setRuns] = useState(initialRuns);
  const [activeRunId, setActiveRunId] = useState<string | undefined>(
    initialConversation.lastRunId ?? initialRuns[0]?.id,
  );
  const [liveRunId, setLiveRunId] = useState<string | undefined>();
  const [liveEvents, setLiveEvents] = useState<RunEvent[]>([]);
  const [streamingMessage, setStreamingMessage] = useState("");
  const [pendingUserMessage, setPendingUserMessage] = useState<string>();
  const [prompt, setPrompt] = useState(
    initialMessages.length === 0 ? examplePrompt : "",
  );
  const [scenario, setScenario] = useState<
    "happy_path" | "fail_once_at_scoring"
  >("happy_path");
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string>();

  const activeRun = useMemo(
    () => runs.find((run) => run.id === activeRunId),
    [activeRunId, runs],
  );
  const activeStatus = activeRun?.status;
  const composerBlocked =
    isExecuting ||
    activeStatus === "queued" ||
    activeStatus === "planning" ||
    activeStatus === "running" ||
    activeStatus === "waiting_for_approval";

  const applyFrame = useCallback((frame: StreamFrame) => {
    if (frame.type === "run.snapshot") {
      setRuns((current) => upsertRun(current, frame.run));
      setActiveRunId(frame.run.id);
      setLiveRunId(frame.run.id);
      return;
    }
    if (frame.type !== "run.event") return;
    const event = frame.event;
    setLiveRunId(event.runId);
    setActiveRunId(event.runId);
    setLiveEvents((current) => [...current, event]);
    if (event.type === "message.delta") {
      setStreamingMessage((current) => current + event.payload.delta);
    }
    setRuns((current) =>
      current.map((run) => {
        if (run.id !== event.runId) return run;
        if (event.type === "run.status") {
          return { ...run, status: event.payload.status };
        }
        if (event.type === "step.status") {
          return {
            ...run,
            steps: run.steps.map((step) =>
              step.key === event.payload.stepKey
                ? {
                    ...step,
                    status: event.payload.status,
                    error: event.payload.error,
                  }
                : step,
            ),
          };
        }
        return run;
      }),
    );
  }, []);

  const refreshConversation = useCallback(async () => {
    const response = await fetch(`/api/conversations/${conversation.id}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Could not reload the conversation.");
    const data = ConversationResponseSchema.parse(await response.json());
    setConversation(data.conversation);
    setMessages(data.messages);
    setRuns(data.runs);
    setPendingUserMessage(undefined);
    setStreamingMessage("");
  }, [conversation.id]);

  const runStreamRequest = useCallback(
    async (url: string, body?: object, idempotencyKey?: string) => {
      setIsExecuting(true);
      setError(undefined);
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
          },
          body: JSON.stringify(body ?? {}),
        });
        await consumeSse(response, applyFrame);
        await refreshConversation();
      } catch (requestError) {
        setError(
          requestError instanceof StreamResponseError
            ? requestError.detail.message
            : requestError instanceof Error
              ? requestError.message
              : "The agent request failed.",
        );
        try {
          await refreshConversation();
        } catch {
          // The original request error is more useful to the user.
        }
      } finally {
        setIsExecuting(false);
      }
    },
    [applyFrame, refreshConversation],
  );

  async function sendPrompt() {
    const content = prompt.trim();
    if (content.length < 3 || composerBlocked) return;
    setLiveEvents([]);
    setLiveRunId(undefined);
    setStreamingMessage("");
    setPendingUserMessage(content);
    setPrompt("");
    await runStreamRequest(
      `/api/conversations/${conversation.id}/messages`,
      { content, demoScenario: scenario },
      crypto.randomUUID(),
    );
  }

  async function decideApproval(decision: "approve" | "reject") {
    const approval = activeRun?.approvals.find(
      (item) => item.status === "pending",
    );
    if (!activeRun || !approval || isExecuting) return;
    setLiveEvents([]);
    setStreamingMessage("");
    await runStreamRequest(
      `/api/runs/${activeRun.id}/approvals/${approval.id}`,
      { decision },
      crypto.randomUUID(),
    );
  }

  async function retryRun() {
    if (!activeRun || activeRun.status !== "failed" || isExecuting) return;
    setLiveEvents([]);
    setStreamingMessage("");
    await runStreamRequest(`/api/runs/${activeRun.id}/retry`);
  }

  return (
    <div className="workspace-shell">
      <WorkspaceSidebar
        activeRunId={activeRunId}
        conversation={conversation}
        onSelectRun={setActiveRunId}
        runs={runs}
      />
      <main className="workspace-main">
        <header className="workspace-header">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              className="icon-button lg:hidden"
              href="/internal/runs"
              aria-label="Open operations"
            >
              <LayoutDashboard size={17} />
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-sm font-semibold text-white">
                  Acme Analytics
                </h1>
                <ChevronRight
                  aria-hidden="true"
                  className="text-slate-700"
                  size={14}
                />
                <span className="truncate text-sm text-slate-400">
                  Trial conversion
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                30-day growth workspace
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="mode-badge">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
              {mode === "mock" ? "Mock model" : "Live model"}
            </span>
            {activeRun ? <StatusBadge status={activeRun.status} /> : null}
          </div>
        </header>

        <div className="workspace-grid">
          <section className="conversation-column">
            <div className="conversation-scroll">
              <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8">
                <ConversationIntro hasMessages={messages.length > 0} />
                <MessageList
                  messages={messages}
                  pendingUserMessage={pendingUserMessage}
                  streamingMessage={streamingMessage}
                />
                {isExecuting && !streamingMessage ? <AgentWorking /> : null}
                {error ? <InlineError message={error} /> : null}
                {activeRun?.status === "waiting_for_approval" ? (
                  <div className="mt-6">
                    <ApprovalCard
                      disabled={isExecuting}
                      onDecision={decideApproval}
                      run={activeRun}
                    />
                  </div>
                ) : null}
                {activeRun?.status === "failed" ? (
                  <FailureCard
                    disabled={isExecuting}
                    onRetry={retryRun}
                    run={activeRun}
                  />
                ) : null}
                {activeRun ? (
                  <div className="mt-6">
                    <RunArtifacts run={activeRun} />
                  </div>
                ) : null}
              </div>
            </div>
            <PromptComposer
              blocked={composerBlocked}
              isExecuting={isExecuting}
              mode={mode}
              onChange={setPrompt}
              onScenarioChange={setScenario}
              onSubmit={sendPrompt}
              prompt={prompt}
              scenario={scenario}
              waitingForApproval={activeStatus === "waiting_for_approval"}
            />
          </section>
          <RunTimeline
            liveEvents={liveEvents}
            liveRunId={liveRunId}
            run={activeRun}
          />
        </div>
      </main>
    </div>
  );
}

function WorkspaceSidebar({
  conversation,
  runs,
  activeRunId,
  onSelectRun,
}: {
  conversation: Conversation;
  runs: AgentRun[];
  activeRunId?: string;
  onSelectRun: (runId: string) => void;
}) {
  return (
    <aside className="workspace-sidebar">
      <Link className="brand-lockup" href="/">
        <span className="brand-mark" aria-hidden="true">
          <Sparkles size={17} />
        </span>
        <span>
          <strong>Growth Copilot</strong>
          <small>Agent workspace</small>
        </span>
      </Link>
      <nav className="mt-7 space-y-1" aria-label="Product navigation">
        <Link className="sidebar-link sidebar-link-active" href="/workspace">
          <MessageSquareText size={16} /> Workspace
        </Link>
        <Link className="sidebar-link" href="/internal/runs">
          <LayoutDashboard size={16} /> Operations
        </Link>
      </nav>
      <div className="sidebar-divider" />
      <div className="flex items-center justify-between px-2">
        <p className="section-kicker">Run history</p>
        <History aria-hidden="true" className="text-slate-700" size={14} />
      </div>
      <div className="mt-3 space-y-1.5 overflow-y-auto">
        {runs.length === 0 ? (
          <p className="px-2 py-3 text-xs leading-5 text-slate-600">
            Runs appear here after your first prompt.
          </p>
        ) : (
          runs.map((run) => (
            <button
              className={`run-history-item ${activeRunId === run.id ? "run-history-active" : ""}`}
              key={run.id}
              onClick={() => onSelectRun(run.id)}
              type="button"
            >
              <span className={`run-state-dot run-state-${run.status}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-slate-300">
                  {run.goal}
                </span>
                <span className="mt-1 block text-[11px] capitalize text-slate-600">
                  {run.status.replaceAll("_", " ")} ·{" "}
                  {formatTimestamp(run.createdAt)}
                </span>
              </span>
            </button>
          ))
        )}
      </div>
      <div className="mt-auto rounded-xl border border-white/7 bg-white/[0.025] p-3">
        <p className="text-xs font-medium text-slate-300">
          {conversation.title}
        </p>
        <p className="mt-1 text-[11px] leading-4 text-slate-600">
          Context is scoped to this conversation and its structured run
          summaries.
        </p>
      </div>
    </aside>
  );
}

function ConversationIntro({ hasMessages }: { hasMessages: boolean }) {
  if (hasMessages) return null;
  return (
    <div className="mb-9 border-b border-white/7 pb-8">
      <span className="agent-avatar">
        <Bot size={19} />
      </span>
      <h2 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-white sm:text-3xl">
        What growth outcome should we improve?
      </h2>
      <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">
        I’ll inspect the product snapshot, design and score three experiments,
        then pause before turning the recommendation into an implementation
        plan.
      </p>
      <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-500">
        <span className="capability-chip">
          <Activity size={13} /> Metrics
        </span>
        <span className="capability-chip">
          <FlaskConical size={13} /> Experiments
        </span>
        <span className="capability-chip">
          <Command size={13} /> Approval gate
        </span>
      </div>
    </div>
  );
}

function MessageList({
  messages,
  pendingUserMessage,
  streamingMessage,
}: {
  messages: ConversationMessage[];
  pendingUserMessage?: string;
  streamingMessage: string;
}) {
  return (
    <div className="space-y-6">
      {messages.map((message) => (
        <article
          className={`message-row message-${message.role}`}
          key={message.id}
        >
          <span className="message-avatar" aria-hidden="true">
            {message.role === "user" ? (
              <User size={14} />
            ) : (
              <Sparkles size={14} />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold text-slate-300">
                {message.role === "user" ? "You" : "Growth Copilot"}
              </p>
              <span className="text-[11px] text-slate-700">
                {formatTimestamp(message.createdAt)}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-300">
              {message.content}
            </p>
          </div>
        </article>
      ))}
      {pendingUserMessage ? (
        <article className="message-row message-user opacity-70">
          <span className="message-avatar" aria-hidden="true">
            <User size={14} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-300">You</p>
            <p className="mt-2 text-sm leading-7 text-slate-300">
              {pendingUserMessage}
            </p>
          </div>
        </article>
      ) : null}
      {streamingMessage ? (
        <article className="message-row message-assistant">
          <span className="message-avatar" aria-hidden="true">
            <Sparkles size={14} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-emerald-200">
              Growth Copilot
            </p>
            <p className="mt-2 text-sm leading-7 text-slate-300">
              {streamingMessage}
              <span className="stream-cursor" aria-hidden="true" />
            </p>
          </div>
        </article>
      ) : null}
    </div>
  );
}

function AgentWorking() {
  return (
    <div
      className="mt-6 flex items-center gap-3 text-sm text-slate-500"
      role="status"
    >
      <span className="working-indicator">
        <span />
        <span />
        <span />
      </span>
      Agent is executing the next checkpoint…
    </div>
  );
}

function PromptComposer({
  prompt,
  onChange,
  onSubmit,
  blocked,
  isExecuting,
  waitingForApproval,
  scenario,
  onScenarioChange,
  mode,
}: {
  prompt: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  blocked: boolean;
  isExecuting: boolean;
  waitingForApproval: boolean;
  scenario: "happy_path" | "fail_once_at_scoring";
  onScenarioChange: (value: "happy_path" | "fail_once_at_scoring") => void;
  mode: "mock" | "live";
}) {
  return (
    <div className="composer-wrap">
      <div className="composer">
        <textarea
          aria-label="Growth goal"
          disabled={blocked}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            }
          }}
          placeholder={
            waitingForApproval
              ? "Resolve the approval above to continue this run."
              : "Describe a growth outcome…"
          }
          rows={3}
          value={prompt}
        />
        <div className="flex items-center justify-between gap-3 border-t border-white/7 px-3 py-2.5">
          <label className="flex items-center gap-2 text-[11px] text-slate-600">
            Demo scenario
            <select
              aria-label="Demo scenario"
              disabled={blocked}
              onChange={(event) =>
                onScenarioChange(
                  event.target.value as "happy_path" | "fail_once_at_scoring",
                )
              }
              value={scenario}
            >
              <option value="happy_path">Happy path</option>
              <option value="fail_once_at_scoring">Fail once at scoring</option>
            </select>
          </label>
          <button
            aria-label="Send prompt"
            className="send-button"
            disabled={blocked || prompt.trim().length < 3}
            onClick={onSubmit}
            type="button"
          >
            {isExecuting ? (
              <span className="button-spinner" />
            ) : (
              <ArrowUp size={17} />
            )}
          </button>
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-700">
        Enter to send · Shift + Enter for a new line
        {mode === "mock" ? " · Mock mode needs no API key" : ""}
      </p>
    </div>
  );
}

function FailureCard({
  run,
  disabled,
  onRetry,
}: {
  run: AgentRun;
  disabled: boolean;
  onRetry: () => void;
}) {
  return (
    <section className="failure-card">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.11em] text-rose-200">
          Run failed at a checkpoint
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          {run.error?.message}
        </p>
        <p className="mt-1 font-mono text-[11px] text-slate-600">
          {run.error?.code}
        </p>
      </div>
      <button
        className="retry-button"
        disabled={disabled || !run.error?.retryable}
        onClick={onRetry}
        type="button"
      >
        Retry from checkpoint
      </button>
    </section>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <div className="mt-5 rounded-xl border border-rose-300/15 bg-rose-300/[0.055] px-4 py-3 text-sm text-rose-200">
      {message}
    </div>
  );
}

function upsertRun(runs: AgentRun[], run: AgentRun): AgentRun[] {
  const existing = runs.some((candidate) => candidate.id === run.id);
  return existing
    ? runs.map((candidate) => (candidate.id === run.id ? run : candidate))
    : [run, ...runs];
}
