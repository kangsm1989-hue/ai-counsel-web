"use client";

import { type KeyboardEvent, useEffect, useMemo, useState } from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
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
type TrackId = "career" | "emotion" | "parenting" | "crisis";
type TestId =
  | "career-fit"
  | "stress-check"
  | "depression-check"
  | "personality-test"
  | "sct-test";
type TabId = "counsel" | "diary" | "child" | "tests";
type TechniqueId = "gestalt" | "psychoanalysis" | "rebt" | "humanistic" | "behaviorism";

type Track = {
  id: TrackId;
  title: string;
  subtitle: string;
  color: string;
  apiTrack: "진로" | "정서" | "양육" | "위기";
};

type TestPaper = {
  id: TestId;
  mode: "likert" | "sct";
  title: string;
  description: string;
  questions: string[];
  sourceName: string;
  sourceUrl: string;
  note: string;
};

type Technique = {
  id: TechniqueId;
  title: string;
  description: string;
};

type IntakeForm = {
  age: string;
  currentSituation: string;
  periodFrequency: string;
  hardestPoint: string;
  helpStyle: string;
};

type TestResultRow = {
  label: string;
  score: number;
  max: number;
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

type ChildEntry = {
  id: string;
  uid: string;
  date: string;
  childName: string;
  situation: string;
  intervention: string;
  outcome: string;
  progress: number;
  aiSolution: string;
  createdAt?: unknown;
};

type ChildPoint = {
  date: string;
  label: string;
  progress: number | null;
  score: number | null;
};

const tracks: Track[] = [
  {
    id: "career",
    title: "진로",
    subtitle: "학업, 적성, 직무 탐색을 중심으로 상담합니다.",
    color: "#2563eb",
    apiTrack: "진로",
  },
  {
    id: "emotion",
    title: "정서",
    subtitle: "불안, 무기력, 대인관계 스트레스를 함께 정리합니다.",
    color: "#f97316",
    apiTrack: "정서",
  },
  {
    id: "parenting",
    title: "양육/부모",
    subtitle: "아이 행동, 부모 스트레스, 가족 소통 문제를 함께 정리합니다.",
    color: "#14b8a6",
    apiTrack: "양육",
  },
  {
    id: "crisis",
    title: "위기",
    subtitle: "자해/자살 위험 신호를 우선 파악하고 즉시 안전 계획을 안내합니다.",
    color: "#dc2626",
    apiTrack: "위기",
  },
];

const papers: TestPaper[] = [
  {
    id: "career-fit",
    mode: "likert",
    title: "진로 흥미 스크리닝 (Holland RIASEC 기반)",
    description: "직업 흥미 6유형(RIASEC) 구조를 참고한 간이 점검입니다.",
    questions: [
      "기계·장비를 직접 다루는 활동이 흥미롭다.",
      "손으로 직접 만들고 조립하는 작업을 선호한다.",
      "실외 활동이나 현장 중심 업무가 잘 맞는다.",
      "문제가 생기면 직접 고쳐보는 편이다.",
      "신체를 활용하는 실무형 활동을 좋아한다.",
      "도구 사용법을 익히고 개선하는 과정이 즐겁다.",
      "원인과 결과를 분석해 결론 내리는 일이 좋다.",
      "데이터를 보고 패턴을 찾는 데 흥미가 있다.",
      "새로운 이론·개념을 탐구하는 것이 재미있다.",
      "복잡한 문제를 논리적으로 푸는 편이다.",
      "실험·검증 과정을 통해 확신을 얻고 싶다.",
      "근거 기반으로 판단하는 것을 선호한다.",
      "아이디어를 새롭게 표현하는 일이 즐겁다.",
      "글·그림·음악·디자인 등 창작 활동이 좋다.",
      "정해진 방식보다 나만의 방식이 편하다.",
      "상상력을 발휘하는 과제에서 몰입이 높다.",
      "감성적 메시지를 전달하는 작업이 좋다.",
      "틀에 박히지 않은 자유로운 환경을 선호한다.",
      "사람의 고민을 듣고 도와줄 때 보람이 크다.",
      "상대의 성장이나 변화를 돕는 역할이 좋다.",
      "협력적 분위기에서 일할 때 만족도가 높다.",
      "갈등을 중재하고 관계를 회복시키는 데 관심이 있다.",
      "교육·상담·돌봄과 관련된 활동에 끌린다.",
      "타인의 감정 상태를 살피는 편이다.",
      "목표를 제시하고 팀을 이끄는 역할이 좋다.",
      "새로운 기회를 찾고 추진하는 데 자신이 있다.",
      "설득·협상 상황에서 에너지가 생긴다.",
      "성과를 만들기 위해 도전하는 편이다.",
      "리더십을 발휘해 방향을 잡는 걸 선호한다.",
      "사업·마케팅·기획 활동에 흥미가 있다.",
      "자료를 정리하고 체계화하는 일을 잘한다.",
      "규칙·절차가 분명한 환경이 편안하다.",
      "세부사항을 꼼꼼히 확인하는 편이다.",
      "일정을 계획대로 관리하는 데 강점이 있다.",
      "문서·기록·행정 업무를 안정적으로 수행한다.",
      "정확성과 일관성이 중요한 업무를 선호한다.",
    ],
    sourceName: "O*NET Interest Profiler Manual (RIASEC/Holland 기반)",
    sourceUrl: "https://www.onetcenter.org/reports/IP_Manual.html",
    note: "공식 O*NET Interest Profiler 원문 문항이 아닌, RIASEC 구조를 차용한 유사 문항입니다.",
  },
  {
    id: "stress-check",
    mode: "likert",
    title: "정서 스트레스 체크 (PSS 기반)",
    description: "지각된 스트레스(통제감/압도감) 개념을 기반으로 한 간이 점검입니다.",
    questions: [
      "최근 한 달, 중요한 일을 내가 통제하기 어렵다고 느꼈다.",
      "예상치 못한 일이 생기면 감당하기 벅찼다.",
      "해야 할 일이 쌓여 압도되는 느낌이 잦았다.",
      "걱정 때문에 집중이 흐려진 날이 많았다.",
      "스트레스 상황에서 감정 조절이 어려웠다.",
      "문제를 해결할 자신감이 떨어졌다고 느꼈다.",
      "하루를 마칠 때 정신적으로 소진된 느낌이 컸다.",
      "사소한 자극에도 예민하게 반응하는 편이었다.",
      "충분히 쉬어도 긴장이 잘 풀리지 않았다.",
      "전반적으로 최근 한 달 스트레스가 높다고 느꼈다.",
    ],
    sourceName: "Perceived Stress Scale (Cohen et al., 1983)",
    sourceUrl: "https://doi.org/10.2307/2136404",
    note: "PSS 원문 문항이 아닌 핵심 구성개념을 반영한 유사 문항입니다.",
  },
  {
    id: "depression-check",
    mode: "likert",
    title: "우울감 확인 (BDI 구조 참고)",
    description: "우울 증상 영역(기분·흥미·인지·신체)을 참고한 비진단용 간이 점검입니다.",
    questions: [
      "이전보다 슬픔이나 공허감을 더 자주 느낀다.",
      "예전보다 즐겁던 일에 흥미가 줄었다.",
      "스스로에 대한 실망이나 비난이 늘었다.",
      "미래를 부정적으로 보는 생각이 잦다.",
      "사소한 일도 결정하기 어렵게 느껴진다.",
      "집중이 잘 안 되고 생각이 느려진 느낌이 있다.",
      "피로감이 쉽게 오고 에너지가 부족하다.",
      "수면(과다/부족) 패턴이 이전보다 불안정하다.",
      "식욕 또는 체중 변화가 체감된다.",
      "사람을 피하고 혼자 있고 싶은 마음이 커졌다.",
      "이유 없이 초조하거나 반대로 둔해진 느낌이 있다.",
      "일상 기능(학업/일/돌봄)이 떨어졌다고 느낀다.",
    ],
    sourceName: "BDI-II cutoffs (Beck et al., 1996; NCTSN 요약)",
    sourceUrl: "https://www.nctsn.org/measures/beck-depression-inventory-second-edition",
    note: "BDI-II는 유료/자격 기반의 공식 도구이며, 본 문항은 원문이 아닌 구조 참고용 유사 문항입니다. 해석은 BDI-II 기준(0-13/14-19/20-28/29-63)을 환산 적용합니다.",
  },
  {
    id: "personality-test",
    mode: "likert",
    title: "성격 테스트 (MBTI 지표 기반 비공식)",
    description: "E-I, S-N, T-F, J-P 선호 지표를 참고한 비공식 성향 점검입니다.",
    questions: [
      "사람들과 함께 있을 때 에너지가 올라간다.",
      "낯선 모임에서도 먼저 말을 꺼내는 편이다.",
      "생각을 정리할 때 말로 풀어내면 더 명확해진다.",
      "활동적인 일정이 이어져도 비교적 에너지가 유지된다.",
      "문제가 생기면 주변 사람과 즉시 상의하는 편이다.",
      "새로운 만남이 있을 때 기대감이 크다.",
      "사실·경험 기반 정보가 더 신뢰된다.",
      "세부사항을 정확히 확인해야 마음이 놓인다.",
      "설명할 때 구체적 예시를 많이 드는 편이다.",
      "검증된 방법을 우선 적용하는 편이다.",
      "관찰 가능한 데이터가 판단에 가장 중요하다.",
      "현재 현실의 조건과 제약을 먼저 따져본다.",
      "결정 시 논리·원칙을 우선하는 편이다.",
      "감정보다 일관된 기준이 더 공정하다고 느낀다.",
      "피드백할 때 사실과 개선점을 분명히 말하는 편이다.",
      "문제 해결에서 효율성과 정확도를 먼저 본다.",
      "판단할 때 개인적 친분과 별개로 처리하려고 한다.",
      "중요 결정에서 원칙이 감정보다 우선이라고 본다.",
      "일정과 계획을 미리 정해두면 마음이 편하다.",
      "마감 전 단계별 체크리스트를 작성하는 편이다.",
      "약속 변경이 잦으면 스트레스를 크게 느낀다.",
      "끝낸 일은 정리해 두어야 다음 일이 편하다.",
      "즉흥 결정보다 준비된 계획을 선호한다.",
      "할 일은 가능한 빨리 결론내고 마무리하는 편이다.",
    ],
    sourceName: "Myers-Briggs Foundation (MBTI 선호지표 설명)",
    sourceUrl: "https://www.myersbriggs.org/my-mbti-personality-type/the-mbti-preferences/",
    note: "공식 MBTI 검사가 아닌, 선호지표 개념을 참고한 비공식 유사 문항입니다.",
  },
  {
    id: "sct-test",
    mode: "sct",
    title: "SCT 문장완성 검사 (비공식 구조)",
    description: "문장완성 반응을 통해 현재 정서/관계/자기인식 주제를 탐색하는 비공식 검사입니다.",
    questions: [
      "요즘 나를 가장 힘들게 하는 것은 ______.",
      "내가 가장 두려운 상황은 ______.",
      "나는 가족과 있을 때 ______.",
      "엄마(또는 양육자)를 떠올리면 ______.",
      "아빠(또는 양육자)를 떠올리면 ______.",
      "친구들과 있을 때 나는 ______.",
      "사람들이 나를 ______라고 생각했으면 좋겠다.",
      "내가 가장 후회하는 일은 ______.",
      "내가 화가 날 때 나는 보통 ______.",
      "내가 불안할 때 내 몸은 ______.",
      "내가 자랑스럽다고 느끼는 순간은 ______.",
      "내 미래는 ______.",
      "내가 바라는 관계는 ______.",
      "학교/직장에서 나는 ______.",
      "내가 실패했다고 느끼면 ______.",
      "내가 나를 위로하는 방식은 ______.",
      "최근 반복되는 생각은 ______.",
      "지금 가장 필요한 도움은 ______.",
      "내가 바꾸고 싶은 습관은 ______.",
      "앞으로 한 달 동안 나는 ______.",
    ],
    sourceName: "Sentence Completion Test (SCT) 개념 기반",
    sourceUrl: "https://en.wikipedia.org/wiki/Sentence_completion_test",
    note: "정식 임상 SCT 도구가 아닌, 공개된 문장완성 검사 개념을 바탕으로 한 비공식 탐색용 문항입니다.",
  },
];

const likert = [
  { score: 0, label: "전혀 아니다" },
  { score: 1, label: "아니다" },
  { score: 2, label: "보통" },
  { score: 3, label: "그렇다" },
  { score: 4, label: "매우 그렇다" },
];

const techniques: Technique[] = [
  {
    id: "gestalt",
    title: "게슈탈트",
    description: "지금-여기 경험을 중심으로 감정과 행동 패턴을 자각하게 돕습니다.",
  },
  {
    id: "psychoanalysis",
    title: "정신분석학",
    description: "과거 경험과 무의식적 갈등이 현재 문제에 미치는 영향을 탐색합니다.",
  },
  {
    id: "rebt",
    title: "REBT",
    description: "비합리적 신념을 찾아 논박하고 현실적 사고와 행동으로 전환합니다.",
  },
  {
    id: "humanistic",
    title: "인간중심",
    description: "공감과 수용을 바탕으로 스스로 답을 찾도록 지지합니다.",
  },
  {
    id: "behaviorism",
    title: "행동주의",
    description: "관찰 가능한 행동과 강화 계획을 통해 변화를 설계합니다.",
  },
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [selectedTrack, setSelectedTrack] = useState<TrackId>("career");
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text: "종합 상담에 오신 것을 환영합니다. 먼저 카테고리를 고르고 고민과 상황을 적어주세요.",
    },
  ]);
  const [input, setInput] = useState("");
  const [selectedTechnique, setSelectedTechnique] = useState<TechniqueId>("rebt");
  const [intake, setIntake] = useState<IntakeForm>({
    age: "",
    currentSituation: "",
    periodFrequency: "",
    hardestPoint: "",
    helpStyle: "",
  });
  const [intakeCompleted, setIntakeCompleted] = useState(false);
  const [intakeError, setIntakeError] = useState("");
  const [loading, setLoading] = useState(false);
  const [chatId] = useState(() => crypto.randomUUID());
  const [expertIntent, setExpertIntent] = useState<"idle" | "asked" | "requested" | "paid">("idle");
  const [expertStatus, setExpertStatus] = useState("");

  const [activeTestId, setActiveTestId] = useState<TestId | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [textAnswers, setTextAnswers] = useState<Record<number, string>>({});
  const [testResult, setTestResult] = useState("");
  const [testResultRows, setTestResultRows] = useState<TestResultRow[]>([]);
  const [testResultTitle, setTestResultTitle] = useState("");
  const [testResultOpen, setTestResultOpen] = useState(false);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [sctAnalyzing, setSctAnalyzing] = useState(false);
  const [sctTechnique, setSctTechnique] = useState<TechniqueId>("rebt");
  const [expertReportFromTest, setExpertReportFromTest] = useState("");

  const [journalText, setJournalText] = useState("");
  const [journalDate, setJournalDate] = useState(todayInputValue());
  const [mood, setMood] = useState(5);
  const [saveStatus, setSaveStatus] = useState("");
  const [journalList, setJournalList] = useState<JournalEntry[]>([]);
  const [weeklyAiSummary, setWeeklyAiSummary] = useState("");
  const [analyzing, setAnalyzing] = useState(false);

  const [childDate, setChildDate] = useState(todayInputValue());
  const [childName, setChildName] = useState("");
  const [childSituation, setChildSituation] = useState("");
  const [childIntervention, setChildIntervention] = useState("");
  const [childOutcome, setChildOutcome] = useState("");
  const [childProgress, setChildProgress] = useState(5);
  const [childAiSolution, setChildAiSolution] = useState("");
  const [childSaveStatus, setChildSaveStatus] = useState("");
  const [childAnalyzing, setChildAnalyzing] = useState(false);
  const [childList, setChildList] = useState<ChildEntry[]>([]);

  const selectedTrackInfo = useMemo(
    () => tracks.find((track) => track.id === selectedTrack) ?? tracks[0],
    [selectedTrack]
  );

  const activePaper = useMemo(
    () => papers.find((paper) => paper.id === activeTestId) ?? null,
    [activeTestId]
  );
  const currentTechnique = useMemo(
    () => techniques.find((technique) => technique.id === selectedTechnique) ?? techniques[2],
    [selectedTechnique]
  );
  const isIntakeValid = useMemo(() => {
    return (
      intake.age.trim() &&
      intake.currentSituation.trim() &&
      intake.periodFrequency.trim() &&
      intake.hardestPoint.trim() &&
      intake.helpStyle.trim()
    );
  }, [intake]);

  const riasecDetailMap: Record<string, string> = {
    R: "현실형(R): 도구/장비/현장 문제 해결에 강하고, 실행 중심 환경에서 성과가 좋습니다.",
    I: "탐구형(I): 분석·연구·원인 파악에 강하며, 근거 기반 문제해결에서 강점을 보입니다.",
    A: "예술형(A): 창의적 표현, 새로운 관점 제시, 비정형 과제에서 몰입도가 높습니다.",
    S: "사회형(S): 공감·상호작용·지원 역할에 강하며, 사람 중심 직무에서 만족도가 높습니다.",
    E: "진취형(E): 주도적 실행, 설득, 목표 추진 능력이 좋아 리더십 역할과 맞습니다.",
    C: "관습형(C): 체계화, 정확성, 일정/문서 관리 능력이 강해 안정적 운영에 적합합니다.",
  };

  const mbtiDetailMap: Record<string, string> = {
    ISTJ: "ISTJ(비공식 추정): 책임감과 체계성이 강하고, 신뢰 가능한 실행·관리 역할에서 강점을 보입니다.",
    ISFJ: "ISFJ(비공식 추정): 배려와 헌신이 높고, 안정적 관계 형성과 실무 지원에 강점이 있습니다.",
    INFJ: "INFJ(비공식 추정): 통찰력과 가치지향성이 높고, 의미 중심의 성장/상담 영역에 강점이 있습니다.",
    INTJ: "INTJ(비공식 추정): 전략적 사고와 장기 계획 역량이 강해 복합 문제 설계에 적합합니다.",
    ISTP: "ISTP(비공식 추정): 실용적 문제해결과 현장 대응이 강하며, 즉각적 개선에 강점이 있습니다.",
    ISFP: "ISFP(비공식 추정): 감수성과 유연성이 높고, 사람과 환경의 조화를 만드는 데 강점이 있습니다.",
    INFP: "INFP(비공식 추정): 가치·의미 중심 사고가 강하고, 개인 성장과 창의 표현에 적합합니다.",
    INTP: "INTP(비공식 추정): 개념적 분석과 논리적 탐구 역량이 높아 구조 설계에 강점이 있습니다.",
    ESTP: "ESTP(비공식 추정): 행동력과 현실 판단이 빠르며, 즉시 실행이 필요한 환경에 적합합니다.",
    ESFP: "ESFP(비공식 추정): 대인 감응과 현장 에너지가 높고, 협업·경험 중심 역할에 강점이 있습니다.",
    ENFP: "ENFP(비공식 추정): 아이디어 확장과 동기부여가 강하며, 변화 추진 역할과 잘 맞습니다.",
    ENTP: "ENTP(비공식 추정): 논쟁·발상·혁신에 강하고, 문제 재정의와 기획에 강점이 있습니다.",
    ESTJ: "ESTJ(비공식 추정): 조직 운영과 실행 관리가 뛰어나며, 목표 중심 리딩에 적합합니다.",
    ESFJ: "ESFJ(비공식 추정): 관계 조율과 협업 촉진에 강해 팀 기반 환경에서 안정적 성과를 냅니다.",
    ENFJ: "ENFJ(비공식 추정): 사람의 성장 지원과 방향 제시에 강해 코칭/리딩 역할에 적합합니다.",
    ENTJ: "ENTJ(비공식 추정): 전략·결단·추진력이 강해 고난도 목표 달성 상황에서 강점을 보입니다.",
  };

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
        setChildList([]);
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

  useEffect(() => {
    if (!uid) return;

    const q = query(
      collection(db, "child-workspaces"),
      where("uid", "==", uid),
      orderBy("date", "desc"),
      limit(120)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const rows: ChildEntry[] = snapshot.docs.map((childDoc) => {
        const data = childDoc.data();
        return {
          id: childDoc.id,
          uid: String(data.uid ?? ""),
          date: String(data.date ?? ""),
          childName: String(data.childName ?? ""),
          situation: String(data.situation ?? ""),
          intervention: String(data.intervention ?? ""),
          outcome: String(data.outcome ?? ""),
          progress: Number(data.progress ?? 5),
          aiSolution: String(data.aiSolution ?? ""),
          createdAt: data.createdAt,
        };
      });
      setChildList(rows);
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
  const latestChildEntries = useMemo(() => childList.slice(0, 20), [childList]);

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

  const childWeeklyPoints = useMemo<ChildPoint[]>(() => {
    const byDate = new Map<string, ChildEntry>();
    for (const entry of childList) {
      if (!byDate.has(entry.date)) byDate.set(entry.date, entry);
    }

    const points: ChildPoint[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const day = new Date();
      day.setDate(day.getDate() - i);
      const key = day.toISOString().slice(0, 10);
      const entry = byDate.get(key);
      const label = `${day.getMonth() + 1}/${day.getDate()}`;
      points.push({
        date: key,
        label,
        progress: entry ? entry.progress : null,
        score: entry ? scoreFromMood(entry.progress) : null,
      });
    }

    return points;
  }, [childList]);

  const childWeeklyStats = useMemo(() => {
    const valid = childWeeklyPoints.filter((p) => p.score !== null);
    const average =
      valid.length > 0
        ? Math.round(valid.reduce((sum, p) => sum + Number(p.score), 0) / valid.length)
        : null;

    const half = Math.floor(childWeeklyPoints.length / 2);
    const first = childWeeklyPoints.slice(0, half).filter((p) => p.score !== null);
    const second = childWeeklyPoints.slice(half).filter((p) => p.score !== null);

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
  }, [childWeeklyPoints]);

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

  async function handleEmailLogin() {
    if (!email.trim() || !password.trim()) {
      setAuthMessage("이메일과 비밀번호를 입력해 주세요.");
      return;
    }

    setAuthSubmitting(true);
    setAuthMessage("");
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      setAuthMessage("로그인되었습니다.");
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "이메일 로그인 중 오류가 발생했습니다.";
      setAuthMessage(message);
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleEmailSignup() {
    if (!email.trim() || !password.trim()) {
      setAuthMessage("이메일과 비밀번호를 입력해 주세요.");
      return;
    }
    if (password.length < 6) {
      setAuthMessage("비밀번호는 6자 이상이어야 합니다.");
      return;
    }

    setAuthSubmitting(true);
    setAuthMessage("");
    try {
      await createUserWithEmailAndPassword(auth, email.trim(), password);
      setAuthMessage("회원가입이 완료되었습니다.");
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "회원가입 중 오류가 발생했습니다.";
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
    if (expertIntent === "paid") return;
    if (!intakeCompleted) return;

    const userText = input.trim();
    if (!userText || loading) return;

    const text = [
      `카테고리: ${selectedTrackInfo.title}`,
      `상담 기법: ${currentTechnique.title}`,
      `기본 정보: 나이 ${intake.age}, 현재 상황 ${intake.currentSituation}, 기간/빈도 ${intake.periodFrequency}, 가장 힘든 점 ${intake.hardestPoint}, 원하는 도움 방식 ${intake.helpStyle}`,
      `내용: ${userText}`,
    ].join("\n");

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
          technique: selectedTechnique,
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
    setExpertIntent("idle");
    setExpertStatus("");
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        text: `${track.title} 카테고리로 입장했습니다. ${track.subtitle}`,
      },
    ]);
  }

  async function generateChildSolution() {
    if (!childSituation.trim()) {
      setChildSaveStatus("자녀 상황을 먼저 입력해 주세요.");
      return;
    }

    setChildAnalyzing(true);
    setChildSaveStatus("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          track: "양육",
          message: [
            "다음 내용을 REBT ABCDE 형식으로 상담 솔루션으로 정리해줘.",
            `자녀 이름: ${childName || "(미입력)"}`,
            `상황: ${childSituation}`,
            `부모가 시도한 방법: ${childIntervention || "(미입력)"}`,
            `현재 결과/변화: ${childOutcome || "(미입력)"}`,
          ].join("\n"),
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`솔루션 생성 실패 (${res.status}): ${errText}`);
      }

      const data = (await res.json()) as { reply?: string };
      setChildAiSolution(data.reply ?? "솔루션이 비어 있습니다.");
    } catch (error) {
      console.error(error);
      setChildAiSolution("자녀 상담 솔루션 생성 중 오류가 발생했습니다.");
    } finally {
      setChildAnalyzing(false);
    }
  }

  function handleCounselInputKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey || loading) return;
    e.preventDefault();
    send();
  }

  function completeIntake() {
    if (!isIntakeValid) {
      setIntakeError("필수 기본 정보를 모두 입력해 주세요.");
      return;
    }
    setIntakeCompleted(true);
    setIntakeError("");
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        text:
          "기본 정보 확인 완료. 이제 채팅을 시작할 수 있어요.\n" +
          `나이: ${intake.age}\n현재 상황: ${intake.currentSituation}\n기간/빈도: ${intake.periodFrequency}\n가장 힘든 점: ${intake.hardestPoint}\n원하는 도움 방식: ${intake.helpStyle}`,
      },
    ]);
  }

  async function requestExpertConsultation() {
    if (!uid) {
      setExpertStatus("로그인 후 전문가 상담을 신청할 수 있습니다.");
      return;
    }

    setExpertIntent("requested");
    setExpertStatus("전문가 상담 신청이 접수되었습니다. 결제 후 상담 매칭이 시작됩니다.");

    try {
      await addDoc(collection(db, "expert-consult-requests"), {
        uid,
        track: selectedTrackInfo.title,
        technique: currentTechnique.title,
        intake,
        testReport: expertReportFromTest || null,
        status: "pending_payment",
        amountKrw: 39000,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.error(error);
      setExpertStatus("신청 저장 중 오류가 발생했습니다. 다시 시도해 주세요.");
    }
  }

  function completeExpertPaymentDemo() {
    setExpertIntent("paid");
    setExpertStatus("결제 완료(데모). 이제 전문가와 실제 상담 단계로 전환됩니다.");
  }

  async function saveChildEntry() {
    if (!uid) {
      setChildSaveStatus("아직 로그인 중이라 저장할 수 없습니다.");
      return;
    }
    if (!childSituation.trim()) {
      setChildSaveStatus("자녀 상황을 먼저 입력해 주세요.");
      return;
    }

    try {
      await addDoc(collection(db, "child-workspaces"), {
        uid,
        date: childDate,
        childName: childName.trim(),
        situation: childSituation.trim(),
        intervention: childIntervention.trim(),
        outcome: childOutcome.trim(),
        progress: childProgress,
        aiSolution: childAiSolution.trim(),
        createdAt: serverTimestamp(),
      });

      setChildSituation("");
      setChildIntervention("");
      setChildOutcome("");
      setChildProgress(5);
      setChildAiSolution("");
      setChildSaveStatus("자녀 상담 기록 저장 완료");
    } catch (error) {
      console.error(error);
      setChildSaveStatus("자녀 상담 기록 저장 실패: 콘솔을 확인해 주세요.");
    }
  }

  function startTest(testId: TestId) {
    setActiveTestId(testId);
    setAnswers({});
    setTextAnswers({});
    setTestResult("");
    setTestResultRows([]);
    setTestResultTitle("");
    setTestResultOpen(false);
    setSctAnalyzing(false);
    setSctTechnique(selectedTechnique);
    setTestModalOpen(true);
  }

  function applyAnswer(qIdx: number, score: number) {
    setAnswers((prev) => ({ ...prev, [qIdx]: score }));
  }

  function applyTextAnswer(qIdx: number, text: string) {
    setTextAnswers((prev) => ({ ...prev, [qIdx]: text }));
  }

  function closeTestModal() {
    setTestModalOpen(false);
    setSctAnalyzing(false);
    setActiveTestId(null);
    setAnswers({});
    setTextAnswers({});
  }

  async function submitTest() {
    if (!activePaper) return;
    if (activePaper.mode !== "likert") return;
    const answeredCount = Object.keys(answers).length;
    if (answeredCount !== activePaper.questions.length) {
      setTestResult("모든 문항에 응답한 뒤 결과를 계산해 주세요.");
      return;
    }
    const total = Object.values(answers).reduce((sum, score) => sum + score, 0);
    const max = activePaper.questions.length * 4;
    const ratio = total / max;

    let level = "낮음";
    if (ratio >= 0.67) level = "높음";
    else if (ratio >= 0.34) level = "중간";

    let resultText = `[${activePaper.title}] 결과: ${total}/${max}점 (${level}).`;
    const rows: TestResultRow[] = [];

    if (activePaper.id === "personality-test") {
      const sumBy = (indexes: number[]) =>
        indexes.reduce((sum, idx) => sum + Number(answers[idx] ?? 0), 0);
      const e = sumBy([0, 1, 2, 3, 4, 5]);
      const s = sumBy([6, 7, 8, 9, 10, 11]);
      const t = sumBy([12, 13, 14, 15, 16, 17]);
      const j = sumBy([18, 19, 20, 21, 22, 23]);
      const mbti =
        `${e >= 12 ? "E" : "I"}` +
        `${s >= 12 ? "S" : "N"}` +
        `${t >= 12 ? "T" : "F"}` +
        `${j >= 12 ? "J" : "P"}`;

      rows.push(
        { label: "E-I 선호 점수(E)", score: e, max: 24 },
        { label: "S-N 선호 점수(S)", score: s, max: 24 },
        { label: "T-F 선호 점수(T)", score: t, max: 24 },
        { label: "J-P 선호 점수(J)", score: j, max: 24 }
      );
      resultText += `\n비공식 MBTI 추정: ${mbti} (E:${e}/24, S:${s}/24, T:${t}/24, J:${j}/24)`;
      resultText += `\n유형 특성: ${mbtiDetailMap[mbti] ?? "유형 해석 정보를 불러오지 못했습니다."}`;
      resultText +=
        "\n정식 MBTI 검사는 어세스타(ASSESTA) 온라인 검사를 통해 진행하는 것을 권장합니다: https://www.assesta.com";
    }

    if (activePaper.id === "career-fit") {
      const sumBy = (start: number) =>
        Array.from({ length: 6 }, (_, i) => start + i).reduce(
          (sum, idx) => sum + Number(answers[idx] ?? 0),
          0
        );
      const riasec = [
        { label: "R (현실형)", score: sumBy(0), max: 24 },
        { label: "I (탐구형)", score: sumBy(6), max: 24 },
        { label: "A (예술형)", score: sumBy(12), max: 24 },
        { label: "S (사회형)", score: sumBy(18), max: 24 },
        { label: "E (진취형)", score: sumBy(24), max: 24 },
        { label: "C (관습형)", score: sumBy(30), max: 24 },
      ];
      rows.push(...riasec);

      const topTwo = [...riasec].sort((a, b) => b.score - a.score).slice(0, 2);
      const topLetters = topTwo.map((row) => row.label[0]);
      resultText +=
        `\nRIASEC 상위 2유형: ${topTwo[0].label}, ${topTwo[1].label}` +
        "\n상위 2유형을 조합해 직무/전공 탐색을 시작해보세요.";
      resultText += `\n- ${riasecDetailMap[topLetters[0]]}\n- ${riasecDetailMap[topLetters[1]]}`;
    }

    if (activePaper.id === "depression-check") {
      const bdi63Equivalent = Math.round((total / max) * 63);
      rows.push({ label: "우울감 점수(현재 검사)", score: total, max });
      rows.push({ label: "BDI-II 63점 환산 점수", score: bdi63Equivalent, max: 63 });

      let band = "최소 수준";
      let consult = "현재 점수만으로 임상 판단은 불가하지만, 생활 관리와 추적 관찰을 권장합니다.";
      if (bdi63Equivalent >= 29) {
        band = "심한 수준(환산)";
        consult = "의사/정신건강의학과 전문의 상담을 가능한 빠르게 받아보세요.";
      } else if (bdi63Equivalent >= 20) {
        band = "중등도 수준(환산)";
        consult = "의사와 상담해 정확한 평가를 받아보는 것을 권장합니다.";
      } else if (bdi63Equivalent >= 14) {
        band = "경도 수준(환산)";
        consult = "증상이 지속되면 전문가 상담을 권장합니다.";
      }

      resultText += `\nBDI-II 환산 해석: ${band}\n${consult}`;
    }

    if (activePaper.id === "stress-check") {
      rows.push({ label: "스트레스 점수", score: total, max });
    }

    resultText +=
      `\n${activePaper.note}\n출처: ${activePaper.sourceName} (${activePaper.sourceUrl})\n` +
      "이 결과는 참고용이며, 필요 시 전문상담과 함께 해석하는 것을 권장합니다.";

    setSctAnalyzing(true);
    try {
      const techniqueTitle = techniques.find((t) => t.id === sctTechnique)?.title ?? "REBT";
      const answerLines = activePaper.questions
        .map((q, idx) => {
          const score = Number(answers[idx] ?? 0);
          const label = likert.find((l) => l.score === score)?.label ?? "미응답";
          return `${idx + 1}. ${q} -> ${label} (${score})`;
        })
        .join("\n");
      const rowLines = (rows.length > 0 ? rows : [{ label: "총점", score: total, max }])
        .map((r) => `${r.label}: ${r.score}/${r.max}`)
        .join("\n");

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          track: activePaper.id === "career-fit" ? "진로" : "정서",
          technique: sctTechnique,
          message: [
            `검사명: ${activePaper.title}`,
            `상담기법: ${techniqueTitle}`,
            "아래 심리검사 결과를 바탕으로 1)핵심 해석 2)주의 신호 3)실행 제안 3가지를 정리해줘.",
            "가능하면 점수 기반으로 구체적으로 설명해줘.",
            "",
            "[지표 점수]",
            rowLines,
            "",
            "[문항 응답]",
            answerLines,
          ].join("\n"),
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`검사 AI 분석 실패 (${res.status}): ${errText}`);
      }

      const data = (await res.json()) as { reply?: string };
      const aiReply = data.reply ?? "AI 분석 결과가 비어 있습니다.";
      resultText += `\n\nAI 분석 (${techniqueTitle})\n${aiReply}`;
    } catch (error) {
      console.error(error);
      resultText += "\n\nAI 분석 중 오류가 발생해 기본 결과만 표시합니다.";
    } finally {
      setSctAnalyzing(false);
    }

    setTestResult(resultText);
    setTestResultRows(rows.length > 0 ? rows : [{ label: "총점", score: total, max }]);
    setTestResultTitle(activePaper.title);
    setTestResultOpen(true);
    setTestModalOpen(false);
    setMessages((prev) => [...prev, { role: "assistant", text: resultText }]);
    setActiveTestId(null);
    setAnswers({});
    setTextAnswers({});
  }

  async function analyzeSctTest() {
    if (!activePaper || activePaper.id !== "sct-test") return;
    const answeredCount = Object.values(textAnswers).filter((v) => v?.trim()).length;
    if (answeredCount !== activePaper.questions.length) {
      setTestResult("SCT는 모든 문항을 작성한 뒤 AI 분석을 진행해 주세요.");
      return;
    }

    setSctAnalyzing(true);
    try {
      const sctText = activePaper.questions
        .map((q, idx) => `${idx + 1}. ${q} ${textAnswers[idx] ?? ""}`)
        .join("\n");

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          track: "정서",
          technique: sctTechnique,
          message:
            "다음 SCT 문장완성 검사 응답을 분석해줘. 1)핵심 주제 2)정서 패턴 3)대인/가족 이슈 4)인지 왜곡 가능성 5)상담 개입 제안 3가지 6)전문가 상담 필요 신호를 정리해줘.\n\n" +
            sctText,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`SCT 분석 실패 (${res.status}): ${errText}`);
      }

      const data = (await res.json()) as { reply?: string };
      const reply = data.reply ?? "SCT 분석 결과가 비어 있습니다.";
      const summary =
        `[SCT 문장완성 검사] 작성 문항 ${answeredCount}/${activePaper.questions.length}\n` +
        `선택 상담기법: ${techniques.find((t) => t.id === sctTechnique)?.title ?? "REBT"}\n` +
        `${activePaper.note}\n출처: ${activePaper.sourceName} (${activePaper.sourceUrl})\n\n` +
        reply;

      setTestResult(summary);
      setTestResultRows([{ label: "작성 문항 수", score: answeredCount, max: activePaper.questions.length }]);
      setTestResultTitle(activePaper.title);
      setTestResultOpen(true);
      setTestModalOpen(false);
      setMessages((prev) => [...prev, { role: "assistant", text: summary }]);
      setActiveTestId(null);
      setTextAnswers({});
      setAnswers({});
    } catch (error) {
      console.error(error);
      setTestResult("SCT AI 분석 중 오류가 발생했습니다.");
    } finally {
      setSctAnalyzing(false);
    }
  }

  function connectExpertFromTest() {
    if (!testResult.trim()) return;
    setExpertReportFromTest(testResult);
    setActiveTab("counsel");
    setExpertIntent("asked");
    setExpertStatus(
      "검사 결과가 전문가 상담 연결 준비 상태입니다. '예, 전문가 상담 신청'을 누르면 결과 요약이 함께 전달됩니다."
    );
    setTestResultOpen(false);
  }

  const isTestComplete =
    activePaper !== null &&
    (activePaper.mode === "likert"
      ? Object.keys(answers).length === activePaper.questions.length
      : Object.values(textAnswers).filter((v) => v?.trim()).length === activePaper.questions.length);

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

            <div className="authForm">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="이메일"
                autoComplete="email"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호 (6자 이상)"
                autoComplete="current-password"
              />
              <div className="authInlineActions">
                <button onClick={handleEmailLogin} disabled={authSubmitting}>
                  {authSubmitting ? "처리 중..." : "이메일 로그인"}
                </button>
                <button className="signupBtn" onClick={handleEmailSignup} disabled={authSubmitting}>
                  {authSubmitting ? "처리 중..." : "회원가입"}
                </button>
              </div>
            </div>

            <div className="authDivider">또는</div>
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
            <button
              className={`tabBtn ${activeTab === "child" ? "active" : ""}`}
              onClick={() => setActiveTab("child")}
            >
              자녀 상담
            </button>
            <button
              className={`tabBtn ${activeTab === "tests" ? "active" : ""}`}
              onClick={() => setActiveTab("tests")}
            >
              검사하기
            </button>
          </section>

          {activeTab === "counsel" && (
            <>
              <section className="composerCard chatSurface">
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

                <p className="categoryHint">
                  선택 카테고리: <strong>{selectedTrackInfo.title}</strong> - {selectedTrackInfo.subtitle}
                </p>

                <div className="techniqueCard">
                  <label htmlFor="technique-select">상담 기법 선택</label>
                  <select
                    id="technique-select"
                    value={selectedTechnique}
                    onChange={(e) => setSelectedTechnique(e.target.value as TechniqueId)}
                  >
                    {techniques.map((technique) => (
                      <option key={technique.id} value={technique.id}>
                        {technique.title}
                      </option>
                    ))}
                  </select>
                  <p>{currentTechnique.description}</p>
                </div>

                {!intakeCompleted && (
                  <div className="intakeCard">
                    <h3>상담 시작 전 필수 기본 정보</h3>
                    <div className="intakeGrid">
                      <label>
                        나이
                        <input
                          value={intake.age}
                          onChange={(e) => setIntake((prev) => ({ ...prev, age: e.target.value }))}
                          placeholder="예: 34세"
                        />
                      </label>
                      <label>
                        현재 상황
                        <input
                          value={intake.currentSituation}
                          onChange={(e) =>
                            setIntake((prev) => ({ ...prev, currentSituation: e.target.value }))
                          }
                          placeholder="예: 육아와 직장 병행으로 소진"
                        />
                      </label>
                      <label>
                        기간/빈도
                        <input
                          value={intake.periodFrequency}
                          onChange={(e) =>
                            setIntake((prev) => ({ ...prev, periodFrequency: e.target.value }))
                          }
                          placeholder="예: 3개월째, 주 4~5회"
                        />
                      </label>
                      <label>
                        지금 가장 힘든 점
                        <input
                          value={intake.hardestPoint}
                          onChange={(e) =>
                            setIntake((prev) => ({ ...prev, hardestPoint: e.target.value }))
                          }
                          placeholder="예: 감정 조절이 어렵고 죄책감이 큼"
                        />
                      </label>
                      <label>
                        원하는 도움 방식
                        <input
                          value={intake.helpStyle}
                          onChange={(e) =>
                            setIntake((prev) => ({ ...prev, helpStyle: e.target.value }))
                          }
                          placeholder="예: 단계별 실천 과제 중심"
                        />
                      </label>
                    </div>
                    <button className="primaryBtn" onClick={completeIntake}>
                      기본 정보 입력 완료 후 채팅 시작
                    </button>
                    {intakeError && <p className="statusText">{intakeError}</p>}
                  </div>
                )}

                {intakeCompleted && expertIntent !== "paid" && (
                  <>
                    <div className="chatBox chatViewport">
                      {messages.map((m, i) => (
                        <div key={i} className={`bubble ${m.role}`}>
                          <strong>{m.role === "user" ? "나" : "AI"}</strong>
                          <p>{m.text}</p>
                        </div>
                      ))}
                    </div>

                    <div className="inputRow chatComposer">
                      <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleCounselInputKeyDown}
                        placeholder="메시지를 입력하세요. Enter 전송, Shift+Enter 줄바꿈"
                        rows={4}
                      />
                      <p className="summaryText">
                        {loading ? "응답을 생성하고 있습니다..." : "Enter로 바로 전송됩니다."}
                      </p>
                    </div>
                  </>
                )}

                {intakeCompleted && expertIntent === "paid" && (
                  <div className="urgent">
                    전문가 상담 단계로 전환되었습니다. 결제 완료 건은 상담사 매칭 후 일정 안내가 진행됩니다.
                  </div>
                )}

                {selectedTrack === "crisis" && (
                  <div className="urgent">위기 상황이면 즉시 1393, 112, 119에 연락하세요.</div>
                )}

                <article className="expertCard">
                  <h3>전문가와 상담하기</h3>
                  <p>
                    현재 카테고리: <strong>{selectedTrackInfo.title}</strong> / 상담 기법:{" "}
                    <strong>{currentTechnique.title}</strong>
                  </p>
                  <p className="summaryText">AI 상담 후 전문가 상담을 진행하시겠습니까?</p>
                  {expertReportFromTest && (
                    <pre className="analysisBox">
                      검사결과 요약(전문가 전달 예정):
                      {"\n"}
                      {expertReportFromTest}
                    </pre>
                  )}
                  {expertIntent === "idle" && (
                    <div className="expertActions">
                      <button className="primaryBtn" onClick={() => setExpertIntent("asked")}>
                        상담 의사 확인
                      </button>
                    </div>
                  )}
                  {expertIntent === "asked" && (
                    <div className="expertActions">
                      <button className="primaryBtn" onClick={requestExpertConsultation}>
                        예, 전문가 상담 신청
                      </button>
                      <button className="ghostBtn" onClick={() => setExpertIntent("idle")}>
                        아니요
                      </button>
                    </div>
                  )}
                  {expertIntent === "requested" && (
                    <div className="expertActions">
                      <button className="primaryBtn" onClick={completeExpertPaymentDemo}>
                        39,000원 결제하기(데모)
                      </button>
                    </div>
                  )}
                  {expertStatus && <p className="statusText">{expertStatus}</p>}
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

          {activeTab === "child" && (
            <section className="childLayout">
              <article className="panel full cozyScene" aria-hidden>
                <div className="sceneMoon" />
                <div className="sceneMug" />
                <div className="sceneBook" />
                <p>자녀의 작은 변화도 기록하면 상담 솔루션의 방향을 더 정확히 조정할 수 있어요.</p>
              </article>

              <article className="panel">
                <h2>자녀 상담 워크스페이스</h2>
                <div className="diaryForm">
                  <label>
                    날짜
                    <input type="date" value={childDate} onChange={(e) => setChildDate(e.target.value)} />
                  </label>

                  <label>
                    자녀 이름/호칭
                    <input
                      value={childName}
                      onChange={(e) => setChildName(e.target.value)}
                      placeholder="예: 초4 아들, 민수"
                    />
                  </label>

                  <label>
                    현재 상황
                    <textarea
                      value={childSituation}
                      onChange={(e) => setChildSituation(e.target.value)}
                      placeholder="최근 행동 변화, 갈등 상황, 반복되는 패턴을 적어주세요."
                      rows={4}
                    />
                  </label>

                  <label>
                    시도한 방법
                    <textarea
                      value={childIntervention}
                      onChange={(e) => setChildIntervention(e.target.value)}
                      placeholder="대화법, 규칙 조정, 보상/훈육 방식 등"
                      rows={3}
                    />
                  </label>

                  <label>
                    현재 결과/변화
                    <textarea
                      value={childOutcome}
                      onChange={(e) => setChildOutcome(e.target.value)}
                      placeholder="좋아진 점, 유지되는 문제, 악화된 점"
                      rows={3}
                    />
                  </label>

                  <label>
                    변화 체감 점수 ({childProgress}/10)
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={childProgress}
                      onChange={(e) => setChildProgress(Number(e.target.value))}
                    />
                  </label>

                  <button className="primaryBtn" onClick={generateChildSolution} disabled={childAnalyzing}>
                    {childAnalyzing ? "생성 중" : "AI 솔루션 생성"}
                  </button>
                  <pre className="analysisBox">{childAiSolution || "아직 생성된 솔루션이 없습니다."}</pre>

                  <button className="primaryBtn" onClick={saveChildEntry}>
                    자녀 상담 기록 저장
                  </button>
                  {childSaveStatus && <p className="statusText">{childSaveStatus}</p>}
                </div>
              </article>

              <article className="panel">
                <h2>최근 7일 변화 추적</h2>
                <p className="summaryText">
                  기록일 {childWeeklyStats.daysWithEntry}일 / 평균 점수 {childWeeklyStats.average ?? "-"} / 추세{" "}
                  {childWeeklyStats.trend}
                </p>
                <div className="weeklyChart">
                  {childWeeklyPoints.map((point) => (
                    <div key={point.date} className="barCol">
                      <div className="barWrap">
                        <div
                          className={`bar ${point.score === null ? "empty" : "filled"}`}
                          style={{ height: `${point.score ?? 8}%` }}
                          title={
                            point.score === null
                              ? `${point.date}: 기록 없음`
                              : `${point.date}: 변화 ${point.progress}/10`
                          }
                        />
                      </div>
                      <span>{point.label}</span>
                    </div>
                  ))}
                </div>
              </article>

              <article className="panel full">
                <h2>자녀 상담 기록</h2>
                <div className="journalList">
                  {latestChildEntries.length === 0 && <p className="emptyText">저장된 자녀 상담 기록이 없습니다.</p>}
                  {latestChildEntries.map((entry) => (
                    <div key={entry.id} className="journalCard">
                      <div className="journalMeta">
                        <strong>
                          {entry.date} {entry.childName ? `· ${entry.childName}` : ""}
                        </strong>
                        <span>변화 {entry.progress}/10</span>
                      </div>
                      <p>
                        <strong>상황:</strong> {entry.situation}
                      </p>
                      {entry.intervention && (
                        <p>
                          <strong>시도:</strong> {entry.intervention}
                        </p>
                      )}
                      {entry.outcome && (
                        <p>
                          <strong>결과:</strong> {entry.outcome}
                        </p>
                      )}
                      {entry.aiSolution && (
                        <p>
                          <strong>AI 솔루션:</strong> {entry.aiSolution}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </article>
            </section>
          )}

          {activeTab === "tests" && (
            <section className="testLayout">
              <article className="panel full">
                <h2>검사하기</h2>
                <p className="summaryText">
                  진로 흥미, 정서 스트레스, 우울감, 성격 경향을 간단히 점검할 수 있습니다.
                </p>
                <div className="testList">
                  {papers.map((paper) => (
                    <div key={paper.id} className="testCard">
                      <h3>{paper.title}</h3>
                      <p>{paper.description}</p>
                      <p className="sourceText">
                        출처:{" "}
                        <a href={paper.sourceUrl} target="_blank" rel="noreferrer">
                          {paper.sourceName}
                        </a>
                      </p>
                      <p className="sourceNote">{paper.note}</p>
                      <button onClick={() => startTest(paper.id)}>검사 시작</button>
                    </div>
                  ))}
                </div>
                <p className="summaryText">검사 시작을 누르면 별도 창에서 문항이 열립니다.</p>
              </article>
            </section>
          )}
        </>
      )}

      {testModalOpen && activePaper && (
        <section className="testModalOverlay" role="dialog" aria-modal="true">
          <article className="testModalSheet">
            <div className="resultHeader">
              <h2>{activePaper.title}</h2>
              <button className="ghostBtn" onClick={closeTestModal}>
                닫기
              </button>
            </div>
            <p className="sourceText">
              출처:{" "}
              <a href={activePaper.sourceUrl} target="_blank" rel="noreferrer">
                {activePaper.sourceName}
              </a>
            </p>
            <p className="sourceNote">{activePaper.note}</p>
            <div className="techniqueCard">
              <label htmlFor="sct-technique-select">검사 AI 분석 상담기법 선택</label>
              <select
                id="sct-technique-select"
                value={sctTechnique}
                onChange={(e) => setSctTechnique(e.target.value as TechniqueId)}
              >
                {techniques.map((technique) => (
                  <option key={technique.id} value={technique.id}>
                    {technique.title}
                  </option>
                ))}
              </select>
              <p>{techniques.find((t) => t.id === sctTechnique)?.description}</p>
            </div>
            <div className="modalQuestionList">
              {activePaper.questions.map((q, idx) => (
                <div key={q} className="questionRow modalQuestionRow">
                  <p>
                    {idx + 1}. {q}
                  </p>
                  {activePaper.mode === "likert" ? (
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
                  ) : (
                    <textarea
                      value={textAnswers[idx] ?? ""}
                      onChange={(e) => applyTextAnswer(idx, e.target.value)}
                      placeholder="문장을 자연스럽게 이어서 작성해 주세요."
                      rows={3}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="testActions">
              {activePaper.mode === "likert" ? (
                <button onClick={submitTest} disabled={!isTestComplete || sctAnalyzing}>
                  {sctAnalyzing ? "AI 분석 중" : "결과 계산 + AI 분석"}
                </button>
              ) : (
                <button onClick={analyzeSctTest} disabled={!isTestComplete || sctAnalyzing}>
                  {sctAnalyzing ? "AI 분석 중" : "SCT AI 분석하기"}
                </button>
              )}
              <button className="ghost" onClick={closeTestModal}>
                취소
              </button>
            </div>
          </article>
        </section>
      )}

      {testResultOpen && (
        <section className="resultOverlay" role="dialog" aria-modal="true">
          <article className="resultSheet">
            <div className="resultHeader">
              <h2>{testResultTitle} 결과표</h2>
              <button className="ghostBtn" onClick={() => setTestResultOpen(false)}>
                닫기
              </button>
            </div>
            <div className="resultTable">
              <div className="resultRow resultHead">
                <span>지표</span>
                <span>점수</span>
              </div>
              {testResultRows.map((row) => (
                <div key={row.label} className="resultRow">
                  <span>{row.label}</span>
                  <span>
                    {row.score} / {row.max}
                  </span>
                </div>
              ))}
            </div>
            <pre className="analysisBox resultSummary">{testResult}</pre>
            <div className="expertActions">
              <button className="primaryBtn" onClick={connectExpertFromTest}>
                전문가 연결하기
              </button>
              <a
                className="ghostBtn linkBtn"
                href="https://www.assesta.com"
                target="_blank"
                rel="noreferrer"
              >
                MBTI 정식검사 안내(어세스타)
              </a>
            </div>
          </article>
        </section>
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

        .authForm {
          margin-top: 14px;
          display: grid;
          gap: 8px;
        }

        .authForm input {
          border: 1px solid #e7d5c7;
          border-radius: 12px;
          padding: 11px 12px;
          background: #fffdfb;
          color: #4a372f;
          font-size: 0.94rem;
        }

        .authInlineActions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .authInlineActions button {
          border: 1px solid #e7d5c7;
          border-radius: 12px;
          padding: 10px 12px;
          background: #fffaf6;
          color: #6f5143;
          font-weight: 700;
          cursor: pointer;
        }

        .authInlineActions .signupBtn {
          background: #fff3e8;
        }

        .authInlineActions button:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .authDivider {
          margin-top: 12px;
          font-size: 0.82rem;
          color: #9a7a69;
          text-align: center;
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

        .chatSurface {
          display: grid;
          gap: 12px;
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
          grid-template-columns: 1fr;
          gap: 10px;
        }

        .chatComposer {
          border-top: 1px dashed #ecd7c8;
          padding-top: 12px;
        }

        .chatViewport {
          max-height: 500px;
          min-height: 280px;
          border: 1px solid #efdacc;
          border-radius: 16px;
          padding: 12px;
          background: #fffaf5;
        }

        .categoryHint {
          margin: 0 0 10px;
          color: #7a5f53;
          font-size: 0.92rem;
        }

        .techniqueCard {
          border: 1px solid #edd8c9;
          border-radius: 14px;
          padding: 10px 12px;
          background: #fff8f1;
          display: grid;
          gap: 6px;
        }

        .techniqueCard label {
          font-size: 0.88rem;
          color: #6f5348;
          font-weight: 700;
        }

        .techniqueCard select {
          border: 1px solid #e7d5c7;
          border-radius: 10px;
          padding: 9px 10px;
          background: #fffdfb;
          color: #4a372f;
        }

        .techniqueCard p {
          margin: 0;
          font-size: 0.86rem;
          color: #785d50;
        }

        .intakeCard {
          border: 1px solid #edd8c9;
          border-radius: 14px;
          background: #fff8f1;
          padding: 12px;
          display: grid;
          gap: 10px;
        }

        .intakeCard h3 {
          margin: 0;
          font-size: 0.98rem;
          color: #65483d;
        }

        .intakeGrid {
          display: grid;
          gap: 8px;
        }

        .intakeGrid label {
          display: grid;
          gap: 6px;
          font-size: 0.85rem;
          color: #6f5348;
        }

        .intakeGrid input {
          border: 1px solid #e7d5c7;
          border-radius: 10px;
          padding: 10px 12px;
          background: #fffdfb;
          color: #4a372f;
        }

        .inputRow input,
        .inputRow textarea,
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

        .expertCard {
          margin-top: 10px;
          border: 1px solid #ecd6c6;
          border-radius: 14px;
          background: #fff8f1;
          padding: 12px;
        }

        .expertCard h3 {
          margin: 0 0 6px;
          font-size: 0.98rem;
          color: #5f4338;
        }

        .expertCard p {
          margin: 0;
          color: #765a4d;
          font-size: 0.9rem;
        }

        .expertActions {
          margin-top: 10px;
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .ghostBtn {
          border: 1px solid #e8cdbb;
          background: #f7e5d8;
          color: #694e42;
          border-radius: 12px;
          padding: 10px 12px;
          font-weight: 700;
          cursor: pointer;
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

        .childLayout {
          max-width: 1100px;
          margin: 18px auto 0;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          animation: rise 0.75s ease-out;
        }

        .testLayout {
          max-width: 1100px;
          margin: 18px auto 0;
          display: grid;
          grid-template-columns: 1fr;
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

        .sourceText {
          margin: 0;
          font-size: 0.82rem;
          color: #6f5348;
        }

        .sourceText a {
          color: #995f45;
          text-decoration: underline;
        }

        .sourceNote {
          margin: 4px 0 10px;
          font-size: 0.8rem;
          color: #8a6b5a;
        }

        .testModalOverlay {
          position: fixed;
          inset: 0;
          z-index: 70;
          background: rgba(30, 20, 15, 0.62);
          display: grid;
          place-items: center;
          padding: 18px;
        }

        .testModalSheet {
          width: min(1040px, 100%);
          max-height: 92vh;
          overflow: auto;
          border-radius: 18px;
          border: 1px solid #ead5c7;
          background: #fffaf4;
          box-shadow: 0 24px 42px rgba(40, 24, 17, 0.28);
          padding: 16px;
          display: grid;
          gap: 10px;
        }

        .modalQuestionList {
          display: grid;
          gap: 10px;
          max-height: 62vh;
          overflow: auto;
          padding-right: 4px;
        }

        .modalQuestionRow {
          padding: 12px;
        }

        .modalQuestionRow p {
          font-size: 1rem;
          color: #5f453a;
          margin-bottom: 10px;
        }

        .modalQuestionRow textarea {
          width: 100%;
          border: 1px solid #e8d5c8;
          border-radius: 12px;
          padding: 10px 12px;
          font-size: 0.95rem;
          background: #fffdfb;
          color: #4a372f;
        }

        .resultOverlay {
          position: fixed;
          inset: 0;
          z-index: 60;
          background: rgba(44, 26, 17, 0.58);
          display: grid;
          place-items: center;
          padding: 18px;
        }

        .resultSheet {
          width: min(980px, 100%);
          max-height: 92vh;
          overflow: auto;
          border-radius: 18px;
          background: #fffaf5;
          border: 1px solid #ecd9cb;
          box-shadow: 0 24px 40px rgba(44, 26, 17, 0.24);
          padding: 16px;
          display: grid;
          gap: 12px;
        }

        .resultHeader {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }

        .resultHeader h2 {
          margin: 0;
          color: #5d4034;
        }

        .resultTable {
          border: 1px solid #ecd8cb;
          border-radius: 12px;
          overflow: hidden;
        }

        .resultRow {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px;
          padding: 10px 12px;
          border-bottom: 1px solid #f1e2d8;
          font-size: 0.92rem;
          color: #6d5247;
          background: #fffdfb;
        }

        .resultRow:last-child {
          border-bottom: 0;
        }

        .resultHead {
          background: #f7e9dd;
          font-weight: 700;
          color: #5d4034;
        }

        .resultSummary {
          max-height: none;
        }

        .linkBtn {
          text-decoration: none;
          display: inline-flex;
          align-items: center;
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
          .diaryLayout,
          .childLayout,
          .testLayout {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .workspace {
            padding: 18px 12px 28px;
          }

          .topTabs {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
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
