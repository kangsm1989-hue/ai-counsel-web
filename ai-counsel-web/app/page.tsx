"use client";

import { useEffect, useMemo, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { auth, db } from "./lib/firebase";
import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";

type Msg = { role: "user" | "assistant"; text: string };
type TrackId = "career" | "emotion" | "crisis";
type TestId = "career-fit" | "stress-check" | "risk-check";
type TabId = "counsel" | "diary";

type Track = {
  id: TrackId;
  title: string;
  subtitle: string;
  color: string;
  apiTrack: "진로" | "정서" | "위기";
};

type TestPaper = {
  id: TestId;
  title: string;
  description: string;
  questions: string[];
};

type JournalEntry = {
  id: string;
  uid: string;
  date: string;
  mood: number;
  text: string;
  createdAt?: unknown;
};

type WeeklyPoint = {
  date: string;
  label: string;
  mood: number | null;
  score: number | null;
};

const tracks: Track[] = [
  {
    id: "career",
    title: "진로상담 분야",
    subtitle: "학업, 적성, 직무 탐색을 중심으로 상담합니다.",
    color: "#2563eb",
    apiTrack: "진로",
  },
  {
    id: "emotion",
    title: "정서 지원 분야",
    subtitle: "불안, 무기력, 대인관계 스트레스를 함께 정리합니다.",
    color: "#f97316",
    apiTrack: "정서",
  },
  {
    id: "crisis",
    title: "위기 분야",
    subtitle: "자해/자살 위험 신호를 우선 파악하고 즉시 안전 계획을 안내합니다.",
    color: "#dc2626",
    apiTrack: "위기",
  },
];

const papers: TestPaper[] = [
  {
    id: "career-fit",
    title: "진로 흥미 스크리닝",
    description: "진로 탐색 전 현재 관심 방향을 빠르게 점검합니다.",
    questions: [
      "새로운 분야를 배우는 과정이 기대된다.",
      "내가 잘하는 일을 설명할 수 있다.",
      "향후 3년 목표 직무/전공이 대략 떠오른다.",
      "의사결정 시 나의 가치관이 분명하다.",
      "실무 경험(프로젝트/활동)을 시도해보고 싶다.",
    ],
  },
  {
    id: "stress-check",
    title: "정서 스트레스 체크",
    description: "최근 2주 기준 정서적 부담을 확인합니다.",
    questions: [
      "사소한 일에도 쉽게 지치거나 예민해진다.",
      "걱정이 머릿속에서 계속 반복된다.",
      "잠들기 어렵거나 자주 깬다.",
      "하루 중 기분이 자주 가라앉는다.",
      "도움을 요청하기가 어렵다고 느낀다.",
    ],
  },
  {
    id: "risk-check",
    title: "위기 신호 자가점검",
    description: "즉시 대응이 필요한 위험 신호를 선별합니다.",
    questions: [
      "최근 스스로를 해치고 싶은 생각이 들었다.",
      "극단적 선택 관련 생각이 떠오른 적이 있다.",
      "현재 혼자 있는 시간이 길어 안전이 걱정된다.",
      "감정 조절이 어렵고 충동이 강해졌다.",
      "도움을 요청할 사람/기관이 떠오르지 않는다.",
    ],
  },
];

const likert = [
  { score: 0, label: "전혀 아니다" },
  { score: 1, label: "아니다" },
  { score: 2, label: "보통" },
  { score: 3, label: "그렇다" },
  { score: 4, label: "매우 그렇다" },
];

const quickMenus = [
  { name: "진로 로드맵", icon: "🧭" },
  { name: "감정 기록", icon: "📝" },
  { name: "검사 센터", icon: "🧪" },
  { name: "AI 채팅", icon: "💬" },
  { name: "위기 도움", icon: "☎" },
  { name: "상담 내역", icon: "📁" },
];

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function scoreFromMood(mood: number) {
  return Math.round(((Math.max(1, Math.min(10, mood)) - 1) / 9) * 100);
}

function moodLabel(mood: number) {
  if (mood >= 8) return "좋음";
  if (mood >= 5) return "보통";
  return "힘듦";
}

function trendLabel(delta: number) {
  if (delta > 5) return "개선";
  if (delta < -5) return "하락";
  return "유지";
}

const googleProvider = new GoogleAuthProvider();

export default function Page() {
  const [activeTab, setActiveTab] = useState<TabId>("counsel");
  const [uid, setUid] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [isGuestUser, setIsGuestUser] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authMessage, setAuthMessage] = useState("");

  const [selectedTrack, setSelectedTrack] = useState<TrackId>("career");
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text: "종합 상담에 오신 것을 환영합니다. 먼저 오늘 가장 필요한 분야를 선택해 주세요.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [chatId] = useState(() => crypto.randomUUID());

  const [activeTestId, setActiveTestId] = useState<TestId | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});

  const [journalText, setJournalText] = useState("");
  const [journalDate, setJournalDate] = useState(todayInputValue());
  const [mood, setMood] = useState(5);
  const [saveStatus, setSaveStatus] = useState("");
  const [journalList, setJournalList] = useState<JournalEntry[]>([]);
  const [weeklyAiSummary, setWeeklyAiSummary] = useState("");
  const [analyzing, setAnalyzing] = useState(false);

  const selectedTrackInfo = useMemo(
    () => tracks.find((track) => track.id === selectedTrack) ?? tracks[0],
    [selectedTrack]
  );

  const activePaper = useMemo(
    () => papers.find((paper) => paper.id === activeTestId) ?? null,
    [activeTestId]
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUid(user.uid);
        setIsGuestUser(user.isAnonymous);
        setUserEmail(user.email ?? "게스트 사용자");
      } else {
        setUid(null);
        setUserEmail("");
        setIsGuestUser(false);
        setJournalList([]);
      }
      setAuthLoading(false);
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!uid) return;

    const q = query(
      collection(db, "journals"),
      where("uid", "==", uid),
      orderBy("date", "desc"),
      limit(120)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const rows: JournalEntry[] = snapshot.docs.map((journalDoc) => {
        const data = journalDoc.data();
        return {
          id: journalDoc.id,
          uid: String(data.uid ?? ""),
          date: String(data.date ?? ""),
          mood: Number(data.mood ?? 5),
          text: String(data.text ?? ""),
          createdAt: data.createdAt,
        };
      });
      setJournalList(rows);
    });

    return () => unsub();
  }, [uid]);

  const weeklyPoints = useMemo<WeeklyPoint[]>(() => {
    const byDate = new Map<string, JournalEntry>();
    for (const entry of journalList) {
      if (!byDate.has(entry.date)) byDate.set(entry.date, entry);
    }

    const points: WeeklyPoint[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const day = new Date();
      day.setDate(day.getDate() - i);
      const key = day.toISOString().slice(0, 10);
      const entry = byDate.get(key);
      const label = `${day.getMonth() + 1}/${day.getDate()}`;
      points.push({
        date: key,
        label,
        mood: entry ? entry.mood : null,
        score: entry ? scoreFromMood(entry.mood) : null,
      });
    }

    return points;
  }, [journalList]);

  const weeklyStats = useMemo(() => {
    const valid = weeklyPoints.filter((p) => p.score !== null);
    const average =
      valid.length > 0
        ? Math.round(valid.reduce((sum, p) => sum + Number(p.score), 0) / valid.length)
        : null;

    const half = Math.floor(weeklyPoints.length / 2);
    const first = weeklyPoints.slice(0, half).filter((p) => p.score !== null);
    const second = weeklyPoints.slice(half).filter((p) => p.score !== null);

    const firstAvg =
      first.length > 0
        ? first.reduce((sum, p) => sum + Number(p.score), 0) / first.length
        : null;
    const secondAvg =
      second.length > 0
        ? second.reduce((sum, p) => sum + Number(p.score), 0) / second.length
        : null;

    const delta =
      firstAvg !== null && secondAvg !== null ? Math.round(secondAvg - firstAvg) : 0;

    return {
      daysWithEntry: valid.length,
      average,
      delta,
      trend: trendLabel(delta),
    };
  }, [weeklyPoints]);

  const latestEntries = useMemo(() => journalList.slice(0, 20), [journalList]);

  const weeklyEntryText = useMemo(() => {
    const weeklyDates = new Set(weeklyPoints.map((p) => p.date));
    return journalList
      .filter((entry) => weeklyDates.has(entry.date))
      .map((entry) => `${entry.date} (기분 ${entry.mood}/10): ${entry.text}`)
      .join("\n");
  }, [journalList, weeklyPoints]);

  const developerPayload = useMemo(() => {
    return {
      generatedAt: new Date().toISOString(),
      uid,
      entryCount: journalList.length,
      weekly: {
        averageScore: weeklyStats.average,
        trend: weeklyStats.trend,
        delta: weeklyStats.delta,
        points: weeklyPoints,
      },
      entries: journalList.map((entry) => ({
        id: entry.id,
        date: entry.date,
        mood: entry.mood,
        moodLabel: moodLabel(entry.mood),
        text: entry.text,
      })),
    };
  }, [journalList, uid, weeklyPoints, weeklyStats]);

  async function handleGoogleLogin() {
    setAuthSubmitting(true);
    setAuthMessage("");

    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "구글 로그인 중 오류가 발생했습니다.";
      setAuthMessage(message);
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleGuestLogin() {
    setAuthSubmitting(true);
    setAuthMessage("");

    try {
      await signInAnonymously(auth);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "게스트 로그인 중 오류가 발생했습니다.";
      setAuthMessage(message);
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleLogout() {
    try {
      await signOut(auth);
      setActiveTab("counsel");
      setAuthMessage("로그아웃되었습니다.");
    } catch (error) {
      console.error(error);
      setAuthMessage("로그아웃 중 오류가 발생했습니다.");
    }
  }

  async function saveJournal() {
    if (!uid) {
      setSaveStatus("아직 로그인 중이라 저장할 수 없습니다.");
      return;
    }

    if (!journalText.trim()) {
      setSaveStatus("내용을 먼저 입력해 주세요.");
      return;
    }

    try {
      await addDoc(collection(db, "journals"), {
        uid,
        date: journalDate,
        mood,
        text: journalText.trim(),
        createdAt: serverTimestamp(),
      });

      setJournalText("");
      setSaveStatus("저장 완료");
    } catch (error) {
      console.error(error);
      setSaveStatus("저장 실패: 콘솔을 확인해 주세요.");
    }
  }

  async function analyzeWeeklyWithAi() {
    if (!weeklyEntryText.trim()) {
      setWeeklyAiSummary("최근 7일 일기 데이터가 없어서 분석할 수 없습니다.");
      return;
    }

    setAnalyzing(true);
    setWeeklyAiSummary("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          track: "정서",
          message:
            "아래 최근 7일 일기를 보고 1)감정 흐름 2)스트레스 유발 요인 3)다음 주 실천 3가지를 간단히 정리해줘.\n\n" +
            weeklyEntryText,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`분석 실패 (${res.status}): ${errText}`);
      }

      const data = (await res.json()) as { reply?: string };
      setWeeklyAiSummary(data.reply ?? "분석 결과가 비어 있습니다.");
    } catch (error) {
      console.error(error);
      setWeeklyAiSummary("주간 AI 분석 중 오류가 발생했습니다.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setLoading(true);

    try {
      await setDoc(
        doc(db, "chats", chatId),
        {
          uid,
          track: selectedTrack,
          createdAt: serverTimestamp(),
          lastMessageAt: serverTimestamp(),
        },
        { merge: true }
      );

      await addDoc(collection(db, "chats", chatId, "messages"), {
        role: "user",
        text,
        track: selectedTrack,
        createdAt: serverTimestamp(),
      });

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          track: selectedTrackInfo.apiTrack,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`API Error ${res.status}: ${errText}`);
      }

      const data = (await res.json()) as { reply?: string };
      const reply = data.reply ?? "응답 생성 실패";

      setMessages((prev) => [...prev, { role: "assistant", text: reply }]);

      await addDoc(collection(db, "chats", chatId, "messages"), {
        role: "assistant",
        text: reply,
        track: selectedTrack,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "연결 중 문제가 발생했어요. 잠시 후 다시 시도해주세요.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function selectTrack(track: Track) {
    setSelectedTrack(track.id);
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        text: `${track.title}로 전환했습니다. ${track.subtitle}`,
      },
    ]);
  }

  function startTest(testId: TestId) {
    setActiveTestId(testId);
    setAnswers({});
  }

  function applyAnswer(qIdx: number, score: number) {
    setAnswers((prev) => ({ ...prev, [qIdx]: score }));
  }

  function submitTest() {
    if (!activePaper) return;
    const total = Object.values(answers).reduce((sum, score) => sum + score, 0);
    const max = activePaper.questions.length * 4;
    const ratio = total / max;

    let level = "낮음";
    if (ratio >= 0.67) level = "높음";
    else if (ratio >= 0.34) level = "중간";

    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        text: `[${activePaper.title}] 결과: ${total}/${max}점 (${level}).\n이 결과는 참고용이며, 필요 시 전문상담과 함께 해석하는 것을 권장합니다.`,
      },
    ]);
    setActiveTestId(null);
    setAnswers({});
  }

  const isTestComplete =
    activePaper !== null && Object.keys(answers).length === activePaper.questions.length;

  return (
    <main className="workspace">
      {authLoading ? (
        <section className="authGate">
          <article className="authCard">
            <h1>상담 워크스페이스</h1>
            <p>로그인 상태를 확인하고 있습니다...</p>
          </article>
        </section>
      ) : !uid ? (
        <section className="authGate">
          <article className="authCard">
            <h1>로그인 후 이용할 수 있어요</h1>
            <p>상담 기록과 일기 데이터는 로그인 사용자에게만 표시됩니다.</p>
            <div className="authActions">
              <button className="googleBtn" onClick={handleGoogleLogin} disabled={authSubmitting}>
                {authSubmitting ? "처리 중..." : "Google로 로그인"}
              </button>
              <button className="guestBtn" onClick={handleGuestLogin} disabled={authSubmitting}>
                {authSubmitting ? "처리 중..." : "게스트로 시작하기"}
              </button>
            </div>
            {authMessage && <p className="authMessage">{authMessage}</p>}
          </article>
        </section>
      ) : (
        <>
          <section className="hero">
            <h1>종합 AI 상담 워크스페이스</h1>
            <p>상담 채팅과 하루 일기를 분리해 관리하고, 주간 감정 흐름까지 확인할 수 있습니다.</p>
            <div className="heroArt" aria-hidden>
              <div className="sun" />
              <div className="cloud cloudA" />
              <div className="cloud cloudB" />
              <div className="leaf leafA" />
              <div className="leaf leafB" />
            </div>
          </section>

          <section className="userBar">
            <p>{isGuestUser ? "게스트 사용자" : userEmail}</p>
            <button onClick={handleLogout}>로그아웃</button>
          </section>

          <section className="topTabs">
            <button
              className={`tabBtn ${activeTab === "counsel" ? "active" : ""}`}
              onClick={() => setActiveTab("counsel")}
            >
              상담 워크스페이스
            </button>
            <button
              className={`tabBtn ${activeTab === "diary" ? "active" : ""}`}
              onClick={() => setActiveTab("diary")}
            >
              하루 일기
            </button>
          </section>

          {activeTab === "counsel" && (
            <>
              <section className="composerCard">
                <div className="cozyRibbon" aria-hidden>
                  <span>☕</span>
                  <span>🧸</span>
                  <span>🕯️</span>
                </div>
                <div className="trackRow">
                  {tracks.map((track) => (
                    <button
                      key={track.id}
                      onClick={() => selectTrack(track)}
                      className={`trackChip ${selectedTrack === track.id ? "active" : ""}`}
                      style={{ borderColor: track.color }}
                    >
                      <span className="dot" style={{ backgroundColor: track.color }} />
                      {track.title}
                    </button>
                  ))}
                </div>

                <div className="inputRow">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") send();
                    }}
                    placeholder={`${selectedTrackInfo.title}에 대해 질문해보세요`}
                  />
                  <button onClick={send} disabled={loading}>
                    {loading ? "전송 중" : "보내기"}
                  </button>
                </div>

                {selectedTrack === "crisis" && (
                  <div className="urgent">위기 상황이면 즉시 1393, 112, 119에 연락하세요.</div>
                )}
              </section>

              <section className="menuStrip" aria-label="상담 도구 메뉴">
                {quickMenus.map((menu) => (
                  <div key={menu.name} className="menuItem">
                    <span>{menu.icon}</span>
                    <p>{menu.name}</p>
                  </div>
                ))}
              </section>

              <section className="gridLayout">
                <article className="panel">
                  <h2>AI 상담 대화</h2>
                  <div className="chatBox">
                    {messages.map((m, i) => (
                      <div key={i} className={`bubble ${m.role}`}>
                        <strong>{m.role === "user" ? "나" : "AI"}</strong>
                        <p>{m.text}</p>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="panel">
                  <h2>검사 항목</h2>
                  <div className="testList">
                    {papers.map((paper) => (
                      <div key={paper.id} className="testCard">
                        <h3>{paper.title}</h3>
                        <p>{paper.description}</p>
                        <button onClick={() => startTest(paper.id)}>검사 시작</button>
                      </div>
                    ))}
                  </div>

                  {activePaper && (
                    <div className="activeTest">
                      <h3>{activePaper.title}</h3>
                      {activePaper.questions.map((q, idx) => (
                        <div key={q} className="questionRow">
                          <p>
                            {idx + 1}. {q}
                          </p>
                          <div className="likertRow">
                            {likert.map((choice) => (
                              <label key={choice.score}>
                                <input
                                  type="radio"
                                  name={`q-${idx}`}
                                  checked={answers[idx] === choice.score}
                                  onChange={() => applyAnswer(idx, choice.score)}
                                />
                                {choice.label}
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}

                      <div className="testActions">
                        <button onClick={submitTest} disabled={!isTestComplete}>
                          결과 계산
                        </button>
                        <button
                          className="ghost"
                          onClick={() => {
                            setActiveTestId(null);
                            setAnswers({});
                          }}
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              </section>
            </>
          )}

          {activeTab === "diary" && (
            <section className="diaryLayout">
              <article className="panel full cozyScene" aria-hidden>
                <div className="sceneMoon" />
                <div className="sceneMug" />
                <div className="sceneBook" />
                <p>따뜻한 공간에서 오늘의 마음을 천천히 기록해보세요.</p>
              </article>
              <article className="panel">
                <h2>오늘 일기 작성</h2>
                <div className="diaryForm">
                  <label>
                    날짜
                    <input
                      type="date"
                      value={journalDate}
                      onChange={(e) => setJournalDate(e.target.value)}
                    />
                  </label>

                  <label>
                    오늘의 기분 ({mood}/10)
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={mood}
                      onChange={(e) => setMood(Number(e.target.value))}
                    />
                  </label>

                  <textarea
                    value={journalText}
                    onChange={(e) => setJournalText(e.target.value)}
                    placeholder="오늘 있었던 일, 감정, 생각을 자유롭게 적어보세요."
                    rows={8}
                  />

                  <button className="primaryBtn" onClick={saveJournal}>
                    일기 저장
                  </button>
                  {saveStatus && <p className="statusText">{saveStatus}</p>}
                </div>
              </article>

              <article className="panel">
                <h2>최근 일기</h2>
                <div className="journalList">
                  {latestEntries.length === 0 && <p className="emptyText">저장된 일기가 없습니다.</p>}
                  {latestEntries.map((entry) => (
                    <div key={entry.id} className="journalCard">
                      <div className="journalMeta">
                        <strong>{entry.date}</strong>
                        <span>
                          기분 {entry.mood}/10 ({moodLabel(entry.mood)})
                        </span>
                      </div>
                      <p>{entry.text}</p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="panel">
                <h2>최근 7일 감정 그래프</h2>
                <p className="summaryText">
                  기록일 {weeklyStats.daysWithEntry}일 / 평균 점수 {weeklyStats.average ?? "-"} / 추세 {weeklyStats.trend}
                </p>
                <div className="weeklyChart">
                  {weeklyPoints.map((point) => (
                    <div key={point.date} className="barCol">
                      <div className="barWrap">
                        <div
                          className={`bar ${point.score === null ? "empty" : "filled"}`}
                          style={{ height: `${point.score ?? 8}%` }}
                          title={
                            point.score === null
                              ? `${point.date}: 기록 없음`
                              : `${point.date}: ${point.mood}/10`
                          }
                        />
                      </div>
                      <span>{point.label}</span>
                    </div>
                  ))}
                </div>
              </article>

              <article className="panel">
                <h2>주간 AI 분석</h2>
                <button className="primaryBtn" onClick={analyzeWeeklyWithAi} disabled={analyzing}>
                  {analyzing ? "분석 중" : "최근 7일 일기 분석하기"}
                </button>
                <pre className="analysisBox">{weeklyAiSummary || "아직 분석 결과가 없습니다."}</pre>
              </article>

              <article className="panel full">
                <h2>개발자 분석 데이터(JSON)</h2>
                <p className="summaryText">
                  개발자는 이 JSON 구조를 그대로 수집해서 외부 분석 파이프라인으로 넘길 수 있습니다.
                </p>
                <pre className="jsonBox">{JSON.stringify(developerPayload, null, 2)}</pre>
              </article>
            </section>
          )}
        </>
      )}

      <style jsx>{`
        .workspace {
          min-height: 100vh;
          padding: 28px 18px 44px;
          background:
            radial-gradient(circle at 12% 10%, #ffe7d1 0%, rgba(255, 231, 209, 0) 42%),
            radial-gradient(circle at 88% 16%, #ffeadd 0%, rgba(255, 234, 221, 0) 34%),
            linear-gradient(180deg, #fff9f4 0%, #fff5ed 54%, #fffaf7 100%);
          font-family: "Pretendard Variable", "Noto Sans KR", var(--font-geist-sans), sans-serif;
          color: #3f2f2a;
        }

        .hero {
          max-width: 1100px;
          margin: 0 auto;
          text-align: center;
          animation: rise 0.45s ease-out;
        }

        .hero h1 {
          margin: 0;
          font-size: clamp(1.7rem, 2.8vw, 2.8rem);
          font-weight: 800;
          letter-spacing: -0.02em;
          color: #5a3f35;
          text-shadow: 0 1px 0 rgba(255, 255, 255, 0.7);
        }

        .hero p {
          margin: 10px 0 0;
          color: #7a5f53;
        }

        .authGate {
          min-height: calc(100vh - 72px);
          display: grid;
          place-items: center;
          padding: 16px;
        }

        .authCard {
          width: min(440px, 100%);
          padding: 24px 20px;
          border-radius: 20px;
          background: linear-gradient(180deg, #fffdf9 0%, #fff5ec 100%);
          border: 1px solid #f0dbc9;
          box-shadow: 0 16px 34px rgba(139, 95, 68, 0.14);
          text-align: center;
        }

        .authCard h1 {
          margin: 0;
          font-size: 1.4rem;
          color: #5f4338;
        }

        .authCard p {
          margin: 10px 0 0;
          color: #7a6054;
        }

        .authActions {
          margin-top: 14px;
          display: grid;
          gap: 8px;
        }

        .googleBtn,
        .guestBtn {
          border: 1px solid #e7d5c7;
          border-radius: 12px;
          padding: 11px 12px;
          background: #fffdfb;
          color: #4a372f;
          font-weight: 700;
          cursor: pointer;
        }

        .googleBtn {
          background: linear-gradient(135deg, #f09a74 0%, #e67e6b 100%);
          border: 0;
          color: #fff;
          box-shadow: 0 10px 20px rgba(229, 126, 107, 0.3);
        }

        .guestBtn {
          background: #fff8f1;
          color: #7a574a;
        }

        .googleBtn:disabled,
        .guestBtn:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .authMessage {
          margin: 8px 0 0;
          color: #8a5f4f;
          font-size: 0.9rem;
          word-break: break-word;
        }

        .userBar {
          max-width: 1100px;
          margin: 14px auto 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border-radius: 14px;
          background: rgba(255, 248, 241, 0.9);
          border: 1px solid #efdbcf;
        }

        .userBar p {
          margin: 0;
          color: #6f5348;
          font-size: 0.9rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .userBar button {
          border: 1px solid #e8c7b5;
          background: #fff6ef;
          color: #7a574a;
          border-radius: 10px;
          padding: 7px 12px;
          font-weight: 700;
          cursor: pointer;
        }

        .heroArt {
          margin: 14px auto 0;
          width: min(420px, 92%);
          height: 72px;
          border-radius: 999px;
          background: rgba(255, 246, 238, 0.92);
          border: 1px solid #f3ddd0;
          position: relative;
          overflow: hidden;
        }

        .sun {
          position: absolute;
          right: 18px;
          top: 14px;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: radial-gradient(circle at 35% 35%, #ffe7a8 0%, #f3b56d 100%);
          box-shadow: 0 0 0 8px rgba(255, 214, 155, 0.18);
        }

        .cloud {
          position: absolute;
          height: 22px;
          border-radius: 999px;
          background: #fff;
          box-shadow: 14px -7px 0 #fff;
          opacity: 0.9;
        }

        .cloudA {
          width: 54px;
          left: 24px;
          top: 25px;
        }

        .cloudB {
          width: 46px;
          left: 108px;
          top: 18px;
        }

        .leaf {
          position: absolute;
          width: 16px;
          height: 26px;
          border-radius: 14px 14px 14px 2px;
          background: linear-gradient(180deg, #b8d7b0 0%, #7ca884 100%);
          transform-origin: bottom center;
        }

        .leafA {
          left: 200px;
          top: 30px;
          transform: rotate(-18deg);
        }

        .leafB {
          left: 220px;
          top: 34px;
          transform: rotate(12deg);
        }

        .topTabs {
          max-width: 1100px;
          margin: 18px auto 0;
          display: flex;
          gap: 10px;
          padding: 6px;
          border-radius: 16px;
          background: rgba(255, 247, 239, 0.88);
          border: 1px solid #f1ddd0;
          box-shadow: 0 8px 20px rgba(150, 97, 68, 0.08);
        }

        .tabBtn {
          border: 1px solid #ebd8c8;
          background: #fffaf6;
          padding: 10px 14px;
          border-radius: 12px;
          font-weight: 700;
          cursor: pointer;
          color: #70564b;
          transition: all 0.2s ease;
        }

        .tabBtn.active {
          background: linear-gradient(135deg, #f6a779 0%, #ee876f 100%);
          border-color: #e98a68;
          color: #fff;
          box-shadow: 0 8px 18px rgba(238, 135, 111, 0.3);
        }

        .composerCard {
          max-width: 1100px;
          margin: 14px auto 0;
          background: linear-gradient(180deg, #fffdfa 0%, #fff8f2 100%);
          border: 1px solid #f1ddcf;
          border-radius: 24px;
          padding: 16px;
          box-shadow: 0 12px 34px rgba(135, 97, 73, 0.12);
          animation: rise 0.55s ease-out;
        }

        .cozyRibbon {
          display: inline-flex;
          gap: 8px;
          padding: 6px 10px;
          border-radius: 999px;
          background: #fff4eb;
          border: 1px solid #f0d9ca;
          margin-bottom: 12px;
          font-size: 0.95rem;
        }

        .trackRow {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 14px;
        }

        .trackChip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: #fff9f5;
          border: 1px solid;
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 0.92rem;
          cursor: pointer;
          color: #735a4f;
        }

        .trackChip.active {
          background: #fff0e3;
          font-weight: 700;
        }

        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .inputRow {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 10px;
        }

        .inputRow input,
        .diaryForm input,
        .diaryForm textarea {
          border: 1px solid #e7d5c7;
          border-radius: 14px;
          padding: 12px 14px;
          font-size: 0.98rem;
          background: #fffdfb;
          width: 100%;
          color: #4a372f;
        }

        .inputRow button,
        .primaryBtn {
          border: 0;
          border-radius: 14px;
          padding: 10px 16px;
          background: linear-gradient(135deg, #f09a74 0%, #e67e6b 100%);
          color: #fff;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 10px 20px rgba(229, 126, 107, 0.3);
        }

        .inputRow button:disabled,
        .primaryBtn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .urgent {
          margin-top: 10px;
          padding: 10px 12px;
          border-radius: 10px;
          background: #fff1ee;
          color: #a84b43;
          border: 1px solid #f5c3bb;
          font-size: 0.92rem;
        }

        .menuStrip {
          max-width: 1100px;
          margin: 18px auto 0;
          display: grid;
          grid-template-columns: repeat(6, minmax(90px, 1fr));
          gap: 10px;
          animation: rise 0.65s ease-out;
        }

        .menuItem {
          background: #fffaf6;
          border: 1px solid #f0dfd3;
          border-radius: 16px;
          text-align: center;
          padding: 12px 8px;
          box-shadow: 0 8px 18px rgba(147, 99, 75, 0.08);
        }

        .menuItem span {
          display: inline-flex;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          align-items: center;
          justify-content: center;
          font-size: 1.2rem;
          background: #ffeede;
        }

        .menuItem p {
          margin: 8px 0 0;
          font-size: 0.86rem;
          color: #72584d;
        }

        .gridLayout {
          max-width: 1100px;
          margin: 18px auto 0;
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          gap: 14px;
          animation: rise 0.75s ease-out;
        }

        .diaryLayout {
          max-width: 1100px;
          margin: 18px auto 0;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          animation: rise 0.75s ease-out;
        }

        .panel {
          background: linear-gradient(180deg, #fffdfa 0%, #fff8f3 100%);
          border: 1px solid #efdacc;
          border-radius: 20px;
          padding: 16px;
          box-shadow: 0 12px 26px rgba(127, 90, 69, 0.1);
        }

        .panel.full {
          grid-column: 1 / -1;
        }

        .cozyScene {
          min-height: 98px;
          display: grid;
          grid-template-columns: 52px 52px 52px 1fr;
          align-items: center;
          gap: 10px;
          background: linear-gradient(180deg, #fff9f2 0%, #fff2e8 100%);
        }

        .cozyScene p {
          margin: 0;
          color: #7c5f50;
          font-size: 0.95rem;
        }

        .sceneMoon {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          background: radial-gradient(circle at 40% 35%, #fff6c9 0%, #f2d28f 100%);
          box-shadow: 12px 0 0 rgba(255, 249, 224, 0.9);
        }

        .sceneMug {
          width: 34px;
          height: 28px;
          border-radius: 6px 6px 12px 12px;
          background: #f3c4a6;
          position: relative;
        }

        .sceneMug::after {
          content: "";
          position: absolute;
          right: -9px;
          top: 7px;
          width: 10px;
          height: 10px;
          border: 3px solid #f3c4a6;
          border-left: 0;
          border-radius: 0 8px 8px 0;
        }

        .sceneBook {
          width: 38px;
          height: 28px;
          border-radius: 5px;
          background: linear-gradient(90deg, #e8b193 48%, #f3c7af 48%);
          box-shadow: inset -2px 0 0 rgba(255, 255, 255, 0.45);
        }

        .panel h2 {
          margin: 0 0 10px;
          font-size: 1.1rem;
          color: #5f4338;
        }

        .chatBox {
          max-height: 560px;
          overflow-y: auto;
          padding-right: 4px;
        }

        .bubble {
          margin-bottom: 10px;
          border-radius: 14px;
          padding: 10px 11px;
          border: 1px solid #f0ddd0;
          background: #fff8f1;
        }

        .bubble.user {
          background: #ffeede;
          border-color: #f7ccb0;
        }

        .bubble strong {
          display: block;
          font-size: 0.84rem;
        }

        .bubble p,
        .journalCard p,
        .analysisBox,
        .jsonBox {
          margin: 4px 0 0;
          white-space: pre-wrap;
          line-height: 1.45;
        }

        .diaryForm {
          display: grid;
          gap: 10px;
        }

        .diaryForm label {
          display: grid;
          gap: 6px;
          font-size: 0.88rem;
          color: #6d5348;
        }

        .statusText,
        .summaryText,
        .emptyText {
          margin: 8px 0 0;
          color: #7a6054;
          font-size: 0.9rem;
        }

        .journalList {
          display: grid;
          gap: 10px;
          max-height: 460px;
          overflow-y: auto;
        }

        .journalCard {
          border: 1px solid #efdacc;
          border-radius: 14px;
          padding: 10px;
          background: #fff9f4;
        }

        .journalMeta {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          font-size: 0.85rem;
        }

        .weeklyChart {
          margin-top: 12px;
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: 8px;
          align-items: end;
        }

        .barCol {
          display: grid;
          gap: 8px;
          justify-items: center;
          font-size: 0.8rem;
          color: #7a6054;
        }

        .barWrap {
          width: 100%;
          height: 140px;
          border-radius: 12px;
          background: #f3e3d8;
          display: flex;
          align-items: end;
          overflow: hidden;
        }

        .bar {
          width: 100%;
          border-radius: 10px;
          min-height: 8px;
          transition: height 0.25s ease;
        }

        .bar.filled {
          background: linear-gradient(180deg, #f6b489 0%, #ea876f 100%);
        }

        .bar.empty {
          background: repeating-linear-gradient(
            -45deg,
            #e8d6c8,
            #e8d6c8 6px,
            #f4e7dd 6px,
            #f4e7dd 12px
          );
        }

        .analysisBox,
        .jsonBox {
          margin-top: 10px;
          padding: 10px;
          border-radius: 14px;
          border: 1px solid #ebd8cb;
          background: #fffaf6;
          max-height: 260px;
          overflow: auto;
          font-size: 0.84rem;
        }

        .testList {
          display: grid;
          gap: 10px;
        }

        .testCard {
          border: 1px solid #efdacc;
          border-radius: 14px;
          padding: 10px;
          background: #fff9f4;
        }

        .testCard h3 {
          margin: 0;
          font-size: 0.97rem;
        }

        .testCard p {
          margin: 6px 0 10px;
          color: #785e51;
          font-size: 0.88rem;
        }

        .testCard button,
        .testActions button {
          border: 0;
          background: linear-gradient(135deg, #f09a74 0%, #e67e6b 100%);
          color: #fff;
          border-radius: 9px;
          padding: 8px 10px;
          cursor: pointer;
          font-size: 0.86rem;
          font-weight: 700;
        }

        .activeTest {
          margin-top: 14px;
          border-top: 1px dashed #e6cdbc;
          padding-top: 12px;
        }

        .activeTest h3 {
          margin: 0 0 8px;
        }

        .questionRow {
          border: 1px solid #f0ddd0;
          border-radius: 10px;
          padding: 10px;
          margin-bottom: 8px;
          background: #fffdfb;
        }

        .questionRow p {
          margin: 0 0 8px;
          font-size: 0.9rem;
        }

        .likertRow {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .likertRow label {
          display: inline-flex;
          gap: 4px;
          align-items: center;
          font-size: 0.8rem;
          color: #6e5449;
        }

        .testActions {
          display: flex;
          gap: 8px;
          margin-top: 6px;
        }

        .testActions .ghost {
          background: #f2dfd0;
          color: #694e42;
        }

        .testActions button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        @media (max-width: 980px) {
          .menuStrip {
            grid-template-columns: repeat(3, minmax(90px, 1fr));
          }

          .gridLayout,
          .diaryLayout {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .workspace {
            padding: 18px 12px 28px;
          }

          .topTabs {
            display: grid;
            grid-template-columns: 1fr 1fr;
          }

          .inputRow {
            grid-template-columns: 1fr;
          }

          .inputRow button {
            height: 42px;
          }

          .menuStrip {
            grid-template-columns: repeat(2, minmax(90px, 1fr));
          }
        }

        @keyframes rise {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </main>
  );
}
