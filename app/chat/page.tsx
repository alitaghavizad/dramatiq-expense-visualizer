"use client";

import {
  ArrowUp,
  BarChart3,
  BookOpenText,
  Database,
  Globe2,
  LayoutDashboard,
  MessageCircleMore,
  PanelRight,
  Plus,
  Search,
  Sparkles,
  WalletCards,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import AmbientGeometry from "./ambient-geometry";
import "./chat.css";

const API_BASE = process.env.NEXT_PUBLIC_EXPENSE_API_URL ?? "http://localhost:3001";

type ChatSource = { title: string; url: string };

type Conversation = {
  id: string;
  title: string;
  model: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message: string | null;
  last_message_role?: "user" | "assistant" | null;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: ChatSource[];
  created_at: string;
};

type ChatStage = "thinking" | "database" | "web" | "writing";

const suggestions = [
  {
    icon: BarChart3,
    eyebrow: "This month",
    title: "Where did most of my money go?",
    prompt: "Analyze this month's spending and tell me the three most important patterns.",
  },
  {
    icon: Database,
    eyebrow: "My ledger",
    title: "Compare grocery stores",
    prompt: "Compare my grocery spending by store and highlight where I tend to spend the most.",
  },
  {
    icon: Globe2,
    eyebrow: "Live search",
    title: "Check today’s AMD exchange rate",
    prompt: "Search the web for today's AMD to USD exchange rate and put my recent spending in context.",
  },
] as const;

const stageLabels: Record<ChatStage, string> = {
  thinking: "Thinking through your question",
  database: "Reading your ledger securely",
  web: "Checking live sources",
  writing: "Composing your answer",
};

async function readJson(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? "The request could not be completed.");
  return payload;
}

function timeLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  if (sameDay) return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(date);
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function conversationGroup(value: string) {
  const date = new Date(value);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  if (date.getTime() >= startToday) return "Today";
  if (date.getTime() >= startToday - 7 * day) return "Previous 7 days";
  return "Earlier";
}

function modelLabel(model: string) {
  if (model === "claude-sonnet-5") return "Claude Sonnet 5";
  return model.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ChatMark() {
  return (
    <span className="chat-mark" aria-hidden="true">
      <span />
      <Sparkles size={13} />
    </span>
  );
}

function AssistantMarkdown({ content, streaming = false }: { content: string; streaming?: boolean }) {
  return (
    <div className={`message-content markdown-content ${streaming ? "streaming-text" : ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href, title }) => (
            <a href={href} title={title} target="_blank" rel="noreferrer noopener">{children}</a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
      {streaming && <span className="stream-caret" aria-hidden="true" />}
    </div>
  );
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [conversationSearch, setConversationSearch] = useState("");
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [streamSources, setStreamSources] = useState<ChatSource[]>([]);
  const [stage, setStage] = useState<ChatStage>("thinking");
  const [error, setError] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const messageScrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeConversation = conversations.find((conversation) => conversation.id === activeId) ?? null;

  const loadConversations = useCallback(async (preferredId: string | null) => {
    try {
      const response = await fetch(`${API_BASE}/api/chat/conversations`);
      const payload = await readJson(response) as { conversations: Conversation[] };
      setConversations(payload.conversations);
      if (preferredId && payload.conversations.some((conversation) => conversation.id === preferredId)) {
        setActiveId(preferredId);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load conversations.");
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_BASE}/api/chat/conversations`, { signal: controller.signal })
      .then(readJson)
      .then(async (payload: { conversations: Conversation[] }) => {
        setConversations(payload.conversations);
        const first = payload.conversations[0];
        if (!first) return;
        setActiveId(first.id);
        setLoadingMessages(true);
        const messageResponse = await fetch(`${API_BASE}/api/chat/conversations/${first.id}/messages`, { signal: controller.signal });
        const messagePayload = await readJson(messageResponse) as { messages: ChatMessage[] };
        setMessages(messagePayload.messages);
      })
      .catch((loadError) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "Could not load conversations.");
      })
      .finally(() => {
        setLoadingConversations(false);
        setLoadingMessages(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const scroller = messageScrollRef.current;
      if (!scroller) return;
      scroller.scrollTo({
        top: scroller.scrollHeight,
        behavior: sending ? "auto" : "smooth",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, streamText, sending, stage]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [draft]);

  const groupedConversations = useMemo(() => {
    const query = conversationSearch.trim().toLocaleLowerCase();
    const filtered = conversations.filter((conversation) =>
      !query || conversation.title.toLocaleLowerCase().includes(query) ||
      conversation.last_message?.toLocaleLowerCase().includes(query),
    );
    return filtered.reduce<Record<string, Conversation[]>>((groups, conversation) => {
      const group = conversationGroup(conversation.updated_at);
      (groups[group] ??= []).push(conversation);
      return groups;
    }, {});
  }, [conversationSearch, conversations]);

  async function createConversation() {
    const response = await fetch(`${API_BASE}/api/chat/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const conversation = await readJson(response) as Conversation;
    setConversations((current) => [conversation, ...current]);
    setActiveId(conversation.id);
    setMessages([]);
    setDrawerOpen(false);
    return conversation;
  }

  async function beginNewConversation() {
    if (sending) return;
    try {
      setError("");
      await createConversation();
      window.setTimeout(() => textareaRef.current?.focus(), 50);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not start a conversation.");
    }
  }

  function closeConversationHistory() {
    if (window.matchMedia("(max-width: 780px)").matches) setDrawerOpen(false);
    else setHistoryCollapsed(true);
  }

  function toggleConversationHistory() {
    if (window.matchMedia("(max-width: 780px)").matches) setDrawerOpen((current) => !current);
    else setHistoryCollapsed((current) => !current);
  }

  async function openConversation(id: string) {
    if (sending && id !== activeId) return;
    setActiveId(id);
    setMessages([]);
    setLoadingMessages(true);
    setError("");
    setStreamText("");
    setStreamSources([]);
    setDrawerOpen(false);
    try {
      const response = await fetch(`${API_BASE}/api/chat/conversations/${id}/messages`);
      const payload = await readJson(response) as { messages: ChatMessage[] };
      setMessages(payload.messages);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load this conversation.");
    } finally {
      setLoadingMessages(false);
    }
  }

  function handleStreamEvent(event: string, payload: Record<string, unknown>) {
    if (event === "conversation") {
      const updated = payload as unknown as Conversation;
      setConversations((current) => current.map((conversation) =>
        conversation.id === updated.id ? { ...conversation, ...updated } : conversation,
      ));
    } else if (event === "stage" && typeof payload.stage === "string") {
      setStage(payload.stage as ChatStage);
    } else if (event === "delta" && typeof payload.delta === "string") {
      setStreamText((current) => current + payload.delta);
    } else if (event === "sources" && Array.isArray(payload.sources)) {
      setStreamSources(payload.sources as ChatSource[]);
    } else if (event === "done" && payload.message) {
      setMessages((current) => [...current, payload.message as ChatMessage]);
      setStreamText("");
      setStreamSources([]);
    } else if (event === "error") {
      throw new Error(typeof payload.error === "string" ? payload.error : "Claude could not answer.");
    }
  }

  async function sendMessage(messageOverride?: string) {
    const message = (messageOverride ?? draft).trim();
    if (!message || sending) return;

    let conversationId = activeId;
    try {
      setSending(true);
      setStage("thinking");
      setError("");
      setStreamText("");
      setStreamSources([]);
      if (!conversationId) conversationId = (await createConversation()).id;

      const optimisticId = `local-${conversationId}-${messages.length}`;
      const optimisticMessage: ChatMessage = {
        id: optimisticId,
        role: "user",
        content: message,
        sources: [],
        created_at: new Date().toISOString(),
      };
      setMessages((current) => [...current, optimisticMessage]);
      setDraft("");

      const response = await fetch(`${API_BASE}/api/chat/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!response.ok || !response.body) {
        setMessages((current) => current.filter((item) => item.id !== optimisticId));
        await readJson(response);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          if (!chunk.trim() || chunk.startsWith(":")) continue;
          let event = "message";
          const dataLines: string[] = [];
          for (const line of chunk.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
          }
          if (!dataLines.length) continue;
          handleStreamEvent(event, JSON.parse(dataLines.join("\n")) as Record<string, unknown>);
        }
        if (done) break;
      }

      await loadConversations(conversationId);
    } catch (sendError) {
      setStreamText("");
      setStreamSources([]);
      setError(sendError instanceof Error ? sendError.message : "The message could not be sent.");
    } finally {
      setSending(false);
      window.setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  const hasConversationContent = loadingMessages || messages.length > 0 || sending;

  return (
    <main className="chat-app-shell">
      <aside className="sidebar chat-primary-sidebar">
        <Link className="brand-mark" href="/" aria-label="Dramatiq home">Դ</Link>
        <nav aria-label="Main navigation">
          <Link className="nav-item" href="/" aria-label="Overview"><LayoutDashboard size={19} /></Link>
          <Link className="nav-item" href="/#insights" aria-label="Insights"><BarChart3 size={19} /></Link>
          <Link className="nav-item" href="/#purchases" aria-label="Purchases"><WalletCards size={19} /></Link>
          <Link className="nav-item active" href="/chat" aria-label="Claude chat"><MessageCircleMore size={19} /></Link>
        </nav>
        <button className="sidebar-add" type="button" onClick={() => void beginNewConversation()} aria-label="New conversation"><Plus size={19} /></button>
        <div className="user-badge">AM</div>
      </aside>

      <div className="chat-workbench">
        {drawerOpen && <button className="chat-drawer-scrim" type="button" aria-label="Close conversations" onClick={() => setDrawerOpen(false)} />}
        <aside className={`conversation-rail ${drawerOpen ? "is-open" : ""} ${historyCollapsed ? "is-collapsed" : ""}`} aria-label="Conversation history">
          <div className="rail-heading">
            <div>
              <span className="rail-kicker">Dramatiq AI</span>
              <strong>Conversations</strong>
            </div>
            <button className="rail-close" type="button" onClick={closeConversationHistory} aria-label="Close conversation history"><X size={17} /></button>
          </div>

          <button className="new-chat-button" type="button" onClick={() => void beginNewConversation()} disabled={sending}>
            <span><Plus size={16} /></span>
            New conversation
          </button>

          <label className="conversation-search">
            <Search size={14} />
            <input value={conversationSearch} onChange={(event) => setConversationSearch(event.target.value)} placeholder="Search conversations" aria-label="Search conversations" />
          </label>

          <div className="conversation-list">
            {loadingConversations ? (
              <div className="conversation-skeletons" aria-label="Loading conversations">
                <span /><span /><span />
              </div>
            ) : Object.keys(groupedConversations).length ? (
              ["Today", "Previous 7 days", "Earlier"].map((group) => groupedConversations[group]?.length ? (
                <section className="conversation-group" key={group}>
                  <p>{group}</p>
                  {groupedConversations[group].map((conversation, index) => (
                    <button
                      className={`conversation-item ${conversation.id === activeId ? "active" : ""}`}
                      style={{ "--item-index": index } as React.CSSProperties}
                      type="button"
                      key={conversation.id}
                      title={conversation.title}
                      aria-label={`Open conversation: ${conversation.title}`}
                      onClick={() => void openConversation(conversation.id)}
                      disabled={sending && conversation.id !== activeId}
                    >
                      <span className="conversation-item-icon"><MessageCircleMore size={14} /></span>
                      <span className="conversation-item-copy">
                        <strong>{conversation.title}</strong>
                        <small>{conversation.last_message || "Ready for your first question"}</small>
                      </span>
                      <time>{timeLabel(conversation.updated_at)}</time>
                    </button>
                  ))}
                </section>
              ) : null)
            ) : (
              <div className="conversation-empty">
                <BookOpenText size={22} />
                <strong>No conversations yet</strong>
                <span>Your questions and answers will stay here.</span>
              </div>
            )}
          </div>

          <div className="rail-privacy-note">
            <Database size={14} />
            <span><strong>Read-only ledger</strong>Claude can analyze your records, never change them.</span>
          </div>
        </aside>

        <section className="conversation-surface">
          <header className="chat-topbar">
            <div className="chat-topbar-left">
              <ChatMark />
              <div>
                <strong title={activeConversation?.title || "Expense intelligence"}>{activeConversation?.title || "Expense intelligence"}</strong>
                <span><i /> {activeConversation ? modelLabel(activeConversation.model) : "Claude Sonnet 5"}</span>
              </div>
            </div>
            <div className="chat-topbar-actions">
              <div className="capability-badges" aria-label="Agent capabilities">
                <span><Database size={13} /> Ledger · read only</span>
                <span><Globe2 size={13} /> Live web</span>
              </div>
              <button
                className="rail-menu"
                type="button"
                onClick={toggleConversationHistory}
                aria-label="Toggle conversation history"
                title="Toggle conversation history"
              ><PanelRight size={18} /></button>
            </div>
          </header>

          <div className="chat-canvas">
            <div className="chat-aurora" aria-hidden="true"><span /><span /><span /></div>
            <AmbientGeometry />
            <div ref={messageScrollRef} className={`message-scroll ${hasConversationContent ? "has-messages" : ""}`}>
              {!hasConversationContent ? (
                <section className="chat-welcome">
                  <div className="welcome-orb"><ChatMark /><span className="orb-ring ring-one" /><span className="orb-ring ring-two" /></div>
                  <p className="welcome-kicker"><Sparkles size={13} /> Your private expense intelligence</p>
                  <h1>Ask your spending<br /><em>anything.</em></h1>
                  <p className="welcome-copy">Claude can read your reviewed expense ledger, spot patterns across time and stores, and search the live web when your question needs today’s context.</p>
                  <div className="prompt-suggestions">
                    {suggestions.map((suggestion, index) => {
                      const Icon = suggestion.icon;
                      return (
                        <button
                          type="button"
                          key={suggestion.title}
                          style={{ "--suggestion-index": index } as React.CSSProperties}
                          onClick={() => void sendMessage(suggestion.prompt)}
                        >
                          <span className="suggestion-icon"><Icon size={16} /></span>
                          <span><small>{suggestion.eyebrow}</small><strong>{suggestion.title}</strong></span>
                          <ArrowUp size={15} />
                        </button>
                      );
                    })}
                  </div>
                </section>
              ) : (
                <div className="message-thread" aria-live="polite">
                  {loadingMessages && !messages.length ? (
                    <div className="thread-loading"><span /><span /><span /></div>
                  ) : messages.map((message, index) => (
                    <article
                      className={`chat-message ${message.role}`}
                      style={{ "--message-index": Math.min(index, 8) } as React.CSSProperties}
                      key={message.id}
                    >
                      {message.role === "assistant" && <ChatMark />}
                      <div className="message-body">
                        <div className="message-meta">
                          <strong>{message.role === "assistant" ? "Claude" : "You"}</strong>
                          <time>{timeLabel(message.created_at)}</time>
                        </div>
                        {message.role === "assistant"
                          ? <AssistantMarkdown content={message.content} />
                          : <div className="message-content">{message.content}</div>}
                        {message.sources?.length > 0 && (
                          <div className="message-sources">
                            <span><Globe2 size={12} /> Sources</span>
                            <div>{message.sources.map((source, sourceIndex) => (
                              <a href={source.url} target="_blank" rel="noreferrer" key={`${source.url}-${sourceIndex}`}>{sourceIndex + 1}. {source.title}</a>
                            ))}</div>
                          </div>
                        )}
                      </div>
                    </article>
                  ))}

                  {sending && (
                    <article className="chat-message assistant streaming-message">
                      <ChatMark />
                      <div className="message-body">
                        <div className="message-meta"><strong>Claude</strong><span className="live-label">Live</span></div>
                        {streamText ? <AssistantMarkdown content={streamText} streaming /> : (
                          <div className="agent-thinking">
                            <span className="thinking-pulse"><i /><i /><i /></span>
                            <span>{stageLabels[stage]}</span>
                          </div>
                        )}
                        {streamSources.length > 0 && (
                          <div className="message-sources"><span><Globe2 size={12} /> Sources found</span></div>
                        )}
                      </div>
                    </article>
                  )}
                </div>
              )}
            </div>

            <div className="composer-dock">
              {error && <div className="chat-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Dismiss error"><X size={15} /></button></div>}
              <div className={`chat-composer ${sending ? "is-sending" : ""}`}>
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  placeholder="Ask about your spending or something live…"
                  aria-label="Message Claude"
                  rows={1}
                  disabled={sending}
                />
                <div className="composer-footer">
                  <div><span><Database size={12} /> Ledger</span><span><Globe2 size={12} /> Web</span></div>
                  <span className="composer-hint">Shift + Enter for a new line</span>
                  <button type="button" onClick={() => void sendMessage()} disabled={!draft.trim() || sending} aria-label="Send message"><ArrowUp size={17} /></button>
                </div>
              </div>
              <p className="chat-disclaimer">Claude can make mistakes. Verify important financial decisions.</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
