"use client";

import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  createUserWithEmailAndPassword,
  deleteUser,
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
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

type Msg = { role: "user" | "assistant"; text: string };
type ChatThread = {
  id: string;
  title: string;
  createdAt?: unknown;
  lastMessageAt?: unknown;
};
type UserProfile = {
  uid: string;
  nickname: string;
  accountId: string;
  contact: string;
  consentAdminView: boolean;
  disabled: boolean;
  createdAt?: unknown;
};
type DeleteRequest = {
  uid: string;
  accountId: string;
  nickname: string;
  reason: string;
  status: "pending" | "processed";
  requestedAt?: unknown;
  processedAt?: unknown;
};
type TrackId = "career" | "emotion" | "parenting" | "crisis";
type TestId =
  | "career-fit"
  | "stress-check"
  | "depression-check"
  | "personality-test"
  | "sct-test";
type TabId = "counsel" | "diary" | "child" | "tests" | "admin";
type TechniqueId =
  | "gestalt"
  | "psychoanalysis"
  | "rebt"
  | "humanistic"
  | "behaviorism"
  | "blended";
type DiaryModeId = "general" | "abc" | "guided" | "reflection";

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
};

type TestResultRow = {
  label: string;
  score: number;
  max: number;
};

type JournalEntry = {
  id: string;
  uid: string;
  authorLabel: string;
  date: string;
  mode?: DiaryModeId;
  fortuneId?: string;
  fortuneText?: string;
  missionText?: string;
  missionCompleted?: boolean;
  medicationRecord?: {
    status: "taken" | "partial" | "skipped";
    times: string[];
    name: string;
    category: string;
    note: string;
    missedReason: string;
  } | null;
  mood: number;
  energy: number;
  relationship: number;
  achievement: number;
  emotions: string[];
  reflection: string;
  text: string;
  createdAt?: unknown;
};

type WeeklyPoint = {
  date: string;
  label: string;
  mood: number | null;
  score: number | null;
  hasMedication: boolean;
};

type ChildEntry = {
  id: string;
  uid: string;
  authorLabel: string;
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
type HealthSettings = {
  enabled: boolean;
  medicationEnabled: boolean;
  consented: boolean;
};
type ExpertRequest = {
  id: string;
  uid: string;
  guestSessionId?: string | null;
  authorLabel: string;
  category: string;
  requestText: string;
  status: "open" | "answered";
  advisorReply: string;
  advisorLabel: string;
  createdAt?: unknown;
  repliedAt?: unknown;
};
type FortuneTone = "energy" | "focus" | "relationship" | "confidence";
type FortuneTemplate = {
  id: string;
  tone: FortuneTone;
  fortune: string;
  mission: string;
  prompt: string;
  keywords: string[];
};
type ModeGuideField = {
  key: string;
  label: string;
  placeholder: string;
};
type DiaryModeGuide = {
  title: string;
  description: string;
  steps: string[];
  fields: ModeGuideField[];
  freePlaceholder: string;
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
  {
    id: "blended",
    title: "일반 AI 대화",
    description: "특정 상담기법 없이 평소 AI와 대화하듯 자유롭게 이야기합니다.",
  },
];

const emotionOptions = [
  "기쁨",
  "감사",
  "평온",
  "불안",
  "우울",
  "분노",
  "피곤",
  "외로움",
  "답답함",
  "희망",
];

const diaryModes: Array<{ id: DiaryModeId; title: string; description: string }> = [
  {
    id: "general",
    title: "일반 일기 모드",
    description: "자유롭게 하루를 기록합니다.",
  },
  {
    id: "abc",
    title: "인지 재구성 모드",
    description: "사건(Activating) - 생각(Belief) - 결과(Consequence) 흐름으로 정리합니다.",
  },
  {
    id: "guided",
    title: "감정 정리 모드",
    description: "보조 질문을 중심으로 감정을 구조화합니다.",
  },
  {
    id: "reflection",
    title: "자기 성찰 모드",
    description: "의미, 배움, 다음 행동에 집중합니다.",
  },
];

const childHighlightWords = [
  "거부",
  "공격",
  "폭발",
  "울음",
  "불안",
  "충돌",
  "짜증",
  "대화",
  "규칙",
  "수면",
  "학교",
  "숙제",
  "친구",
  "개선",
  "악화",
];

const developerEmails = (process.env.NEXT_PUBLIC_DEVELOPER_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

const DEFAULT_ASSISTANT_MESSAGE =
  "종합 상담에 오신 것을 환영합니다. 먼저 카테고리를 고르고 고민과 상황을 적어주세요.";
const REFLECTION_PROMPT_DAILY_LIMIT = 3;
const reflectionPromptThemes = [
  "오늘 가장 기억에 남는 순간",
  "오늘 나를 지치게 한 장면",
  "오늘 마음이 편해졌던 시간",
  "오늘 가장 고마웠던 일",
  "오늘 후회가 남는 선택",
  "오늘 다시 하고 싶은 대화",
  "오늘 가장 자랑스러웠던 행동",
  "오늘 미뤄둔 일",
  "오늘 감정이 크게 흔들린 이유",
  "오늘 몸의 신호가 강했던 순간",
  "오늘 관계에서 어려웠던 지점",
  "오늘 관계에서 좋았던 지점",
  "오늘 내가 나를 돌본 방식",
  "오늘 집중이 잘 되었던 조건",
  "오늘 집중을 방해한 요소",
  "오늘 에너지가 올라간 계기",
  "오늘 에너지가 떨어진 계기",
  "오늘 불안을 키운 생각",
  "오늘 안정을 준 생각",
  "오늘 배운 가장 중요한 한 가지",
  "오늘 놓치고 싶지 않은 깨달음",
  "오늘 내가 붙잡고 있는 걱정",
  "오늘 작지만 의미 있었던 성취",
  "오늘 내일로 넘기고 싶은 일",
  "오늘 내일에 꼭 이어가고 싶은 습관",
];
const reflectionPromptPool: string[] = reflectionPromptThemes.flatMap((theme) => [
  `${theme}은(는) 언제였나요?`,
  `${theme}가 생긴 직접적인 계기는 무엇이었나요?`,
  `${theme}에서 내가 배운 점은 무엇이었나요?`,
  `내일 ${theme}를 위해 바꾸고 싶은 한 가지는 무엇인가요?`,
]);
const fortuneTemplates: FortuneTemplate[] = [
  {
    id: "energy-reset",
    tone: "energy",
    fortune: "오늘은 예상보다 쉽게 지칠 수 있어요. 속도를 잠깐 늦추면 흐름이 다시 살아납니다.",
    mission: "에너지가 떨어진 순간 1개와 회복에 도움 된 행동 1개를 기록해보세요.",
    prompt: "오늘 내가 지친 순간은 언제였고, 어떻게 회복했나요?",
    keywords: ["지침", "피곤", "휴식", "회복", "호흡"],
  },
  {
    id: "focus-window",
    tone: "focus",
    fortune: "집중력이 짧게 끊길 수 있지만, 핵심 한 가지를 잡으면 성취감이 커지는 날입니다.",
    mission: "오늘 가장 중요한 한 가지에 집중한 경험을 적어보세요.",
    prompt: "오늘 내가 가장 집중했던 한 가지는 무엇이었나요?",
    keywords: ["집중", "몰입", "핵심", "정리", "완료"],
  },
  {
    id: "relationship-soft",
    tone: "relationship",
    fortune: "사소한 말투가 크게 느껴질 수 있어요. 한 번 더 부드럽게 말하면 관계가 풀립니다.",
    mission: "대화에서 감정이 흔들린 순간과 조정한 표현을 적어보세요.",
    prompt: "오늘 대화에서 내가 바꿔 말해본 표현이 있었나요?",
    keywords: ["대화", "관계", "표현", "말투", "이해"],
  },
  {
    id: "confidence-step",
    tone: "confidence",
    fortune: "작은 선택 하나가 자신감을 키우는 날입니다. 완벽보다 실행이 더 중요해요.",
    mission: "완벽하지 않아도 실행한 행동 1개를 기록해보세요.",
    prompt: "오늘 완벽하지 않아도 해낸 행동은 무엇이었나요?",
    keywords: ["실행", "도전", "시도", "용기", "자신감"],
  },
  {
    id: "energy-balance",
    tone: "energy",
    fortune: "무리하면 후반에 급격히 지칠 수 있어요. 중간 휴식이 오히려 결과를 좋게 만듭니다.",
    mission: "중간 휴식 또는 템포 조절 경험을 한 줄로 남겨보세요.",
    prompt: "오늘 속도를 조절한 순간이 있었나요?",
    keywords: ["속도", "휴식", "템포", "조절", "회복"],
  },
  {
    id: "focus-clean",
    tone: "focus",
    fortune: "잡생각이 늘 수 있지만, 우선순위를 정리하면 하루가 다시 명확해집니다.",
    mission: "우선순위를 다시 정한 계기와 효과를 기록해보세요.",
    prompt: "오늘 우선순위를 다시 정한 순간은 언제였나요?",
    keywords: ["우선순위", "정리", "집중", "계획", "선택"],
  },
  {
    id: "relationship-repair",
    tone: "relationship",
    fortune: "오해가 생겨도 회복 가능한 날이에요. 짧은 확인 질문이 관계를 살립니다.",
    mission: "오해를 줄이기 위해 던진 질문 또는 확인 문장을 적어보세요.",
    prompt: "오늘 내가 확인했던 질문은 무엇이었나요?",
    keywords: ["오해", "확인", "질문", "관계", "회복"],
  },
  {
    id: "confidence-ground",
    tone: "confidence",
    fortune: "스스로를 의심하기 쉬운 날이지만, 이미 해낸 경험을 떠올리면 흔들림이 줄어듭니다.",
    mission: "오늘 나를 지탱한 과거의 성공 경험을 한 줄로 적어보세요.",
    prompt: "오늘 나를 지탱해준 경험은 무엇이었나요?",
    keywords: ["성공", "기억", "근거", "자신감", "안정"],
  },
];
const diaryModeGuides: Record<DiaryModeId, DiaryModeGuide> = {
  general: {
    title: "일반 일기 가이드",
    description: "오늘의 흐름을 편하게 기록하되, 감정-사건-배움을 한 번씩 짚어보세요.",
    steps: ["오늘 있었던 일 1~2개", "그때 감정", "마무리 소감"],
    fields: [
      { key: "highlight", label: "오늘의 하이라이트", placeholder: "오늘 가장 기억에 남는 장면은?" },
      { key: "hardest", label: "힘들었던 순간", placeholder: "어떤 점이 가장 어려웠나요?" },
      { key: "support", label: "도움이 된 요소", placeholder: "누가/무엇이 도움이 되었나요?" },
    ],
    freePlaceholder: "오늘 하루를 자유롭게 기록해보세요.",
  },
  abc: {
    title: "인지 재구성 가이드 (ABC)",
    description: "사건-생각-결과를 분리해서 쓰면 감정에 휘둘리는 패턴을 더 쉽게 잡을 수 있어요.",
    steps: ["A 사건", "B 자동 생각", "C 감정/행동 결과", "대안 생각", "다음 행동"],
    fields: [
      { key: "a_event", label: "A. 사건", placeholder: "무슨 일이 있었나요?" },
      { key: "b_belief", label: "B. 자동 생각", placeholder: "그때 바로 든 생각은?" },
      { key: "c_consequence", label: "C. 감정/행동", placeholder: "감정과 행동은 어땠나요?" },
      { key: "d_dispute", label: "대안 생각", placeholder: "더 현실적인 생각으로 바꿔본다면?" },
      { key: "e_effect", label: "다음 행동", placeholder: "내일 시도할 행동 1가지는?" },
    ],
    freePlaceholder: "추가로 적고 싶은 ABC 맥락이 있으면 자유롭게 적어주세요.",
  },
  guided: {
    title: "감정 정리 가이드",
    description: "감정의 원인과 몸의 반응, 필요한 도움을 분리해서 쓰면 정리가 빨라집니다.",
    steps: ["상황", "감정 이름", "몸 반응", "필요한 것", "실행"],
    fields: [
      { key: "situation", label: "상황", placeholder: "감정이 크게 올라온 상황은?" },
      { key: "emotion_name", label: "감정 이름", placeholder: "가장 강했던 감정 1~2개는?" },
      { key: "body_signal", label: "몸의 신호", placeholder: "몸에서는 어떤 반응이 있었나요?" },
      { key: "need", label: "필요", placeholder: "지금 나에게 필요한 것은?" },
      { key: "action", label: "실행", placeholder: "오늘 바로 할 수 있는 작은 행동은?" },
    ],
    freePlaceholder: "감정 정리 후 남은 생각을 자유롭게 적어주세요.",
  },
  reflection: {
    title: "자기 성찰 가이드",
    description: "하루를 평가보다 관찰 관점으로 적으면 자기비난을 줄이고 개선점을 찾기 쉬워집니다.",
    steps: ["감사", "잘한 점", "배운 점", "내일의 한 가지"],
    fields: [
      { key: "gratitude", label: "감사한 점", placeholder: "오늘 고마웠던 것은?" },
      { key: "strength", label: "잘한 점", placeholder: "오늘 내가 잘한 행동은?" },
      { key: "lesson", label: "배운 점", placeholder: "오늘 배운 점은?" },
      { key: "tomorrow", label: "내일의 한 가지", placeholder: "내일 실행할 1가지는?" },
      { key: "self_word", label: "나에게 건네는 말", placeholder: "오늘의 나에게 한 문장" },
    ],
    freePlaceholder: "성찰 내용을 더 자유롭게 이어서 적어보세요.",
  },
};

function todayInputValue() {
  return dateInputValue(new Date());
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function dateInputValue(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function addDays(base: Date, offset: number) {
  const next = new Date(base);
  next.setDate(next.getDate() + offset);
  return next;
}

function reflectionPromptUsageKey(date: string) {
  return `reflection_prompt_count:${date}`;
}
function guestHealthSettingsKey(sessionId: string) {
  return `guest_health_settings:${sessionId}`;
}

function getReflectionPromptUsage(date: string) {
  if (typeof window === "undefined") return 0;
  const value = window.localStorage.getItem(reflectionPromptUsageKey(date));
  const parsed = Number(value ?? "0");
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function setReflectionPromptUsage(date: string, count: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(reflectionPromptUsageKey(date), String(Math.max(0, Math.floor(count))));
}

function hashText(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pickDailyFortune(date: string, userSeed: string) {
  const seed = `${date}:${userSeed || "guest"}`;
  const idx = hashText(seed) % fortuneTemplates.length;
  return fortuneTemplates[idx];
}

function composeDiaryContent(
  mode: DiaryModeId,
  answers: Record<string, string>,
  freeText: string
) {
  const guide = diaryModeGuides[mode];
  const sections = guide.fields
    .map((field) => {
      const value = (answers[field.key] ?? "").trim();
      if (!value) return "";
      return `${field.label}: ${value}`;
    })
    .filter(Boolean);
  const extra = freeText.trim();

  if (mode === "general") {
    const focused = sections.length > 0 ? sections.join("\n") : "";
    if (focused && extra) return `${focused}\n\n자유 메모: ${extra}`;
    return focused || extra;
  }

  if (sections.length > 0 && extra) {
    return `${sections.join("\n")}\n\n자유 메모: ${extra}`;
  }
  return sections.join("\n") || extra;
}

function scoreFromMood(mood: number) {
  return Math.round(((Math.max(1, Math.min(10, mood)) - 1) / 9) * 100);
}

function trendLabel(delta: number) {
  if (delta > 5) return "개선";
  if (delta < -5) return "하락";
  return "유지";
}

function clampMood(value: number) {
  return Math.max(1, Math.min(10, value));
}

function averageMood(values: number[]) {
  if (values.length === 0) return 5;
  return Math.round(values.reduce((sum, value) => sum + clampMood(value), 0) / values.length);
}

function emotionSummaryText(emotions: string[], mood: number, energy: number) {
  if (emotions.length === 0) {
    return "감정을 선택하면 오늘 정서 요약이 여기에 표시됩니다.";
  }
  const negative = emotions.filter((emotion) =>
    ["불안", "우울", "분노", "피곤", "외로움", "답답함"].includes(emotion)
  );
  const positive = emotions.filter((emotion) => ["기쁨", "감사", "평온", "희망"].includes(emotion));
  const center =
    negative.length >= positive.length
      ? `${negative.slice(0, 2).join(" + ")} 중심`
      : `${positive.slice(0, 2).join(" + ")} 중심`;
  const tone =
    negative.length > positive.length
      ? "기쁨 대비 스트레스가 높습니다."
      : positive.length > negative.length
      ? "회복 자원이 살아 있습니다."
      : "감정 강도가 비슷하게 섞여 있습니다.";
  const energyNote = energy <= 4 ? "에너지가 낮아 휴식 우선이 좋아요." : "";
  const moodNote = mood <= 4 ? "불편한 감정은 짧게라도 기록해 두세요." : "";
  return `오늘은 ${center}. ${tone} ${energyNote} ${moodNote}`.trim();
}

function extractKeySentence(reflection: string) {
  const cleaned = reflection.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const chunks = cleaned
    .split(/(?<=[.!?。！？])\s+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  if (chunks.length === 0) return cleaned.slice(0, 60);
  return chunks.reduce((best, current) => (current.length > best.length ? current : best), chunks[0]);
}

function lineYFromMood(mood: number | null, height: number) {
  if (mood === null) return null;
  const ratio = (clampMood(mood) - 1) / 9;
  return Math.round(height - ratio * height);
}

function moodHeatTone(value: number | null) {
  if (value === null) return "none";
  if (value >= 7) return "good";
  if (value >= 4) return "mid";
  return "low";
}

function makeAuthorKey(uid: string, authorLabel: string) {
  const normalizedUid = uid.trim();
  if (normalizedUid) return normalizedUid;
  const normalizedLabel = authorLabel.trim();
  return normalizedLabel || "(알 수 없음)";
}

function groupByDateDesc<T extends { date: string }>(rows: T[]) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = grouped.get(row.date) ?? [];
    bucket.push(row);
    grouped.set(row.date, bucket);
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({ date, items }));
}

function normalizeAccountId(value: string) {
  return value.trim().toLowerCase();
}

function toAuthEmail(accountId: string) {
  return `${normalizeAccountId(accountId)}@users.ai-counsel.local`;
}

function authErrorMessage(
  error: unknown,
  action: "google" | "guest" | "login" | "signup"
) {
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";

  if (code === "auth/operation-not-allowed") {
    if (action === "guest") {
      return "Firebase 설정: Anonymous(익명) 로그인이 꺼져 있습니다. Firebase Console > Authentication > Sign-in method에서 Anonymous를 활성화해 주세요.";
    }
    if (action === "google") {
      return "Firebase 설정: Google 로그인이 꺼져 있습니다. Firebase Console > Authentication > Sign-in method에서 Google을 활성화해 주세요.";
    }
    return "Firebase 설정: Email/Password 로그인이 꺼져 있습니다. Firebase Console > Authentication > Sign-in method에서 Email/Password를 활성화해 주세요.";
  }

  if (code === "auth/invalid-credential" || code === "auth/user-not-found") {
    return "아이디 또는 비밀번호가 올바르지 않습니다.";
  }
  if (code === "auth/wrong-password") {
    return "비밀번호가 올바르지 않습니다.";
  }
  if (code === "auth/email-already-in-use") {
    return "이미 사용 중인 아이디입니다.";
  }
  if (code === "auth/weak-password") {
    return "비밀번호가 너무 약합니다. 6자 이상으로 입력해 주세요.";
  }

  return error instanceof Error ? error.message : "인증 중 오류가 발생했습니다.";
}

const googleProvider = new GoogleAuthProvider();

export default function Page() {
  const [activeTab, setActiveTab] = useState<TabId>("counsel");
  const [uid, setUid] = useState<string | null>(null);
  const [guestSessionId, setGuestSessionId] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [isGuestUser, setIsGuestUser] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [accountId, setAccountId] = useState("");
  const [nickname, setNickname] = useState("");
  const [contact, setContact] = useState("");
  const [password, setPassword] = useState("");
  const [signupMode, setSignupMode] = useState(false);
  const [signupConsentAdminView, setSignupConsentAdminView] = useState(false);

  const [selectedTrack, setSelectedTrack] = useState<TrackId>("career");
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text: DEFAULT_ASSISTANT_MESSAGE,
    },
  ]);
  const [chatThreads, setChatThreads] = useState<ChatThread[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [selectedTechnique, setSelectedTechnique] = useState<TechniqueId>("blended");
  const [intake, setIntake] = useState<IntakeForm>({
    age: "",
    currentSituation: "",
    periodFrequency: "",
    hardestPoint: "",
  });
  const [intakeCompleted, setIntakeCompleted] = useState(false);
  const [intakeError, setIntakeError] = useState("");
  const [loading, setLoading] = useState(false);

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

  const [journalDate, setJournalDate] = useState(todayInputValue());
  const [mood, setMood] = useState(5);
  const [energy, setEnergy] = useState(5);
  const [relationship, setRelationship] = useState(5);
  const [achievement, setAchievement] = useState(5);
  const [emotions, setEmotions] = useState<string[]>([]);
  const [reflection, setReflection] = useState("");
  const [healthSettings, setHealthSettings] = useState<HealthSettings>({
    enabled: false,
    medicationEnabled: false,
    consented: false,
  });
  const [healthSettingsOpen, setHealthSettingsOpen] = useState(false);
  const [healthSectionOpen, setHealthSectionOpen] = useState(false);
  const [medicationStatus, setMedicationStatus] = useState<"" | "taken" | "partial" | "skipped">("");
  const [medicationTimes, setMedicationTimes] = useState<string[]>([]);
  const [medicationName, setMedicationName] = useState("");
  const [medicationCategory, setMedicationCategory] = useState("");
  const [medicationMemo, setMedicationMemo] = useState("");
  const [medicationMissedReason, setMedicationMissedReason] = useState("");
  const [modeAnswers, setModeAnswers] = useState<Record<DiaryModeId, Record<string, string>>>({
    general: {},
    abc: {},
    guided: {},
    reflection: {},
  });
  const [diaryMode, setDiaryMode] = useState<DiaryModeId>("general");
  const [liveCommentEnabled, setLiveCommentEnabled] = useState(false);
  const [fortuneMissionDone, setFortuneMissionDone] = useState(false);
  const [reflectionPromptCount, setReflectionPromptCount] = useState(0);
  const [reflectionPromptMessage, setReflectionPromptMessage] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [journalList, setJournalList] = useState<JournalEntry[]>([]);
  const [editingJournalId, setEditingJournalId] = useState<string | null>(null);
  const [weeklyAiSummary, setWeeklyAiSummary] = useState("");
  const [diaryAnalysisRange, setDiaryAnalysisRange] = useState<"weekly" | "monthly" | "custom">("weekly");
  const [diaryAnalysisStartDate, setDiaryAnalysisStartDate] = useState(
    dateInputValue(addDays(new Date(), -6))
  );
  const [diaryAnalysisEndDate, setDiaryAnalysisEndDate] = useState(todayInputValue());
  const [analysisPanelOpen, setAnalysisPanelOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedTechniqueForAnalysis, setSelectedTechniqueForAnalysis] = useState<TechniqueId>("blended");
  const [diaryAnalysisMonth, setDiaryAnalysisMonth] = useState(new Date());
  const [childAnalysisMonth, setChildAnalysisMonth] = useState(new Date());
  const [diaryDayListOpen, setDiaryDayListOpen] = useState(true);

  const [childDate, setChildDate] = useState(todayInputValue());
  const [childName, setChildName] = useState("");
  const [childSituation, setChildSituation] = useState("");
  const [childIntervention, setChildIntervention] = useState("");
  const [childOutcome, setChildOutcome] = useState("");
  const [childProgress, setChildProgress] = useState(5);
  const [childAiSolution, setChildAiSolution] = useState("");
  const [childTechnique, setChildTechnique] = useState<TechniqueId>("blended");
  const [childSaveStatus, setChildSaveStatus] = useState("");
  const [childAnalyzing, setChildAnalyzing] = useState(false);
  const [childList, setChildList] = useState<ChildEntry[]>([]);
  const [developerAuthorFilter, setDeveloperAuthorFilter] = useState("all");
  const [editingChildId, setEditingChildId] = useState<string | null>(null);
  const [adminUsers, setAdminUsers] = useState<UserProfile[]>([]);
  const [deleteRequests, setDeleteRequests] = useState<DeleteRequest[]>([]);
  const [expertRequests, setExpertRequests] = useState<ExpertRequest[]>([]);
  const [expertCategory, setExpertCategory] = useState("일기 피드백");
  const [expertRequestText, setExpertRequestText] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [deleteReason, setDeleteReason] = useState("");
  const [deletingUid, setDeletingUid] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const selectedTrackInfo = useMemo(
    () => tracks.find((track) => track.id === selectedTrack) ?? tracks[0],
    [selectedTrack]
  );

  const activePaper = useMemo(
    () => papers.find((paper) => paper.id === activeTestId) ?? null,
    [activeTestId]
  );
  const currentTechnique = useMemo(
    () => techniques.find((technique) => technique.id === selectedTechnique) ?? techniques[0],
    [selectedTechnique]
  );
  const currentDiaryTechnique = useMemo(
    () =>
      techniques.find((technique) => technique.id === selectedTechniqueForAnalysis) ?? techniques[0],
    [selectedTechniqueForAnalysis]
  );
  const currentDiaryMode = useMemo(
    () => diaryModes.find((mode) => mode.id === diaryMode) ?? diaryModes[0],
    [diaryMode]
  );
  const currentModeGuide = useMemo(() => diaryModeGuides[diaryMode], [diaryMode]);
  const currentModeAnswers = useMemo(() => modeAnswers[diaryMode] ?? {}, [diaryMode, modeAnswers]);
  const modeFilledCount = useMemo(
    () => currentModeGuide.fields.filter((field) => (currentModeAnswers[field.key] ?? "").trim()).length,
    [currentModeAnswers, currentModeGuide.fields]
  );
  const composedDiaryText = useMemo(
    () => composeDiaryContent(diaryMode, currentModeAnswers, reflection),
    [currentModeAnswers, diaryMode, reflection]
  );
  const dailyFortune = useMemo(
    () => pickDailyFortune(journalDate, uid ?? userEmail ?? guestSessionId ?? "guest"),
    [guestSessionId, journalDate, uid, userEmail]
  );
  const currentChildTechnique = useMemo(
    () => techniques.find((technique) => technique.id === childTechnique) ?? techniques[0],
    [childTechnique]
  );
  const isIntakeValid = useMemo(() => {
    return (
      intake.age.trim() &&
      intake.currentSituation.trim() &&
      intake.periodFrequency.trim() &&
      intake.hardestPoint.trim()
    );
  }, [intake]);
  const isDeveloper = useMemo(() => {
    if (isGuestUser) return false;
    const normalized = authEmail.trim().toLowerCase();
    return normalized !== "" && developerEmails.includes(normalized);
  }, [authEmail, isGuestUser]);

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
        setChatThreads([]);
        setActiveChatId(null);
        setMessages([{ role: "assistant", text: DEFAULT_ASSISTANT_MESSAGE }]);
        setJournalList([]);
        setChildList([]);
        setUid(user.uid);
        setIsGuestUser(user.isAnonymous);
        setAuthEmail(user.email ?? "");
        if (user.isAnonymous) {
          setUserEmail("게스트 사용자");
        } else {
          void (async () => {
            try {
              const profileSnap = await getDoc(doc(db, "users", user.uid));
              if (profileSnap.exists()) {
                const data = profileSnap.data();
                const profileName = String(data.nickname ?? "").trim();
                const profileId = String(data.accountId ?? "").trim();
                setUserEmail(
                  profileName && profileId
                    ? `${profileName} (${profileId})`
                    : profileName || profileId || user.email || user.uid
                );
                return;
              }
              setUserEmail(user.email ?? user.uid);
            } catch {
              setUserEmail(user.email ?? user.uid);
            }
          })();
        }
        if (user.isAnonymous) {
          const existingSession = sessionStorage.getItem("guest_session_id");
          if (existingSession) {
            setGuestSessionId(existingSession);
          } else {
            const nextSession = crypto.randomUUID();
            sessionStorage.setItem("guest_session_id", nextSession);
            setGuestSessionId(nextSession);
          }
        } else {
          sessionStorage.removeItem("guest_session_id");
          setGuestSessionId(null);
        }
      } else {
        setUid(null);
        setGuestSessionId(null);
        setAuthEmail("");
        setUserEmail("");
        setIsGuestUser(false);
        setChatThreads([]);
        setActiveChatId(null);
        setMessages([{ role: "assistant", text: DEFAULT_ASSISTANT_MESSAGE }]);
        setJournalList([]);
        setChildList([]);
      }
      setAuthLoading(false);
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!uid) return;
    if (isGuestUser && !guestSessionId) return;

    const q = isDeveloper
      ? query(collection(db, "journals"), orderBy("date", "desc"), limit(2000))
      : isGuestUser
      ? query(
          collection(db, "journals"),
          where("guestSessionId", "==", guestSessionId),
          orderBy("date", "desc"),
          limit(1000)
        )
      : query(
          collection(db, "journals"),
          where("uid", "==", uid),
          orderBy("date", "desc"),
          limit(1000)
        );

    const unsub = onSnapshot(q, (snapshot) => {
      const rows: JournalEntry[] = snapshot.docs.map((journalDoc) => {
        const data = journalDoc.data();
        return {
          id: journalDoc.id,
          uid: String(data.uid ?? ""),
          authorLabel: String(data.authorLabel ?? data.userEmail ?? data.uid ?? ""),
          date: String(data.date ?? ""),
          mode: String(data.mode ?? "general") as DiaryModeId,
          fortuneId: String(data.fortuneId ?? ""),
          fortuneText: String(data.fortuneText ?? ""),
          missionText: String(data.missionText ?? ""),
          missionCompleted: Boolean(data.missionCompleted ?? false),
          medicationRecord:
            typeof data.medicationRecord === "object" && data.medicationRecord
              ? {
                  status:
                    data.medicationRecord.status === "partial" || data.medicationRecord.status === "skipped"
                      ? data.medicationRecord.status
                      : "taken",
                  times: Array.isArray(data.medicationRecord.times)
                    ? data.medicationRecord.times.map((item: unknown) => String(item))
                    : [],
                  name: String(data.medicationRecord.name ?? ""),
                  category: String(data.medicationRecord.category ?? ""),
                  note: String(data.medicationRecord.note ?? ""),
                  missedReason: String(data.medicationRecord.missedReason ?? ""),
                }
              : Array.isArray(data.medicationChecks) && data.medicationChecks.length > 0
              ? {
                  status: "taken",
                  times: [],
                  name: "",
                  category: "기타",
                  note: data.medicationChecks.map((item: unknown) => String(item)).join(", "),
                  missedReason: "",
                }
              : null,
          mood: Number(data.mood ?? 5),
          energy: Number(data.energy ?? 5),
          relationship: Number(data.relationship ?? 5),
          achievement: Number(data.achievement ?? 5),
          emotions: Array.isArray(data.emotions)
            ? data.emotions.map((emotion: unknown) => String(emotion))
            : [],
          reflection: String(data.reflection ?? data.text ?? ""),
          text: String(data.text ?? data.reflection ?? ""),
          createdAt: data.createdAt,
        };
      });
      setJournalList(rows);
    });

    return () => unsub();
  }, [guestSessionId, isDeveloper, isGuestUser, uid]);

  useEffect(() => {
    if (!uid) {
      setHealthSettings({ enabled: false, medicationEnabled: false, consented: false });
      return;
    }
    if (isGuestUser) {
      if (!guestSessionId) return;
      try {
        const raw = window.localStorage.getItem(guestHealthSettingsKey(guestSessionId));
        if (!raw) {
          setHealthSettings({ enabled: false, medicationEnabled: false, consented: false });
          return;
        }
        const parsed = JSON.parse(raw);
        if (typeof parsed !== "object" || !parsed) {
          setHealthSettings({ enabled: false, medicationEnabled: false, consented: false });
          return;
        }
        setHealthSettings({
          enabled: Boolean((parsed as { enabled?: unknown }).enabled),
          medicationEnabled: Boolean((parsed as { medicationEnabled?: unknown }).medicationEnabled),
          consented: Boolean((parsed as { consented?: unknown }).consented),
        });
      } catch {
        setHealthSettings({ enabled: false, medicationEnabled: false, consented: false });
      }
      return;
    }

    const unsub = onSnapshot(doc(db, "diary-settings", uid), (snapshot) => {
      const data = snapshot.data();
      setHealthSettings({
        enabled: Boolean(data?.healthTrackingEnabled ?? false),
        medicationEnabled: Boolean(data?.medicationTrackingEnabled ?? false),
        consented: Boolean(data?.healthConsent ?? false),
      });
    });
    return () => unsub();
  }, [guestSessionId, isGuestUser, uid]);

  useEffect(() => {
    if (!uid || !isDeveloper) {
      setAdminUsers([]);
      setDeleteRequests([]);
      return;
    }

    const usersQ = query(
      collection(db, "users"),
      where("consentAdminView", "==", true),
      limit(500)
    );
    const reqQ = query(collection(db, "account-delete-requests"), limit(500));

    const unsubUsers = onSnapshot(usersQ, (snapshot) => {
      const rows: UserProfile[] = snapshot.docs.map((profileDoc) => {
        const data = profileDoc.data();
        return {
          uid: String(data.uid ?? profileDoc.id),
          nickname: String(data.nickname ?? ""),
          accountId: String(data.accountId ?? ""),
          contact: String(data.contact ?? ""),
          consentAdminView: Boolean(data.consentAdminView ?? false),
          disabled: Boolean(data.disabled ?? false),
          createdAt: data.createdAt,
        };
      });
      setAdminUsers(rows.sort((a, b) => a.accountId.localeCompare(b.accountId)));
    });

    const unsubReq = onSnapshot(reqQ, (snapshot) => {
      const rows: DeleteRequest[] = snapshot.docs.map((reqDoc) => {
        const data = reqDoc.data();
        return {
          uid: String(data.uid ?? reqDoc.id),
          accountId: String(data.accountId ?? ""),
          nickname: String(data.nickname ?? ""),
          reason: String(data.reason ?? ""),
          status: data.status === "processed" ? "processed" : "pending",
          requestedAt: data.requestedAt,
          processedAt: data.processedAt,
        };
      });
      setDeleteRequests(rows.sort((a, b) => (a.status > b.status ? -1 : 1)));
    });

    return () => {
      unsubUsers();
      unsubReq();
    };
  }, [isDeveloper, uid]);

  useEffect(() => {
    if (!uid) {
      setExpertRequests([]);
      return;
    }
    if (isGuestUser && !guestSessionId) return;

    const q = isDeveloper
      ? query(collection(db, "expert-requests"), orderBy("createdAt", "desc"), limit(500))
      : isGuestUser
      ? query(
          collection(db, "expert-requests"),
          where("guestSessionId", "==", guestSessionId),
          orderBy("createdAt", "desc"),
          limit(200)
        )
      : query(
          collection(db, "expert-requests"),
          where("uid", "==", uid),
          orderBy("createdAt", "desc"),
          limit(200)
        );

    const unsub = onSnapshot(q, (snapshot) => {
      const rows: ExpertRequest[] = snapshot.docs.map((requestDoc) => {
        const data = requestDoc.data();
        return {
          id: requestDoc.id,
          uid: String(data.uid ?? ""),
          guestSessionId: data.guestSessionId ? String(data.guestSessionId) : null,
          authorLabel: String(data.authorLabel ?? data.userEmail ?? data.uid ?? ""),
          category: String(data.category ?? "일기 피드백"),
          requestText: String(data.requestText ?? ""),
          status: data.status === "answered" ? "answered" : "open",
          advisorReply: String(data.advisorReply ?? ""),
          advisorLabel: String(data.advisorLabel ?? ""),
          createdAt: data.createdAt,
          repliedAt: data.repliedAt,
        };
      });
      setExpertRequests(rows);
    });

    return () => unsub();
  }, [guestSessionId, isDeveloper, isGuestUser, uid]);

  useEffect(() => {
    if (!uid) return;
    if (isGuestUser) {
      setChatThreads([]);
      setActiveChatId(null);
      setMessages([{ role: "assistant", text: DEFAULT_ASSISTANT_MESSAGE }]);
      return;
    }

    const q = query(
      collection(db, "chats"),
      where("uid", "==", uid),
      orderBy("lastMessageAt", "desc"),
      limit(80)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const rows: ChatThread[] = snapshot.docs.map((chatDoc) => {
        const data = chatDoc.data();
        return {
          id: chatDoc.id,
          title: String(data.title ?? "새 상담"),
          createdAt: data.createdAt,
          lastMessageAt: data.lastMessageAt,
        };
      });
      setChatThreads(rows);
      if (rows.length === 0) {
        setActiveChatId(null);
        setMessages([{ role: "assistant", text: DEFAULT_ASSISTANT_MESSAGE }]);
        return;
      }
      setActiveChatId((prev) => prev ?? rows[0].id);
    });

    return () => unsub();
  }, [isGuestUser, uid]);

  useEffect(() => {
    if (!activeChatId) {
      setMessages([{ role: "assistant", text: DEFAULT_ASSISTANT_MESSAGE }]);
      return;
    }

    const q = query(
      collection(db, "chats", activeChatId, "messages"),
      orderBy("createdAt", "asc"),
      limit(400)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const rows: Msg[] = snapshot.docs.map((messageDoc) => {
        const data = messageDoc.data();
        return {
          role: data.role === "assistant" ? "assistant" : "user",
          text: String(data.text ?? ""),
        };
      });
      setMessages(
        rows.length > 0 ? rows : [{ role: "assistant", text: DEFAULT_ASSISTANT_MESSAGE }]
      );
    });

    return () => unsub();
  }, [activeChatId]);

  useEffect(() => {
    if (!uid) return;
    if (isGuestUser && !guestSessionId) return;

    const q = isDeveloper
      ? query(collection(db, "child-workspaces"), orderBy("date", "desc"), limit(2000))
      : isGuestUser
      ? query(
          collection(db, "child-workspaces"),
          where("guestSessionId", "==", guestSessionId),
          orderBy("date", "desc"),
          limit(1000)
        )
      : query(
          collection(db, "child-workspaces"),
          where("uid", "==", uid),
          orderBy("date", "desc"),
          limit(1000)
        );

    const unsub = onSnapshot(q, (snapshot) => {
      const rows: ChildEntry[] = snapshot.docs.map((childDoc) => {
        const data = childDoc.data();
        return {
          id: childDoc.id,
          uid: String(data.uid ?? ""),
          authorLabel: String(data.authorLabel ?? data.userEmail ?? data.uid ?? ""),
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
  }, [guestSessionId, isDeveloper, isGuestUser, uid]);

  useEffect(() => {
    setReflectionPromptCount(getReflectionPromptUsage(journalDate));
    setReflectionPromptMessage("");
  }, [journalDate]);

  useEffect(() => {
    if (!(healthSettings.enabled && healthSettings.medicationEnabled && healthSettings.consented)) {
      setHealthSectionOpen(false);
    }
  }, [healthSettings]);

  const weeklyPoints = useMemo<WeeklyPoint[]>(() => {
    const byDate = new Map<string, JournalEntry>();
    for (const entry of journalList) {
      if (!byDate.has(entry.date)) byDate.set(entry.date, entry);
    }

    const points: WeeklyPoint[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const day = new Date();
      day.setDate(day.getDate() - i);
      const key = dateInputValue(day);
      const entry = byDate.get(key);
      const label = `${day.getMonth() + 1}/${day.getDate()}`;
      points.push({
        date: key,
        label,
        mood: entry ? entry.mood : null,
        score: entry ? scoreFromMood(entry.mood) : null,
        hasMedication: Boolean(entry?.medicationRecord),
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
  const todayCompositeMood = useMemo(
    () => averageMood([mood, energy, relationship, achievement]),
    [achievement, energy, mood, relationship]
  );
  const todayCompositeScore = useMemo(() => scoreFromMood(todayCompositeMood), [todayCompositeMood]);
  const emotionSummary = useMemo(
    () => emotionSummaryText(emotions, mood, energy),
    [emotions, energy, mood]
  );
  const reflectionLength = useMemo(() => composedDiaryText.trim().length, [composedDiaryText]);
  const keySentence = useMemo(() => extractKeySentence(composedDiaryText), [composedDiaryText]);
  const liveAiComment = useMemo(() => {
    if (!liveCommentEnabled) return "";
    if (todayCompositeMood >= 8) {
      return "안정 자원이 충분해 보입니다. 내일 유지할 루틴 1개를 적어보세요.";
    }
    if (todayCompositeMood >= 5) {
      return "균형 구간입니다. 감정 변동을 만든 사건 1가지만 더 적어보면 분석 정확도가 올라갑니다.";
    }
    return "부담 강도가 높아 보입니다. 오늘 가장 힘든 순간 1개와 그때 든 생각을 분리해 적어보세요.";
  }, [liveCommentEnabled, todayCompositeMood]);
  const emotionDonut = useMemo(() => {
    const positive = emotions.filter((emotion) => ["기쁨", "감사", "평온", "희망"].includes(emotion)).length;
    const neutral = emotions.filter((emotion) => ["피곤", "답답함"].includes(emotion)).length;
    const negative = emotions.filter((emotion) => ["불안", "우울", "분노", "외로움"].includes(emotion)).length;
    const total = positive + neutral + negative;
    if (total === 0) {
      return {
        gradient: "conic-gradient(#f1dfd2 0deg 360deg)",
        labels: [
          { key: "긍정", value: 0, color: "#4e8d5d" },
          { key: "중립", value: 0, color: "#ba814b" },
          { key: "부담", value: 0, color: "#c45a4d" },
        ],
      };
    }
    const positiveDeg = Math.round((positive / total) * 360);
    const neutralDeg = Math.round((neutral / total) * 360);
    return {
      gradient: `conic-gradient(#5daa6e 0deg ${positiveDeg}deg, #e3a35f ${positiveDeg}deg ${
        positiveDeg + neutralDeg
      }deg, #d16b5e ${positiveDeg + neutralDeg}deg 360deg)`,
      labels: [
        { key: "긍정", value: positive, color: "#4e8d5d" },
        { key: "중립", value: neutral, color: "#ba814b" },
        { key: "부담", value: negative, color: "#c45a4d" },
      ],
    };
  }, [emotions]);
  const weeklyLineMeta = useMemo(() => {
    const width = 420;
    const height = 160;
    const xs = weeklyPoints.map((_, index) =>
      Math.round((index / Math.max(1, weeklyPoints.length - 1)) * width)
    );
    const ys = weeklyPoints.map((point) => lineYFromMood(point.mood, height));
    const linePoints = weeklyPoints
      .map((_, index) => (ys[index] === null ? null : `${xs[index]},${ys[index]}`))
      .filter((point): point is string => Boolean(point))
      .join(" ");
    return { width, height, xs, ys, linePoints };
  }, [weeklyPoints]);

  const latestChildEntries = useMemo(() => childList.slice(0, 20), [childList]);
  const developerAuthors = useMemo(() => {
    const counts = new Map<
      string,
      { key: string; uid: string; label: string; diary: number; child: number; lastDate: string; firstDate: string }
    >();

    for (const entry of journalList) {
      const key = makeAuthorKey(entry.uid, entry.authorLabel);
      const row = counts.get(key) ?? {
        key,
        uid: entry.uid || "-",
        label: entry.authorLabel || entry.uid || "(알 수 없음)",
        diary: 0,
        child: 0,
        lastDate: entry.date,
        firstDate: entry.date,
      };
      row.diary += 1;
      if (entry.date > row.lastDate) row.lastDate = entry.date;
      if (entry.date < row.firstDate) row.firstDate = entry.date;
      counts.set(key, row);
    }

    for (const entry of childList) {
      const key = makeAuthorKey(entry.uid, entry.authorLabel);
      const row = counts.get(key) ?? {
        key,
        uid: entry.uid || "-",
        label: entry.authorLabel || entry.uid || "(알 수 없음)",
        diary: 0,
        child: 0,
        lastDate: entry.date,
        firstDate: entry.date,
      };
      row.child += 1;
      if (entry.date > row.lastDate) row.lastDate = entry.date;
      if (entry.date < row.firstDate) row.firstDate = entry.date;
      counts.set(key, row);
    }

    return [...counts.values()].sort((a, b) => b.diary + b.child - (a.diary + a.child));
  }, [childList, journalList]);
  const filteredJournalEntries = useMemo(() => {
    if (developerAuthorFilter === "all") return journalList;
    return journalList.filter((entry) => makeAuthorKey(entry.uid, entry.authorLabel) === developerAuthorFilter);
  }, [developerAuthorFilter, journalList]);
  const filteredChildEntries = useMemo(() => {
    if (developerAuthorFilter === "all") return childList;
    return childList.filter((entry) => makeAuthorKey(entry.uid, entry.authorLabel) === developerAuthorFilter);
  }, [childList, developerAuthorFilter]);
  const combinedDeveloperActivities = useMemo(() => {
    const journalActivities = filteredJournalEntries.map((entry) => ({
      id: entry.id,
      author: entry.authorLabel || entry.uid,
      date: entry.date,
      type: "일기",
      summary: `기분 ${entry.mood}/10 · 에너지 ${entry.energy}/10 · 관계 ${entry.relationship}/10 · 성취 ${entry.achievement}/10`,
      detail: entry.reflection || entry.text || "(소감 없음)",
    }));

    const childActivities = filteredChildEntries.map((entry) => ({
      id: entry.id,
      author: entry.authorLabel || entry.uid,
      date: entry.date,
      type: "육아일기",
      summary: `변화 ${entry.progress}/10 · ${entry.childName || "자녀 이름 미입력"}`,
      detail: `상황: ${entry.situation}${entry.intervention ? `\n시도: ${entry.intervention}` : ""}${entry.outcome ? `\n결과: ${entry.outcome}` : ""}`,
    }));

    return [...journalActivities, ...childActivities].sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredChildEntries, filteredJournalEntries]);
  const groupedDiaryByDate = useMemo(
    () => groupByDateDesc(filteredJournalEntries),
    [filteredJournalEntries]
  );
  const groupedChildByDate = useMemo(
    () => groupByDateDesc(filteredChildEntries),
    [filteredChildEntries]
  );
  const groupedCombinedByDate = useMemo(
    () => groupByDateDesc(combinedDeveloperActivities),
    [combinedDeveloperActivities]
  );

  const diaryAnalysisBounds = useMemo(() => {
    if (diaryAnalysisRange === "monthly") {
      const year = diaryAnalysisMonth.getFullYear();
      const month = diaryAnalysisMonth.getMonth();
      return {
        start: dateInputValue(new Date(year, month, 1)),
        end: dateInputValue(new Date(year, month + 1, 0)),
      };
    }
    if (diaryAnalysisRange === "custom") {
      const start = diaryAnalysisStartDate || todayInputValue();
      const end = diaryAnalysisEndDate || start;
      return start <= end ? { start, end } : { start: end, end: start };
    }
    return {
      start: dateInputValue(addDays(new Date(), -6)),
      end: todayInputValue(),
    };
  }, [diaryAnalysisEndDate, diaryAnalysisMonth, diaryAnalysisRange, diaryAnalysisStartDate]);
  const diaryAnalysisEntries = useMemo(() => {
    const { start, end } = diaryAnalysisBounds;
    return journalList.filter((entry) => entry.date >= start && entry.date <= end);
  }, [diaryAnalysisBounds, journalList]);
  const diaryAnalysisEntryText = useMemo(() => {
    const useMedicationContext =
      healthSettings.enabled && healthSettings.medicationEnabled && healthSettings.consented;
    return diaryAnalysisEntries
      .map((entry) => {
        const meds = entry.medicationRecord
          ? `${entry.medicationRecord.status}${
              entry.medicationRecord.times.length ? ` (${entry.medicationRecord.times.join("/")})` : ""
            }${entry.medicationRecord.name ? ` ${entry.medicationRecord.name}` : ""}${
              entry.medicationRecord.category ? ` [${entry.medicationRecord.category}]` : ""
            }${entry.medicationRecord.missedReason ? ` / 누락이유: ${entry.medicationRecord.missedReason}` : ""}`
          : "(기록 없음)";
        const base = `${entry.date} | 기분 ${entry.mood}/10 | 에너지 ${entry.energy}/10 | 관계 ${entry.relationship}/10 | 성취 ${
          entry.achievement
        }/10 | 감정 ${entry.emotions.join(", ") || "(없음)"}`;
        const medPart = useMedicationContext ? ` | 투약체크 ${meds}` : "";
        return `${base}${medPart} | 소감: ${entry.reflection || entry.text || "(없음)"}`;
      })
      .join("\n");
  }, [diaryAnalysisEntries, healthSettings]);
  const diaryAnalysisRangeLabel = useMemo(() => {
    if (diaryAnalysisRange === "monthly") return "월간";
    if (diaryAnalysisRange === "custom") return "기간 지정";
    return "주간";
  }, [diaryAnalysisRange]);

  const diaryEntryMetaMap = useMemo(() => {
    const byDate = new Map<string, JournalEntry[]>();
    for (const entry of journalList) {
      const bucket = byDate.get(entry.date) ?? [];
      bucket.push(entry);
      byDate.set(entry.date, bucket);
    }
    const meta = new Map<string, { hasEntry: boolean; avgMood: number | null; hasMedication: boolean }>();
    byDate.forEach((entries, date) => {
      meta.set(date, {
        hasEntry: true,
        avgMood: averageMood(entries.map((entry) => entry.mood)),
        hasMedication: entries.some((entry) => Boolean(entry.medicationRecord)),
      });
    });
    return meta;
  }, [journalList]);

  const diaryMonthDays = useMemo(() => {
    const year = diaryAnalysisMonth.getFullYear();
    const month = diaryAnalysisMonth.getMonth();
    const first = new Date(year, month, 1);
    const totalDays = new Date(year, month + 1, 0).getDate();
    const leading = first.getDay();
    const cells: Array<{
      date: string;
      day: number;
      hasEntry: boolean;
      avgMood: number | null;
      hasMedication: boolean;
      heatTone: string;
      isFuture: boolean;
    }> = [];

    for (let i = 0; i < leading; i += 1) {
      cells.push({
        date: "",
        day: 0,
        hasEntry: false,
        avgMood: null,
        hasMedication: false,
        heatTone: "none",
        isFuture: false,
      });
    }

    const today = todayInputValue();
    for (let day = 1; day <= totalDays; day += 1) {
      const date = dateInputValue(new Date(year, month, day));
      const meta = diaryEntryMetaMap.get(date);
      const avgMood = meta?.avgMood ?? null;
      cells.push({
        date,
        day,
        hasEntry: Boolean(meta?.hasEntry),
        avgMood,
        hasMedication: Boolean(meta?.hasMedication),
        heatTone: moodHeatTone(avgMood),
        isFuture: date > today,
      });
    }

    return cells;
  }, [diaryAnalysisMonth, diaryEntryMetaMap]);
  const diaryInsights = useMemo(() => {
    const valid = journalList.filter((entry) => Number.isFinite(entry.mood));
    if (valid.length === 0) {
      return { streak: 0, toughestDay: "-", strongestDay: "-" };
    }
    const dateSet = new Set(valid.map((entry) => entry.date));
    let streak = 0;
    while (true) {
      const day = new Date();
      day.setDate(day.getDate() - streak);
      const key = dateInputValue(day);
      if (!dateSet.has(key)) break;
      streak += 1;
    }
    let minEntry = valid[0];
    let maxEntry = valid[0];
    for (const entry of valid) {
      if (entry.mood < minEntry.mood) minEntry = entry;
      if (entry.mood > maxEntry.mood) maxEntry = entry;
    }
    return {
      streak,
      toughestDay: `${minEntry.date} (${minEntry.mood}/10)`,
      strongestDay: `${maxEntry.date} (${maxEntry.mood}/10)`,
    };
  }, [journalList]);
  const weeklyAnalysisCards = useMemo(() => {
    const summary = weeklyAiSummary.trim();
    if (!summary) return [];
    const lines = summary
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const pick = (keywords: string[], fallbackIndex: number) =>
      lines.find((line) => keywords.some((keyword) => line.includes(keyword))) ??
      lines[fallbackIndex] ??
      "-";
    return [
      { title: "이번 주 감정 패턴", body: pick(["감정", "흐름", "패턴"], 0) },
      { title: "반복되는 키워드", body: pick(["반복", "키워드", "주요"], 1) },
      { title: "스트레스 요인", body: pick(["스트레스", "부담", "트리거"], 2) },
      { title: "강점 요인", body: pick(["강점", "회복", "자원"], 3) },
      { title: "다음 주 제안", body: pick(["제안", "실천", "다음"], 4) },
    ];
  }, [weeklyAiSummary]);
  const weeklyFortuneReport = useMemo(() => {
    const recent = [...journalList]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 7)
      .filter((entry) => Boolean(entry.fortuneId));
    if (recent.length === 0) {
      return "최근 7일 조언 미션 기록이 아직 없습니다.";
    }
    const completed = recent.filter((entry) => entry.missionCompleted).length;
    const overcameLowEnergy = recent.filter((entry) => {
      if ((entry.fortuneId ?? "").includes("energy") || (entry.fortuneText ?? "").includes("지칠")) {
        return entry.mood >= 7;
      }
      return false;
    }).length;
    const confidenceWins = recent.filter((entry) => {
      if ((entry.fortuneId ?? "").includes("confidence")) {
        return entry.achievement >= 7;
      }
      return false;
    }).length;
    return [
      `조언 미션 완료: ${completed}/${recent.length}`,
      `지침 예고를 극복한 날: ${overcameLowEnergy}일`,
      `자신감 조언을 성취로 연결한 날: ${confidenceWins}일`,
      completed >= Math.ceil(recent.length / 2)
        ? "해석: 예측에 휘둘리지 않고 행동으로 패턴을 바꾸고 있습니다."
        : "해석: 미션 실행 빈도를 조금만 높이면 감정 패턴이 더 빠르게 안정될 수 있어요.",
    ].join("\n");
  }, [journalList]);
  const medicationPatternSummary = useMemo(() => {
    if (!(healthSettings.enabled && healthSettings.medicationEnabled && healthSettings.consented)) {
      return "";
    }
    const recent = [...diaryAnalysisEntries].filter((entry) => Boolean(entry.medicationRecord));
    if (recent.length === 0) return "";
    const taken = recent.filter((entry) => entry.medicationRecord?.status === "taken").length;
    const partial = recent.filter((entry) => entry.medicationRecord?.status === "partial").length;
    const skipped = recent.filter((entry) => entry.medicationRecord?.status === "skipped").length;
    const missedReasons = recent
      .map((entry) => entry.medicationRecord?.missedReason.trim() ?? "")
      .filter(Boolean);
    const reasonHint = missedReasons.length > 0 ? `누락 메모: ${missedReasons.slice(0, 3).join(" / ")}` : "";
    return [
      `분석 기간 투약 기록 ${recent.length}건`,
      `잘 복용 ${taken}회 / 일부 놓침 ${partial}회 / 복용 안 함 ${skipped}회`,
      reasonHint,
    ]
      .filter(Boolean)
      .join("\n");
  }, [diaryAnalysisEntries, healthSettings]);
  const selectedDiaryEntries = useMemo(() => {
    return journalList.filter((entry) => entry.date === journalDate);
  }, [journalDate, journalList]);

  const childWeeklyPoints = useMemo<ChildPoint[]>(() => {
    const byDate = new Map<string, ChildEntry>();
    for (const entry of childList) {
      if (!byDate.has(entry.date)) byDate.set(entry.date, entry);
    }

    const points: ChildPoint[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const day = new Date();
      day.setDate(day.getDate() - i);
      const key = dateInputValue(day);
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
  const childTimelineEntries = useMemo(() => {
    return [...childList].sort((a, b) => {
      const byDate = a.date.localeCompare(b.date);
      if (byDate !== 0) return byDate;
      return a.id.localeCompare(b.id);
    });
  }, [childList]);
  const childEntryMetaMap = useMemo(() => {
    const byDate = new Map<string, ChildEntry[]>();
    for (const entry of childList) {
      const bucket = byDate.get(entry.date) ?? [];
      bucket.push(entry);
      byDate.set(entry.date, bucket);
    }
    const meta = new Map<string, { hasEntry: boolean; avgScore: number | null }>();
    byDate.forEach((entries, date) => {
      meta.set(date, {
        hasEntry: true,
        avgScore: averageMood(entries.map((entry) => entry.progress)),
      });
    });
    return meta;
  }, [childList]);
  const childMonthDays = useMemo(() => {
    const year = childAnalysisMonth.getFullYear();
    const month = childAnalysisMonth.getMonth();
    const first = new Date(year, month, 1);
    const totalDays = new Date(year, month + 1, 0).getDate();
    const leading = first.getDay();
    const cells: Array<{
      date: string;
      day: number;
      hasEntry: boolean;
      avgScore: number | null;
      heatTone: string;
      isFuture: boolean;
    }> = [];
    for (let i = 0; i < leading; i += 1) {
      cells.push({
        date: "",
        day: 0,
        hasEntry: false,
        avgScore: null,
        heatTone: "none",
        isFuture: false,
      });
    }
    const today = todayInputValue();
    for (let day = 1; day <= totalDays; day += 1) {
      const date = dateInputValue(new Date(year, month, day));
      const meta = childEntryMetaMap.get(date);
      const avgScore = meta?.avgScore ?? null;
      cells.push({
        date,
        day,
        hasEntry: Boolean(meta?.hasEntry),
        avgScore,
        heatTone: moodHeatTone(avgScore),
        isFuture: date > today,
      });
    }
    return cells;
  }, [childAnalysisMonth, childEntryMetaMap]);
  const selectedChildEntries = useMemo(() => {
    return childList.filter((entry) => entry.date === childDate);
  }, [childDate, childList]);

  function childSignalTags(entry: ChildEntry) {
    const tags: Array<{ label: string; tone: "risk" | "good" | "warn" }> = [];
    const text = `${entry.situation} ${entry.outcome}`.toLowerCase();

    if (entry.progress <= 3) tags.push({ label: "위험 신호", tone: "risk" });
    if (entry.progress >= 8) tags.push({ label: "긍정 변화", tone: "good" });
    if (!entry.aiSolution.trim()) tags.push({ label: "솔루션 미작성", tone: "warn" });
    if (["악화", "거부", "공격", "폭발", "충돌"].some((keyword) => text.includes(keyword))) {
      tags.push({ label: "즉시 점검 필요", tone: "risk" });
    }

    if (tags.length === 0) tags.push({ label: "관찰 유지", tone: "warn" });
    return tags;
  }

  function renderHighlightedText(text: string) {
    if (!text.trim()) return "(미입력)";
    const regex = new RegExp(`(${childHighlightWords.join("|")})`, "g");
    return text.split(regex).map((part, idx) => {
      if (childHighlightWords.includes(part)) {
        return (
          <mark key={`${part}-${idx}`} className="textHighlight">
            {part}
          </mark>
        );
      }
      return <span key={`txt-${idx}`}>{part}</span>;
    });
  }

  useEffect(() => {
    if (activeTab !== "counsel" || !intakeCompleted) return;
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeTab, intakeCompleted, loading, messages]);

  async function handleGoogleLogin() {
    setAuthSubmitting(true);
    setAuthMessage("");

    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: unknown) {
      setAuthMessage(authErrorMessage(error, "google"));
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleGuestLogin() {
    setAuthSubmitting(true);
    setAuthMessage("");

    try {
      const current = auth.currentUser;
      if (current?.isAnonymous) {
        await deleteUser(current);
      }
      const nextSession = crypto.randomUUID();
      sessionStorage.setItem("guest_session_id", nextSession);
      setGuestSessionId(nextSession);
      await signInAnonymously(auth);
    } catch (error: unknown) {
      setAuthMessage(authErrorMessage(error, "guest"));
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleEmailLogin() {
    if (!accountId.trim() || !password.trim()) {
      setAuthMessage("아이디와 비밀번호를 입력해 주세요.");
      return;
    }

    setAuthSubmitting(true);
    setAuthMessage("");
    try {
      const credential = await signInWithEmailAndPassword(auth, toAuthEmail(accountId), password);
      const profileSnap = await getDoc(doc(db, "users", credential.user.uid));
      if (profileSnap.exists() && Boolean(profileSnap.data().disabled ?? false)) {
        await signOut(auth);
        setAuthMessage("삭제 처리된 계정입니다. 관리자에게 문의해 주세요.");
        return;
      }
      setAuthMessage("로그인되었습니다.");
      setPassword("");
    } catch (error: unknown) {
      setAuthMessage(authErrorMessage(error, "login"));
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleEmailSignup() {
    if (!nickname.trim() || !accountId.trim() || !password.trim() || !contact.trim()) {
      setAuthMessage("이름(별명), 아이디, 비밀번호, 연락처를 모두 입력해 주세요.");
      return;
    }
    if (password.length < 6) {
      setAuthMessage("비밀번호는 6자 이상이어야 합니다.");
      return;
    }
    if (!/^[a-z0-9._-]{4,20}$/i.test(accountId.trim())) {
      setAuthMessage("아이디는 4~20자 영문/숫자/._- 형식으로 입력해 주세요.");
      return;
    }
    if (!signupConsentAdminView) {
      setAuthMessage("관리자 조회 동의 체크 후 회원가입할 수 있습니다.");
      return;
    }

    setAuthSubmitting(true);
    setAuthMessage("");
    try {
      const credential = await createUserWithEmailAndPassword(auth, toAuthEmail(accountId), password);
      await setDoc(doc(db, "users", credential.user.uid), {
        uid: credential.user.uid,
        nickname: nickname.trim(),
        accountId: normalizeAccountId(accountId),
        contact: contact.trim(),
        authEmail: toAuthEmail(accountId),
        consentAdminView: signupConsentAdminView,
        disabled: false,
        createdAt: serverTimestamp(),
      });
      setAuthMessage("회원가입이 완료되었습니다. 아이디/비밀번호로 로그인할 수 있습니다.");
      setSignupMode(false);
      setNickname("");
      setContact("");
      setPassword("");
    } catch (error: unknown) {
      setAuthMessage(authErrorMessage(error, "signup"));
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleLogout() {
    try {
      await signOut(auth);
      sessionStorage.removeItem("guest_session_id");
      setActiveTab("counsel");
      setAuthMessage("로그아웃되었습니다.");
    } catch (error) {
      console.error(error);
      setAuthMessage("로그아웃 중 오류가 발생했습니다.");
    }
  }

  async function startNewChat() {
    if (!uid) return;
    if (isGuestUser) {
      setActiveChatId(null);
      setMessages([{ role: "assistant", text: DEFAULT_ASSISTANT_MESSAGE }]);
      return;
    }
    const newChatId = crypto.randomUUID();
    const firstMessage: Msg = { role: "assistant", text: DEFAULT_ASSISTANT_MESSAGE };
    setActiveChatId(newChatId);
    setMessages([firstMessage]);

    await setDoc(
      doc(db, "chats", newChatId),
      {
        uid,
        track: selectedTrack,
        title: "새 상담",
        createdAt: serverTimestamp(),
        lastMessageAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  async function deleteChatThread(threadId: string) {
    if (isGuestUser) return;
    const selected = chatThreads.find((thread) => thread.id === threadId);
    const label = selected?.title || "이 상담";
    if (!window.confirm(`'${label}' 상담을 삭제할까요?`)) return;

    try {
      const messagesSnap = await getDocs(collection(db, "chats", threadId, "messages"));
      if (messagesSnap.size > 0) {
        const chunkSize = 450;
        for (let i = 0; i < messagesSnap.docs.length; i += chunkSize) {
          const batch = writeBatch(db);
          messagesSnap.docs.slice(i, i + chunkSize).forEach((messageDoc) => {
            batch.delete(messageDoc.ref);
          });
          await batch.commit();
        }
      }

      await deleteDoc(doc(db, "chats", threadId));

      if (activeChatId === threadId) {
        const next = chatThreads.find((thread) => thread.id !== threadId);
        setActiveChatId(next?.id ?? null);
      }
    } catch (error) {
      console.error(error);
      setAuthMessage("상담 목록 삭제 중 오류가 발생했습니다.");
    }
  }

  async function requestAccountDeletion() {
    if (!uid || isGuestUser) return;
    const profileSnap = await getDoc(doc(db, "users", uid));
    const profile = profileSnap.data();

    await setDoc(
      doc(db, "account-delete-requests", uid),
      {
        uid,
        accountId: String(profile?.accountId ?? ""),
        nickname: String(profile?.nickname ?? ""),
        reason: deleteReason.trim() || "사용자 요청",
        status: "pending",
        requestedAt: serverTimestamp(),
      },
      { merge: true }
    );

    setDeleteReason("");
    setAuthMessage("계정 삭제 요청이 접수되었습니다.");
  }

  async function processDeleteRequest(targetUid: string) {
    if (!isDeveloper || deletingUid) return;
    if (!window.confirm("이 사용자의 계정을 삭제 처리할까요?")) return;
    setDeletingUid(targetUid);

    try {
      const journalQ = query(collection(db, "journals"), where("uid", "==", targetUid), limit(2000));
      const childQ = query(collection(db, "child-workspaces"), where("uid", "==", targetUid), limit(2000));
      const chatQ = query(collection(db, "chats"), where("uid", "==", targetUid), limit(2000));

      const [journalSnap, childSnap, chatSnap] = await Promise.all([
        getDocs(journalQ),
        getDocs(childQ),
        getDocs(chatQ),
      ]);

      for (const snap of [journalSnap, childSnap]) {
        for (let i = 0; i < snap.docs.length; i += 450) {
          const batch = writeBatch(db);
          snap.docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }

      for (const chatDoc of chatSnap.docs) {
        const msgsSnap = await getDocs(collection(db, "chats", chatDoc.id, "messages"));
        for (let i = 0; i < msgsSnap.docs.length; i += 450) {
          const batch = writeBatch(db);
          msgsSnap.docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
        await deleteDoc(chatDoc.ref);
      }

      await setDoc(
        doc(db, "users", targetUid),
        {
          disabled: true,
          deletedAt: serverTimestamp(),
        },
        { merge: true }
      );
      await setDoc(
        doc(db, "account-delete-requests", targetUid),
        {
          status: "processed",
          processedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (error) {
      console.error(error);
      setAuthMessage("삭제 처리 중 오류가 발생했습니다.");
    } finally {
      setDeletingUid(null);
    }
  }

  async function submitExpertRequest() {
    if (!uid) return;
    if (!expertRequestText.trim()) {
      setSaveStatus("전문가 요청 내용을 입력해 주세요.");
      return;
    }

    try {
      await addDoc(collection(db, "expert-requests"), {
        uid,
        guestSessionId: isGuestUser ? guestSessionId : null,
        authorLabel: userEmail || uid,
        category: expertCategory,
        requestText: expertRequestText.trim(),
        status: "open",
        advisorReply: "",
        advisorLabel: "",
        createdAt: serverTimestamp(),
      });
      setExpertRequestText("");
      setSaveStatus("전문가 요청이 등록되었습니다.");
    } catch (error) {
      console.error(error);
      setSaveStatus("전문가 요청 등록 중 오류가 발생했습니다.");
    }
  }

  async function saveExpertReply(request: ExpertRequest) {
    if (!isDeveloper) return;
    const reply = (replyDrafts[request.id] ?? "").trim();
    if (!reply) {
      setAuthMessage("조언 내용을 입력해 주세요.");
      return;
    }
    try {
      await setDoc(
        doc(db, "expert-requests", request.id),
        {
          status: "answered",
          advisorReply: reply,
          advisorLabel: userEmail || authEmail || "관리자",
          repliedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setReplyDrafts((prev) => ({ ...prev, [request.id]: "" }));
    } catch (error) {
      console.error(error);
      setAuthMessage("전문가 조언 저장 중 오류가 발생했습니다.");
    }
  }

  function addReflectionPrompt() {
    const used = getReflectionPromptUsage(journalDate);
    if (used >= REFLECTION_PROMPT_DAILY_LIMIT) {
      setReflectionPromptCount(used);
      setReflectionPromptMessage("오늘은 보조 질문을 3번 모두 사용했습니다.");
      return;
    }

    const available = reflectionPromptPool.filter((prompt) => !reflection.includes(prompt));
    const pool = available.length > 0 ? available : reflectionPromptPool;
    const prompt = pool[Math.floor(Math.random() * pool.length)];
    setReflection((prev) => (prev.trim() ? `${prev.trim()}\n\n${prompt}\n` : `${prompt}\n`));

    const nextCount = used + 1;
    setReflectionPromptUsage(journalDate, nextCount);
    setReflectionPromptCount(nextCount);
    setReflectionPromptMessage(`보조 질문 사용 ${nextCount}/${REFLECTION_PROMPT_DAILY_LIMIT}`);
  }

  function addFortuneMissionPrompt() {
    const prompt = dailyFortune.prompt;
    setReflection((prev) => (prev.trim() ? `${prev.trim()}\n\n${prompt}\n` : `${prompt}\n`));
  }

  function setModeAnswer(fieldKey: string, value: string) {
    setModeAnswers((prev) => ({
      ...prev,
      [diaryMode]: {
        ...(prev[diaryMode] ?? {}),
        [fieldKey]: value,
      },
    }));
  }

  function toggleMedicationTime(time: string) {
    setMedicationTimes((prev) =>
      prev.includes(time) ? prev.filter((value) => value !== time) : [...prev, time]
    );
  }

  async function saveHealthSettings(next: HealthSettings) {
    setHealthSettings(next);
    if (!uid) return;
    if (isGuestUser) {
      if (!guestSessionId) return;
      window.localStorage.setItem(guestHealthSettingsKey(guestSessionId), JSON.stringify(next));
      return;
    }
    await setDoc(
      doc(db, "diary-settings", uid),
      {
        uid,
        healthTrackingEnabled: next.enabled,
        medicationTrackingEnabled: next.medicationEnabled,
        healthConsent: next.consented,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  async function saveJournal() {
    if (!uid) {
      setSaveStatus("아직 로그인 중이라 저장할 수 없습니다.");
      return;
    }
    if (isGuestUser && !guestSessionId) {
      setSaveStatus("게스트 세션을 확인하는 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    if (!composedDiaryText.trim()) {
      setSaveStatus("모드 가이드 항목 또는 소감을 1개 이상 입력해 주세요.");
      return;
    }

    const hasMedicationInput =
      medicationStatus !== "" ||
      medicationTimes.length > 0 ||
      medicationName.trim() ||
      medicationCategory.trim() ||
      medicationMemo.trim() ||
      medicationMissedReason.trim();
    const medicationRecord =
      healthSettings.enabled && healthSettings.medicationEnabled && healthSettings.consented && hasMedicationInput
        ? {
            status: (medicationStatus || "taken") as "taken" | "partial" | "skipped",
            times: medicationTimes,
            name: medicationName.trim(),
            category: medicationCategory.trim(),
            note: medicationMemo.trim(),
            missedReason: medicationMissedReason.trim(),
          }
        : null;

    const payload = {
      uid,
      authorLabel: userEmail || uid,
      guestSessionId: isGuestUser ? guestSessionId : null,
      date: journalDate,
      mode: diaryMode,
      fortuneId: dailyFortune.id,
      fortuneText: dailyFortune.fortune,
      missionText: dailyFortune.mission,
      missionCompleted: fortuneMissionDone,
      medicationRecord,
      mood,
      energy,
      relationship,
      achievement,
      emotions,
      reflection: composedDiaryText.trim(),
      text: composedDiaryText.trim(),
    };

    try {
      if (editingJournalId) {
        await updateDoc(doc(db, "journals", editingJournalId), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
        setSaveStatus("일기 수정 완료");
      } else {
        await addDoc(collection(db, "journals"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        setSaveStatus("저장 완료");
      }

      setEditingJournalId(null);
      setReflection("");
      setMood(5);
      setEnergy(5);
      setRelationship(5);
      setAchievement(5);
      setEmotions([]);
      setDiaryMode("general");
      setFortuneMissionDone(false);
      setHealthSectionOpen(false);
      setMedicationStatus("");
      setMedicationTimes([]);
      setMedicationName("");
      setMedicationCategory("");
      setMedicationMemo("");
      setMedicationMissedReason("");
      setModeAnswers({
        general: {},
        abc: {},
        guided: {},
        reflection: {},
      });
    } catch (error) {
      console.error(error);
      setSaveStatus("저장 실패: 콘솔을 확인해 주세요.");
    }
  }

  function editJournal(entry: JournalEntry) {
    setEditingJournalId(entry.id);
    setJournalDate(entry.date);
    setMood(entry.mood);
    setEnergy(entry.energy);
    setRelationship(entry.relationship);
    setAchievement(entry.achievement);
    setEmotions(entry.emotions);
    setDiaryMode(entry.mode ?? "general");
    setFortuneMissionDone(Boolean(entry.missionCompleted));
    setHealthSectionOpen(Boolean(entry.medicationRecord));
    setMedicationStatus(entry.medicationRecord?.status ?? "");
    setMedicationTimes(entry.medicationRecord?.times ?? []);
    setMedicationName(entry.medicationRecord?.name ?? "");
    setMedicationCategory(entry.medicationRecord?.category ?? "");
    setMedicationMemo(entry.medicationRecord?.note ?? "");
    setMedicationMissedReason(entry.medicationRecord?.missedReason ?? "");
    setReflection(entry.reflection || entry.text);
    setModeAnswers({
      general: {},
      abc: {},
      guided: {},
      reflection: {},
    });
    setSaveStatus("수정 모드입니다. 내용을 바꾼 뒤 저장해 주세요.");
  }

  function cancelJournalEdit() {
    setEditingJournalId(null);
    setJournalDate(todayInputValue());
    setMood(5);
    setEnergy(5);
    setRelationship(5);
    setAchievement(5);
    setEmotions([]);
    setDiaryMode("general");
    setFortuneMissionDone(false);
    setHealthSectionOpen(false);
    setMedicationStatus("");
    setMedicationTimes([]);
    setMedicationName("");
    setMedicationCategory("");
    setMedicationMemo("");
    setMedicationMissedReason("");
    setReflection("");
    setModeAnswers({
      general: {},
      abc: {},
      guided: {},
      reflection: {},
    });
    setSaveStatus("");
  }

  async function deleteJournal(entry: JournalEntry) {
    const confirmMessage = `정말 삭제할까요?\n${entry.date} 일기`;
    if (!window.confirm(confirmMessage)) return;

    try {
      await deleteDoc(doc(db, "journals", entry.id));
      if (editingJournalId === entry.id) {
        cancelJournalEdit();
      }
      setSaveStatus("일기 삭제 완료");
    } catch (error) {
      console.error(error);
      setSaveStatus("일기 삭제 실패: 콘솔을 확인해 주세요.");
    }
  }

  async function saveChildEntry() {
    if (!uid) {
      setChildSaveStatus("아직 로그인 중이라 저장할 수 없습니다.");
      return;
    }
    if (isGuestUser && !guestSessionId) {
      setChildSaveStatus("게스트 세션을 확인하는 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    if (!childSituation.trim()) {
      setChildSaveStatus("자녀 상황을 먼저 입력해 주세요.");
      return;
    }

    const payload = {
      uid,
      authorLabel: userEmail || uid,
      guestSessionId: isGuestUser ? guestSessionId : null,
      date: childDate,
      childName: childName.trim(),
      situation: childSituation.trim(),
      intervention: childIntervention.trim(),
      outcome: childOutcome.trim(),
      progress: childProgress,
      aiSolution: childAiSolution.trim(),
    };

    try {
      if (editingChildId) {
        await updateDoc(doc(db, "child-workspaces", editingChildId), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
      setChildSaveStatus("육아 일기 수정 완료");
      } else {
        await addDoc(collection(db, "child-workspaces"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        setChildSaveStatus("육아 일기 저장 완료");
      }

      setEditingChildId(null);
      setChildDate(todayInputValue());
      setChildName("");
      setChildSituation("");
      setChildIntervention("");
      setChildOutcome("");
      setChildProgress(5);
      setChildAiSolution("");
    } catch (error) {
      console.error(error);
      setChildSaveStatus("육아 일기 저장 실패: 콘솔을 확인해 주세요.");
    }
  }

  function editChildEntry(entry: ChildEntry) {
    setEditingChildId(entry.id);
    setChildDate(entry.date);
    setChildName(entry.childName);
    setChildSituation(entry.situation);
    setChildIntervention(entry.intervention);
    setChildOutcome(entry.outcome);
    setChildProgress(entry.progress);
    setChildAiSolution(entry.aiSolution);
    setChildSaveStatus("수정 모드입니다. 내용을 바꾼 뒤 저장해 주세요.");
  }

  function cancelChildEdit() {
    setEditingChildId(null);
    setChildDate(todayInputValue());
    setChildName("");
    setChildSituation("");
    setChildIntervention("");
    setChildOutcome("");
    setChildProgress(5);
    setChildAiSolution("");
    setChildSaveStatus("");
  }

  async function deleteChildEntry(entry: ChildEntry) {
    const confirmMessage = `정말 삭제할까요?\n${entry.date} 육아 일기`;
    if (!window.confirm(confirmMessage)) return;

    try {
      await deleteDoc(doc(db, "child-workspaces", entry.id));
      if (editingChildId === entry.id) {
        cancelChildEdit();
      }
      setChildSaveStatus("육아 일기 삭제 완료");
    } catch (error) {
      console.error(error);
      setChildSaveStatus("육아 일기 삭제 실패: 콘솔을 확인해 주세요.");
    }
  }

  async function analyzeDiaryWithAi() {
    if (!diaryAnalysisEntryText.trim()) {
      setWeeklyAiSummary(`${diaryAnalysisRangeLabel} 분석 기간에 일기 데이터가 없어서 분석할 수 없습니다.`);
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
          technique: selectedTechniqueForAnalysis,
          message:
            `아래 ${diaryAnalysisRangeLabel} 일기를 보고 1)감정 흐름 2)스트레스${
              healthSettings.enabled && healthSettings.medicationEnabled && healthSettings.consented
                ? "/투약 관련 패턴"
                : " 패턴"
            } 3)인지 왜곡 가능성 4)다음 실천 3가지를 간단히 정리해줘.\n\n` +
            diaryAnalysisEntryText,
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
      setWeeklyAiSummary(`${diaryAnalysisRangeLabel} AI 분석 중 오류가 발생했습니다.`);
    } finally {
      setAnalyzing(false);
    }
  }

  async function send() {
    if (!intakeCompleted) return;
    if (!uid) return;

    const userText = input.trim();
    if (!userText || loading) return;

    const text = [
      `카테고리: ${selectedTrackInfo.title}`,
      `상담 기법: ${currentTechnique.title}`,
      `기본 정보: 나이 ${intake.age}, 현재 상황 ${intake.currentSituation}, 기간/빈도 ${intake.periodFrequency}, 가장 힘든 점 ${intake.hardestPoint}`,
      `내용: ${userText}`,
    ].join("\n");

    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setLoading(true);

    try {
      if (isGuestUser) {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            riskMessage: userText,
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
        return;
      }

      const targetChatId = activeChatId ?? crypto.randomUUID();
      if (!activeChatId) setActiveChatId(targetChatId);

      await setDoc(
        doc(db, "chats", targetChatId),
        {
          uid,
          track: selectedTrack,
          title: userText.slice(0, 40),
          createdAt: serverTimestamp(),
          lastMessageAt: serverTimestamp(),
        },
        { merge: true }
      );

      await addDoc(collection(db, "chats", targetChatId, "messages"), {
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
          riskMessage: userText,
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

      await addDoc(collection(db, "chats", targetChatId, "messages"), {
        role: "assistant",
        text: reply,
        track: selectedTrack,
        createdAt: serverTimestamp(),
      });
      await setDoc(
        doc(db, "chats", targetChatId),
        {
          lastMessageAt: serverTimestamp(),
          title: userText.slice(0, 40),
        },
        { merge: true }
      );
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
            `다음 내용을 ${currentChildTechnique.title} 방식으로 상담 솔루션으로 정리해줘.`,
            "일반 AI 대화 모드면 상담 프레임 없이 이해하기 쉬운 실천 계획으로 제시해줘.",
            `자녀 이름: ${childName || "(미입력)"}`,
            `상황: ${childSituation}`,
            `부모가 시도한 방법: ${childIntervention || "(미입력)"}`,
            `현재 결과/변화: ${childOutcome || "(미입력)"}`,
          ].join("\n"),
          technique: childTechnique,
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
      setChildAiSolution("육아 일기 솔루션 생성 중 오류가 발생했습니다.");
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
          `나이: ${intake.age}\n현재 상황: ${intake.currentSituation}\n기간/빈도: ${intake.periodFrequency}\n가장 힘든 점: ${intake.hardestPoint}`,
      },
    ]);
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
    setActiveTab("counsel");
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        text: `검사 결과를 상담 워크스페이스로 가져왔어요.\n\n${testResult}`,
      },
    ]);
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
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                placeholder="아이디 (영문/숫자 4~20자)"
                autoComplete="username"
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
                  {authSubmitting ? "처리 중..." : "아이디 로그인"}
                </button>
                <button className="signupBtn" onClick={() => setSignupMode((prev) => !prev)} disabled={authSubmitting}>
                  {signupMode ? "회원가입 닫기" : "회원가입"}
                </button>
              </div>
              {signupMode && (
                <div className="signupPanel">
                  <input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="이름(별명)"
                    autoComplete="nickname"
                  />
                  <input
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder="연락처"
                    autoComplete="tel"
                  />
                  <input
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    placeholder="회원가입 아이디 (영문/숫자 4~20자)"
                    autoComplete="username"
                  />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="회원가입 비밀번호 (6자 이상)"
                    autoComplete="new-password"
                  />
                  <label className="consentRow">
                    <input
                      type="checkbox"
                      checked={signupConsentAdminView}
                      onChange={(e) => setSignupConsentAdminView(e.target.checked)}
                    />
                    <span>관리자 페이지에서 계정(아이디/연락처) 조회에 동의합니다.</span>
                  </label>
                  <button className="primaryBtn" onClick={handleEmailSignup} disabled={authSubmitting}>
                    {authSubmitting ? "처리 중..." : "회원가입 완료"}
                  </button>
                </div>
              )}
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
            <p>
              {isGuestUser ? "게스트 사용자" : userEmail}
              {isDeveloper ? " (개발자 모드: 전체 기록 조회 가능)" : ""}
            </p>
            <button onClick={handleLogout}>로그아웃</button>
          </section>
          {!isGuestUser && (
            <section className="userBar">
              <input
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="계정 삭제 요청 사유 (선택)"
              />
              <button onClick={requestAccountDeletion}>계정 삭제 요청</button>
            </section>
          )}
          {isGuestUser && (
            <section className="userBar">
              <p>게스트 로그인은 기기/세션에 따라 누적 기록이 보장되지 않습니다. 이메일/Google 로그인을 권장합니다.</p>
            </section>
          )}

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
              육아 일기
            </button>
            <button
              className={`tabBtn ${activeTab === "tests" ? "active" : ""}`}
              onClick={() => setActiveTab("tests")}
            >
              검사하기
            </button>
            {isDeveloper && (
              <button
                className={`tabBtn ${activeTab === "admin" ? "active" : ""}`}
                onClick={() => setActiveTab("admin")}
              >
                관리자 페이지
              </button>
            )}
          </section>

          {activeTab === "counsel" && (
            <section className={`counselWorkspace ${isGuestUser ? "guest" : ""}`}>
              {!isGuestUser && (
                <aside className="threadSidebar">
                <div className="threadPanel">
                  <div className="threadPanelHead">
                    <strong>이전 상담 목록</strong>
                    <button className="ghostBtn" onClick={startNewChat}>
                      새 상담
                    </button>
                  </div>
                  <div className="threadList">
                    {chatThreads.length === 0 && <p className="emptyText">저장된 상담이 없습니다.</p>}
                    {chatThreads.map((thread) => (
                      <div key={thread.id} className={`threadItem ${activeChatId === thread.id ? "active" : ""}`}>
                        <button className="threadSelectBtn" onClick={() => setActiveChatId(thread.id)}>
                          <strong>{thread.title || "새 상담"}</strong>
                          <span>{thread.id.slice(0, 8)}</span>
                        </button>
                        <button
                          className="threadDeleteBtn"
                          onClick={() => deleteChatThread(thread.id)}
                          title="상담 삭제"
                        >
                          삭제
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </aside>
              )}

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
                    </div>
                    <button className="primaryBtn" onClick={completeIntake}>
                      기본 정보 입력 완료 후 채팅 시작
                    </button>
                    {intakeError && <p className="statusText">{intakeError}</p>}
                  </div>
                )}

                {intakeCompleted && (
                  <>
                    <div className="chatBox chatViewport">
                      {messages.map((m, i) => (
                        <div key={i} className={`bubble ${m.role}`}>
                          <strong>{m.role === "user" ? "나" : "AI"}</strong>
                          <p>{m.text}</p>
                        </div>
                      ))}
                      <div ref={chatEndRef} />
                    </div>

                    <div className="inputRow chatComposer">
                      <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleCounselInputKeyDown}
                        placeholder="메시지를 입력하세요. Enter 전송, Shift+Enter 줄바꿈"
                        rows={4}
                      />
                      <div className="chatSendRow">
                        <p className="summaryText">
                          {loading ? "응답을 생성하고 있습니다..." : "Enter 또는 전송 버튼으로 보낼 수 있습니다."}
                        </p>
                        <button className="primaryBtn" onClick={send} disabled={loading || !input.trim()}>
                          {loading ? "전송 중..." : "전송"}
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {selectedTrack === "crisis" && (
                  <div className="urgent">위기 상황이면 즉시 1393, 112, 119에 연락하세요.</div>
                )}
              </section>
            </section>
          )}

          {activeTab === "diary" && (
            <section className="diaryLayout">
              <article className="panel full cozyScene" aria-hidden>
                <div className="sceneMoon" />
                <div className="sceneMug" />
                <div className="sceneBook" />
                <p>따뜻한 공간에서 오늘의 마음을 천천히 기록해보세요.</p>
              </article>
              {healthSettingsOpen && (
                <div className="healthModalOverlay">
                  <article className="healthModalSheet">
                    <h3>건강 추적 설정</h3>
                    <label className="checkRow">
                      <input
                        type="checkbox"
                        checked={healthSettings.enabled}
                        onChange={(e) =>
                          setHealthSettings((prev) => ({
                            ...prev,
                            enabled: e.target.checked,
                            medicationEnabled: e.target.checked ? prev.medicationEnabled : false,
                          }))
                        }
                      />
                      건강 추적 기능 사용
                    </label>
                    <label className="checkRow">
                      <input
                        type="checkbox"
                        checked={healthSettings.medicationEnabled}
                        disabled={!healthSettings.enabled}
                        onChange={(e) =>
                          setHealthSettings((prev) => ({
                            ...prev,
                            medicationEnabled: e.target.checked,
                          }))
                        }
                      />
                      투약 추적 사용
                    </label>
                    <div className="healthConsentBox">
                      <p>민감정보 안내: 건강 정보는 AI 분석 보조를 위해 저장되며, 입력은 언제나 선택입니다.</p>
                      <label className="checkRow">
                        <input
                          type="checkbox"
                          checked={healthSettings.consented}
                          onChange={(e) =>
                            setHealthSettings((prev) => ({
                              ...prev,
                              consented: e.target.checked,
                            }))
                          }
                        />
                        민감정보 안내를 확인했고 동의합니다.
                      </label>
                    </div>
                    <div className="cardActions">
                      <button
                        className="primaryBtn"
                        onClick={async () => {
                          try {
                            await saveHealthSettings(healthSettings);
                            setHealthSettingsOpen(false);
                          } catch (error) {
                            console.error(error);
                            setSaveStatus("건강 추적 설정 저장 중 오류가 발생했습니다.");
                          }
                        }}
                      >
                        설정 저장
                      </button>
                      <button className="ghostBtn" onClick={() => setHealthSettingsOpen(false)}>
                        닫기
                      </button>
                    </div>
                  </article>
                </div>
              )}
              <article className="panel diaryWriterPanel">
                <h2>오늘 일기 작성</h2>
                <div className="diaryForm">
                  <div className="modePicker">
                    <span>상담 모드</span>
                    <div className="modeGrid">
                      {diaryModes.map((mode) => (
                        <button
                          key={mode.id}
                          type="button"
                          className={`modeChip ${diaryMode === mode.id ? "active" : ""}`}
                          onClick={() => setDiaryMode(mode.id)}
                        >
                          {mode.title}
                        </button>
                      ))}
                    </div>
                    <p className="summaryText">{currentDiaryMode.description}</p>
                  </div>

                  <label>
                    날짜
                    <input
                      type="date"
                      value={journalDate}
                      onChange={(e) => setJournalDate(e.target.value)}
                    />
                  </label>
                  <div className="healthTopRow">
                    <button type="button" className="ghostBtn" onClick={() => setHealthSettingsOpen(true)}>
                      건강 추적 설정
                    </button>
                    <span className="summaryText">
                      {healthSettings.enabled && healthSettings.medicationEnabled && healthSettings.consented
                        ? "건강 추적 ON"
                        : "건강 추적 OFF"}
                    </span>
                  </div>

                  <div className="fortuneCard">
                    <h3>오늘의 조언</h3>
                    <p>{dailyFortune.fortune}</p>
                    <div className="fortuneMission">
                      <strong>오늘의 미션</strong>
                      <p>{dailyFortune.mission}</p>
                    </div>
                    <div className="cardActions">
                      <button type="button" className="ghostBtn" onClick={addFortuneMissionPrompt}>
                        미션 질문 일기에 넣기
                      </button>
                    </div>
                    <label className="checkRow">
                      <input
                        type="checkbox"
                        checked={fortuneMissionDone}
                        onChange={(e) => setFortuneMissionDone(e.target.checked)}
                      />
                      오늘 미션 완료
                    </label>
                  </div>
                  {healthSettings.enabled &&
                    healthSettings.medicationEnabled &&
                    healthSettings.consented &&
                    (healthSectionOpen ? (
                      <div className="medCard">
                        <div className="medHead">
                          <h3>건강 기록: 투약</h3>
                          <button type="button" className="ghostBtn" onClick={() => setHealthSectionOpen(false)}>
                            접기
                          </button>
                        </div>
                        <label>
                          오늘 복용 상태
                          <select
                            value={medicationStatus}
                            onChange={(e) =>
                              setMedicationStatus(e.target.value as "" | "taken" | "partial" | "skipped")
                            }
                          >
                            <option value="">선택 안 함</option>
                            <option value="taken">잘 복용</option>
                            <option value="partial">일부 놓침</option>
                            <option value="skipped">복용 안 함</option>
                          </select>
                        </label>
                        <div className="timeChipRow">
                          {["아침", "점심", "저녁", "취침 전"].map((time) => (
                            <button
                              key={`med-time-${time}`}
                              type="button"
                              className={`modeChip ${medicationTimes.includes(time) ? "active" : ""}`}
                              onClick={() => toggleMedicationTime(time)}
                            >
                              {time}
                            </button>
                          ))}
                        </div>
                        <label>
                          약 종류(선택)
                          <select value={medicationCategory} onChange={(e) => setMedicationCategory(e.target.value)}>
                            <option value="">선택 안 함</option>
                            <option value="감기약">감기약</option>
                            <option value="진통제">진통제</option>
                            <option value="수면">수면</option>
                            <option value="정신건강">정신건강</option>
                            <option value="소화">소화</option>
                            <option value="기타">기타</option>
                          </select>
                        </label>
                        <label>
                          약 이름(선택)
                          <input
                            value={medicationName}
                            onChange={(e) => setMedicationName(e.target.value)}
                            placeholder="예: OO정 0.5mg"
                          />
                        </label>
                        <label>
                          메모(선택)
                          <input
                            value={medicationMemo}
                            onChange={(e) => setMedicationMemo(e.target.value)}
                            placeholder="복용 후 상태를 짧게 기록"
                          />
                        </label>
                        {(medicationStatus === "partial" || medicationStatus === "skipped") && (
                          <label>
                            복용 누락 이유(선택)
                            <input
                              value={medicationMissedReason}
                              onChange={(e) => setMedicationMissedReason(e.target.value)}
                              placeholder="예: 외출, 깜빡함, 부작용 우려"
                            />
                          </label>
                        )}
                      </div>
                    ) : (
                      <div className="healthAddRow">
                        <button type="button" className="ghostBtn" onClick={() => setHealthSectionOpen(true)}>
                          + 건강 기록 추가
                        </button>
                        <span className="summaryText">필요할 때만 입력하세요. 일기 저장에 필수 아님</span>
                      </div>
                    ))}
                  <label>
                    오늘 전체적인 기분 ({mood}/10)
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={mood}
                      onChange={(e) => setMood(Number(e.target.value))}
                    />
                  </label>

                  <label>
                    오늘의 에너지 상태 ({energy}/10)
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={energy}
                      onChange={(e) => setEnergy(Number(e.target.value))}
                    />
                  </label>

                  <label>
                    사람과의 관계 ({relationship}/10)
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={relationship}
                      onChange={(e) => setRelationship(Number(e.target.value))}
                    />
                  </label>

                  <label>
                    오늘의 성취감 ({achievement}/10)
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={achievement}
                      onChange={(e) => setAchievement(Number(e.target.value))}
                    />
                  </label>

                  <div className="emotionPicker">
                    <span>감정 체크하기 (복수선택)</span>
                    <div className="emotionGrid">
                      {emotionOptions.map((emotion) => {
                        const selected = emotions.includes(emotion);
                        return (
                          <button
                            key={emotion}
                            type="button"
                            className={`emotionChip ${selected ? "active" : ""}`}
                            onClick={() =>
                              setEmotions((prev) =>
                                prev.includes(emotion)
                                  ? prev.filter((item) => item !== emotion)
                                  : [...prev, emotion]
                              )
                            }
                          >
                            {emotion}
                          </button>
                        );
                      })}
                    </div>
                    <p className="liveSummary">{emotionSummary}</p>
                  </div>

                  {diaryMode !== "general" && (
                    <div className="modeGuideCard">
                      <h3>{currentModeGuide.title}</h3>
                      <p>{currentModeGuide.description}</p>
                      <div className="guideSteps">
                        {currentModeGuide.steps.map((step, idx) => (
                          <span key={`${diaryMode}-step-${idx}`}>
                            {idx + 1}. {step}
                          </span>
                        ))}
                      </div>
                      <p className="summaryText">
                        가이드 입력 {modeFilledCount}/{currentModeGuide.fields.length}
                      </p>
                      <div className="modeFieldGrid">
                        {currentModeGuide.fields.map((field) => (
                          <label key={`${diaryMode}-${field.key}`}>
                            {field.label}
                            <textarea
                              value={currentModeAnswers[field.key] ?? ""}
                              onChange={(e) => setModeAnswer(field.key, e.target.value)}
                              placeholder={field.placeholder}
                              rows={2}
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <label>
                    {diaryMode === "general" ? "오늘의 하루에 대한 자기 소감" : "자유 메모 (선택)"}
                    <textarea
                      value={reflection}
                      onChange={(e) => setReflection(e.target.value)}
                      placeholder={currentModeGuide.freePlaceholder}
                      rows={5}
                    />
                  </label>
                  <div className="textMetaRow">
                    <span>글자 수: {reflectionLength}</span>
                    <button
                      type="button"
                      className="ghostBtn"
                      onClick={addReflectionPrompt}
                      disabled={reflectionPromptCount >= REFLECTION_PROMPT_DAILY_LIMIT}
                    >
                      보조 질문 넣기
                    </button>
                  </div>
                  <p className="summaryText">
                    보조 질문 남은 횟수: {Math.max(0, REFLECTION_PROMPT_DAILY_LIMIT - reflectionPromptCount)}/
                    {REFLECTION_PROMPT_DAILY_LIMIT}
                  </p>
                  {reflectionPromptMessage && <p className="summaryText">{reflectionPromptMessage}</p>}
                  <div className="keySentenceBox">
                    <strong>오늘의 핵심 문장</strong>
                    <p>{keySentence || "소감을 입력하면 핵심 문장이 자동 추출됩니다."}</p>
                  </div>
                  <label className="checkRow">
                    <input
                      type="checkbox"
                      checked={liveCommentEnabled}
                      onChange={(e) => setLiveCommentEnabled(e.target.checked)}
                    />
                    입력 중 실시간 AI 코멘트 보기
                  </label>
                  {liveAiComment && <p className="liveComment">{liveAiComment}</p>}

                  <button className="primaryBtn" onClick={saveJournal}>
                    {editingJournalId ? "일기 수정 저장" : "일기 저장"}
                  </button>
                  {editingJournalId && (
                    <button className="ghostBtn" onClick={cancelJournalEdit}>
                      수정 취소
                    </button>
                  )}
                  {saveStatus && <p className="statusText">{saveStatus}</p>}
                </div>
                <div className="diaryDashboard">
                  <div className="metricCard">
                    <h3>오늘 종합 점수</h3>
                    <div className="gaugeWrap">
                      <svg viewBox="0 0 120 120" className="gaugeSvg" role="img" aria-label="오늘 종합 점수">
                        <circle cx="60" cy="60" r="48" className="gaugeTrack" />
                        <circle
                          cx="60"
                          cy="60"
                          r="48"
                          className="gaugeValue"
                          style={{ strokeDasharray: `${Math.round((todayCompositeScore / 100) * 302)} 302` }}
                        />
                      </svg>
                      <div className="gaugeCenter">
                        <strong>{todayCompositeScore}</strong>
                        <span>{todayCompositeMood}/10</span>
                      </div>
                    </div>
                  </div>
                  <div className="metricCard">
                    <h3>감정 분포</h3>
                    <div className="donutWrap">
                      <div className="donutChart" style={{ backgroundImage: emotionDonut.gradient }} />
                      <div className="donutLegend">
                        {emotionDonut.labels.map((item) => (
                          <p key={item.key}>
                            <span className="legendDot" style={{ background: item.color }} />
                            {item.key} {item.value}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </article>

              <article className="panel diaryCalendarPanel">
                <h2>일기 달력</h2>
                <div className="calendarHead">
                  <button
                    className="ghostBtn"
                    onClick={() =>
                      setDiaryAnalysisMonth(
                        (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
                      )
                    }
                  >
                    이전 달
                  </button>
                  <strong>
                    {diaryAnalysisMonth.getFullYear()}년 {diaryAnalysisMonth.getMonth() + 1}월
                  </strong>
                  <button
                    className="ghostBtn"
                    onClick={() =>
                      setDiaryAnalysisMonth(
                        (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
                      )
                    }
                  >
                    다음 달
                  </button>
                </div>
                <div className="calendarWeekdays">
                  {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
                    <span key={day}>{day}</span>
                  ))}
                </div>
                <div className="calendarGrid">
                  {diaryMonthDays.map((cell, idx) => {
                    if (!cell.date) {
                      return <div key={`empty-${idx}`} className="calendarCell empty" />;
                    }

                    return (
                      <button
                        key={cell.date}
                        type="button"
                        className={`calendarCell ${cell.hasEntry ? "done" : "todo"} ${
                          cell.isFuture ? "future" : ""
                        } ${cell.hasEntry ? `heat-${cell.heatTone}` : ""}`}
                        onClick={() => setJournalDate(cell.date)}
                      >
                        <strong>{cell.day}</strong>
                        <span>
                          {cell.isFuture ? "-" : cell.hasEntry ? "작성" : "미작성"}
                        </span>
                        {cell.hasEntry && <em>{cell.avgMood}/10</em>}
                        {cell.hasMedication && <i className="medDot" aria-hidden />}
                      </button>
                    );
                  })}
                </div>
                <div className="heatLegend">
                  <span>
                    <i className="legendSwatch heat-good" />
                    7 이상
                  </span>
                  <span>
                    <i className="legendSwatch heat-mid" />
                    4~6
                  </span>
                  <span>
                    <i className="legendSwatch heat-low" />
                    3 이하
                  </span>
                  <span>
                    <i className="medDot" />
                    투약 기록 있음
                  </span>
                </div>
                <p className="summaryText">
                  달력 날짜를 누르면 작성 날짜가 자동 선택됩니다.
                </p>
                <div className="quickTrendRow">
                  <span>기록일 {weeklyStats.daysWithEntry}일</span>
                  <span>평균 {weeklyStats.average ?? "-"}</span>
                  <span>추세 {weeklyStats.trend}</span>
                </div>
                <div className="dayEntryList">
                  <div className="panelHeadRow">
                    <h3>{journalDate} 작성 일기</h3>
                    <button className="ghostBtn" onClick={() => setDiaryDayListOpen((prev) => !prev)}>
                      {diaryDayListOpen ? "접기" : "펼치기"}
                    </button>
                  </div>
                  {diaryDayListOpen && (
                    <>
                      {selectedDiaryEntries.length === 0 && (
                        <p className="emptyText">선택한 날짜에 작성한 일기가 없습니다.</p>
                      )}
                      {selectedDiaryEntries.map((entry) => (
                        <div key={`day-diary-${entry.id}`} className="dayEntryCard">
                          {entry.fortuneText && <p className="summaryText">조언: {entry.fortuneText}</p>}
                          {entry.missionText && (
                            <p className="summaryText">
                              미션: {entry.missionText} {entry.missionCompleted ? "✅" : "⬜"}
                            </p>
                          )}
                          {entry.medicationRecord && (
                            <p className="summaryText">
                              투약 기록: {entry.medicationRecord.status}
                              {entry.medicationRecord.times.length
                                ? ` · ${entry.medicationRecord.times.join("/")}`
                                : ""}
                              {entry.medicationRecord.name ? ` · ${entry.medicationRecord.name}` : ""}
                              {entry.medicationRecord.category ? ` · ${entry.medicationRecord.category}` : ""}
                            </p>
                          )}
                          <p className="summaryText">
                            모드: {diaryModes.find((mode) => mode.id === (entry.mode ?? "general"))?.title ?? "일반 일기 모드"}
                          </p>
                          {isDeveloper && <p className="summaryText">작성자: {entry.authorLabel || entry.uid}</p>}
                          <p className="summaryText">
                            기분 {entry.mood}/10 · 에너지 {entry.energy}/10 · 관계 {entry.relationship}/10 · 성취{" "}
                            {entry.achievement}/10
                          </p>
                          <p className="summaryText">감정: {entry.emotions.join(", ") || "(선택 없음)"}</p>
                          <p>{entry.reflection || entry.text || "(내용 없음)"}</p>
                          <div className="cardActions">
                            <button className="ghostBtn" onClick={() => editJournal(entry)}>
                              수정
                            </button>
                            <button className="ghostBtn dangerBtn" onClick={() => deleteJournal(entry)}>
                              삭제
                            </button>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </article>

              <article className="panel">
                <h2>전문가에게 요청하기</h2>
                <div className="diaryForm">
                  <label>
                    요청 카테고리
                    <select value={expertCategory} onChange={(e) => setExpertCategory(e.target.value)}>
                      <option value="일기 피드백">일기 피드백</option>
                      <option value="감정 조절">감정 조절</option>
                      <option value="관계 고민">관계 고민</option>
                      <option value="육아 고민">육아 고민</option>
                      <option value="기타">기타</option>
                    </select>
                  </label>
                  <label>
                    요청 내용
                    <textarea
                      value={expertRequestText}
                      onChange={(e) => setExpertRequestText(e.target.value)}
                      placeholder="관리자(전문가)에게 받고 싶은 조언을 구체적으로 적어주세요."
                      rows={4}
                    />
                  </label>
                  <button className="primaryBtn" onClick={submitExpertRequest}>
                    요청 등록
                  </button>
                </div>
                <div className="dayEntryList">
                  <h3>내 요청 목록</h3>
                  {expertRequests.length === 0 && <p className="emptyText">등록된 요청이 없습니다.</p>}
                  {expertRequests.map((request) => (
                    <div key={`expert-request-${request.id}`} className="dayEntryCard">
                      <p className="summaryText">
                        [{request.category}] 상태: {request.status === "answered" ? "답변 완료" : "답변 대기"}
                      </p>
                      <p>{request.requestText}</p>
                      {request.advisorReply ? (
                        <div className="solutionBox">
                          <h4>관리자 조언</h4>
                          <p>{request.advisorReply}</p>
                        </div>
                      ) : (
                        <p className="summaryText">아직 관리자 조언이 등록되지 않았습니다.</p>
                      )}
                    </div>
                  ))}
                </div>
              </article>

              {isDeveloper && (
                <article className="panel full">
                  <h2>개발자 모드: 작성자별 활동 분석</h2>
                  <p className="summaryText">
                    작성자 ID 목록에서 선택하면 해당 사용자의 활동을 날짜별로 정리해서 볼 수 있습니다.
                  </p>
                  <div className="authorCatalog">
                    <div className="authorCatalogHead">
                      <span>작성자</span>
                      <span>UID</span>
                      <span>일기</span>
                      <span>육아일기</span>
                      <span>최근 활동</span>
                    </div>
                    {developerAuthors.map((author) => (
                      <button
                        key={`catalog-${author.key}`}
                        className={`authorCatalogRow ${developerAuthorFilter === author.key ? "active" : ""}`}
                        onClick={() => setDeveloperAuthorFilter(author.key)}
                      >
                        <span>{author.label}</span>
                        <span className="monoText">{author.uid}</span>
                        <span>{author.diary}</span>
                        <span>{author.child}</span>
                        <span>{author.lastDate}</span>
                      </button>
                    ))}
                  </div>
                  <div className="authorFilterRow">
                    <button
                      className={`authorChip ${developerAuthorFilter === "all" ? "active" : ""}`}
                      onClick={() => setDeveloperAuthorFilter("all")}
                    >
                      전체 ({journalList.length + childList.length})
                    </button>
                    {developerAuthors.map((author) => (
                      <button
                        key={author.key}
                        className={`authorChip ${developerAuthorFilter === author.key ? "active" : ""}`}
                        onClick={() => setDeveloperAuthorFilter(author.key)}
                      >
                        {author.label} ({author.diary + author.child}) · ID:{author.uid}
                      </button>
                    ))}
                  </div>

                  <div className="developerActivityGrid">
                    <div className="developerColumn">
                      <h3>일기 활동 ({filteredJournalEntries.length})</h3>
                      {groupedDiaryByDate.length === 0 && (
                        <p className="emptyText">해당 작성자의 일기 기록이 없습니다.</p>
                      )}
                      {groupedDiaryByDate.map((group) => (
                        <div key={`diary-date-${group.date}`} className="dateGroup">
                          <h4>
                            {group.date} ({group.items.length})
                          </h4>
                          {group.items.map((entry) => (
                            <div key={`dev-diary-${entry.id}`} className="developerItem">
                              <p className="summaryText">
                                작성자: {entry.authorLabel || entry.uid} · ID: {entry.uid}
                              </p>
                              <p className="summaryText">
                                기분 {entry.mood}/10 · 에너지 {entry.energy}/10 · 관계 {entry.relationship}/10 · 성취{" "}
                                {entry.achievement}/10
                              </p>
                              <p className="summaryText">감정: {entry.emotions.join(", ") || "(선택 없음)"}</p>
                              <p>{entry.reflection || entry.text || "(내용 없음)"}</p>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>

                    <div className="developerColumn">
                      <h3>육아 일기 활동 ({filteredChildEntries.length})</h3>
                      {groupedChildByDate.length === 0 && (
                        <p className="emptyText">해당 작성자의 육아 일기 기록이 없습니다.</p>
                      )}
                      {groupedChildByDate.map((group) => (
                        <div key={`child-date-${group.date}`} className="dateGroup">
                          <h4>
                            {group.date} ({group.items.length})
                          </h4>
                          {group.items.map((entry) => (
                            <div key={`dev-child-${entry.id}`} className="developerItem">
                              <p className="summaryText">
                                작성자: {entry.authorLabel || entry.uid} · ID: {entry.uid}
                              </p>
                              <p className="summaryText">
                                자녀: {entry.childName || "(미입력)"} · 변화 {entry.progress}/10
                              </p>
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
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>

                  <h3>통합 활동 타임라인 ({combinedDeveloperActivities.length})</h3>
                  <div className="developerTimeline">
                    {groupedCombinedByDate.length === 0 && (
                      <p className="emptyText">표시할 활동이 없습니다.</p>
                    )}
                    {groupedCombinedByDate.map((group) => (
                      <div key={`timeline-${group.date}`} className="dateGroup">
                        <h4>
                          {group.date} ({group.items.length})
                        </h4>
                        {group.items.map((activity) => (
                          <div key={`${activity.type}-${activity.id}`} className="developerItem">
                            <p className="summaryText">{activity.author}</p>
                            <p className="summaryText">
                              <span className="typeBadge">{activity.type}</span> {activity.summary}
                            </p>
                            <p>{activity.detail}</p>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </article>
              )}

              <article className="panel">
                <h2>최근 7일 감정 추이</h2>
                <p className="summaryText">
                  기록일 {weeklyStats.daysWithEntry}일 / 평균 점수 {weeklyStats.average ?? "-"} / 추세 {weeklyStats.trend}
                </p>
                <div className="lineChartWrap">
                  <svg
                    viewBox={`0 0 ${weeklyLineMeta.width} ${weeklyLineMeta.height + 34}`}
                    className="lineChart"
                    role="img"
                    aria-label="최근 7일 감정 라인 차트"
                  >
                    {[0, 1, 2, 3, 4].map((grid) => {
                      const y = Math.round((weeklyLineMeta.height / 4) * grid);
                      return (
                        <line
                          key={`grid-${grid}`}
                          x1="0"
                          x2={weeklyLineMeta.width}
                          y1={y}
                          y2={y}
                          className="lineGrid"
                        />
                      );
                    })}
                    {weeklyLineMeta.linePoints && (
                      <polyline
                        points={weeklyLineMeta.linePoints}
                        className={`linePath ${weeklyStats.delta >= 0 ? "up" : "down"}`}
                      />
                    )}
                    {weeklyPoints.map((point, index) => {
                      const y = weeklyLineMeta.ys[index];
                      if (y === null) return null;
                      return (
                        <circle
                          key={`point-${point.date}`}
                          cx={weeklyLineMeta.xs[index]}
                          cy={y}
                          r="4"
                          className={`linePoint ${point.mood !== null && point.mood <= 3 ? "risk" : "normal"}`}
                        />
                      );
                    })}
                    {weeklyPoints.map((point, index) => (
                      <g key={`label-${point.date}`}>
                        <text x={weeklyLineMeta.xs[index]} y={weeklyLineMeta.height + 22} className="lineLabel">
                          {point.label}
                        </text>
                        {point.hasMedication && (
                          <circle cx={weeklyLineMeta.xs[index]} cy={weeklyLineMeta.height + 30} r="2.6" className="medLineDot" />
                        )}
                      </g>
                    ))}
                  </svg>
                </div>
                <div className="insightGrid">
                  <div className="insightChip">연속 기록 {diaryInsights.streak}일</div>
                  <div className="insightChip">이번 달 가장 힘들었던 날: {diaryInsights.toughestDay}</div>
                  <div className="insightChip">이번 달 가장 안정적이었던 날: {diaryInsights.strongestDay}</div>
                </div>
              </article>

              <article className="panel">
                <div className="analysisHeadRow">
                  <h2>AI 분석</h2>
                  <button className="ghostBtn" onClick={() => setAnalysisPanelOpen((prev) => !prev)}>
                    {analysisPanelOpen ? "접기" : "열기"}
                  </button>
                </div>
                {!analysisPanelOpen && (
                  <p className="summaryText">분석이 필요할 때만 열어서 기간을 설정하고 실행할 수 있습니다.</p>
                )}
                {analysisPanelOpen && (
                  <>
                    <div className="techniqueCard">
                      <label htmlFor="diary-technique-select">일기 분석 상담기법 선택</label>
                      <select
                        id="diary-technique-select"
                        value={selectedTechniqueForAnalysis}
                        onChange={(e) => setSelectedTechniqueForAnalysis(e.target.value as TechniqueId)}
                      >
                        {techniques.map((technique) => (
                          <option key={technique.id} value={technique.id}>
                            {technique.title}
                          </option>
                        ))}
                      </select>
                      <p>{currentDiaryTechnique.description}</p>
                    </div>
                    <div className="analysisRangeCard">
                      <label htmlFor="diary-analysis-range">분석 기간</label>
                      <select
                        id="diary-analysis-range"
                        value={diaryAnalysisRange}
                        onChange={(e) =>
                          setDiaryAnalysisRange(e.target.value as "weekly" | "monthly" | "custom")
                        }
                      >
                        <option value="weekly">주간 (기본)</option>
                        <option value="monthly">월간 (달력 선택 월)</option>
                        <option value="custom">기간 직접 설정</option>
                      </select>
                      {diaryAnalysisRange === "custom" && (
                        <div className="analysisRangeInputs">
                          <label>
                            시작일
                            <input
                              type="date"
                              value={diaryAnalysisStartDate}
                              onChange={(e) => setDiaryAnalysisStartDate(e.target.value)}
                            />
                          </label>
                          <label>
                            종료일
                            <input
                              type="date"
                              value={diaryAnalysisEndDate}
                              onChange={(e) => setDiaryAnalysisEndDate(e.target.value)}
                            />
                          </label>
                        </div>
                      )}
                      <p className="summaryText">
                        선택 범위: {diaryAnalysisBounds.start} ~ {diaryAnalysisBounds.end} / 기록 {diaryAnalysisEntries.length}건
                      </p>
                    </div>
                    <button className="primaryBtn" onClick={analyzeDiaryWithAi} disabled={analyzing}>
                      {analyzing ? "분석 중" : `${diaryAnalysisRangeLabel} 일기 분석하기`}
                    </button>
                    {weeklyAnalysisCards.length > 0 && (
                      <div className="analysisCards">
                        {weeklyAnalysisCards.map((card) => (
                          <div key={card.title} className="analysisCard">
                            <h3>{card.title}</h3>
                            <p>{card.body}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="fortuneWeeklyCard">
                      <h3>조언 vs 실제 기록 리포트 (최근 7일)</h3>
                      <p>{weeklyFortuneReport}</p>
                    </div>
                    {medicationPatternSummary && (
                      <div className="fortuneWeeklyCard">
                        <h3>투약 패턴 요약</h3>
                        <p>{medicationPatternSummary}</p>
                      </div>
                    )}
                    <pre className="analysisBox">{weeklyAiSummary || "아직 분석 결과가 없습니다."}</pre>
                  </>
                )}
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
                <h2>육아 일기 워크스페이스</h2>
                <div className="diaryForm">
                  <div className="techniqueCard">
                    <label htmlFor="child-technique-select">육아 일기 AI 도움 방식</label>
                    <select
                      id="child-technique-select"
                      value={childTechnique}
                      onChange={(e) => setChildTechnique(e.target.value as TechniqueId)}
                    >
                      {techniques.map((technique) => (
                        <option key={technique.id} value={technique.id}>
                          {technique.title}
                        </option>
                      ))}
                    </select>
                    <p>{currentChildTechnique.description}</p>
                  </div>

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
                    {editingChildId ? "육아 일기 수정 저장" : "육아 일기 저장"}
                  </button>
                  {editingChildId && (
                    <button className="ghostBtn" onClick={cancelChildEdit}>
                      수정 취소
                    </button>
                  )}
                  {childSaveStatus && <p className="statusText">{childSaveStatus}</p>}
                </div>
              </article>

              <article className="panel">
                <h2>육아 일기 달력</h2>
                <div className="calendarHead">
                  <button
                    className="ghostBtn"
                    onClick={() =>
                      setChildAnalysisMonth(
                        (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
                      )
                    }
                  >
                    이전 달
                  </button>
                  <strong>
                    {childAnalysisMonth.getFullYear()}년 {childAnalysisMonth.getMonth() + 1}월
                  </strong>
                  <button
                    className="ghostBtn"
                    onClick={() =>
                      setChildAnalysisMonth(
                        (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
                      )
                    }
                  >
                    다음 달
                  </button>
                </div>
                <div className="calendarWeekdays">
                  {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
                    <span key={`child-week-${day}`}>{day}</span>
                  ))}
                </div>
                <div className="calendarGrid">
                  {childMonthDays.map((cell, idx) => {
                    if (!cell.date) {
                      return <div key={`child-empty-${idx}`} className="calendarCell empty" />;
                    }
                    return (
                      <button
                        key={`child-day-${cell.date}`}
                        type="button"
                        className={`calendarCell ${cell.hasEntry ? "done" : "todo"} ${
                          cell.isFuture ? "future" : ""
                        } ${cell.hasEntry ? `heat-${cell.heatTone}` : ""}`}
                        onClick={() => setChildDate(cell.date)}
                      >
                        <strong>{cell.day}</strong>
                        <span>{cell.isFuture ? "-" : cell.hasEntry ? "작성" : "미작성"}</span>
                        {cell.hasEntry && <em>{cell.avgScore}/10</em>}
                      </button>
                    );
                  })}
                </div>
                <p className="summaryText">달력 날짜를 누르면 해당 날짜의 육아 일기를 바로 볼 수 있습니다.</p>
                <div className="dayEntryList">
                  <h3>{childDate} 작성 육아 일기</h3>
                  {selectedChildEntries.length === 0 && (
                    <p className="emptyText">선택한 날짜에 작성한 육아 일기가 없습니다.</p>
                  )}
                  {selectedChildEntries.map((entry) => (
                    <div key={`day-child-${entry.id}`} className="dayEntryCard">
                      <p className="summaryText">
                        자녀: {entry.childName || "(미입력)"} · 변화 점수 {entry.progress}/10
                      </p>
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
                    </div>
                  ))}
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
                <h2>아이 변화 타임라인</h2>
                <p className="summaryText">
                  과거부터 현재까지 변화 흐름과 지도 솔루션을 날짜 순으로 확인할 수 있습니다.
                </p>
                <div className="childTimeline">
                  {childTimelineEntries.length === 0 && (
                    <p className="emptyText">아직 타임라인에 표시할 육아 일기 기록이 없습니다.</p>
                  )}
                  {childTimelineEntries.map((entry) => {
                    const tags = childSignalTags(entry);
                    return (
                      <div key={`timeline-${entry.id}`} className="timelineRow">
                        <div className="timelineDate">
                          <strong>{entry.date}</strong>
                          <span>{entry.childName || "자녀 이름 미입력"}</span>
                        </div>
                        <div className="timelineBody">
                          <div className="signalRow">
                            {tags.map((tag, idx) => (
                              <span key={`${entry.id}-tag-${idx}`} className={`signalBadge ${tag.tone}`}>
                                {tag.label}
                              </span>
                            ))}
                          </div>
                          <p>
                            <strong>상황:</strong> {renderHighlightedText(entry.situation)}
                          </p>
                          <p>
                            <strong>시도:</strong> {renderHighlightedText(entry.intervention)}
                          </p>
                          <p>
                            <strong>결과:</strong> {renderHighlightedText(entry.outcome)}
                          </p>
                          <p className="summaryText">변화 점수: {entry.progress}/10</p>
                          <div className="solutionBox">
                            <h4>AI 지도 솔루션</h4>
                            <p>{entry.aiSolution.trim() || "아직 지도 솔루션이 없습니다."}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>

              <article className="panel full">
                <h2>육아 일기 기록</h2>
                <div className="journalList">
                  {latestChildEntries.length === 0 && <p className="emptyText">저장된 육아 일기 기록이 없습니다.</p>}
                  {latestChildEntries.map((entry) => (
                    <div key={entry.id} className="journalCard">
                      <div className="journalMeta">
                        <strong>
                          {entry.date} {entry.childName ? `· ${entry.childName}` : ""}
                        </strong>
                        <span>변화 {entry.progress}/10</span>
                      </div>
                      {isDeveloper && <p className="summaryText">작성자: {entry.authorLabel || entry.uid}</p>}
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
                      <div className="cardActions">
                        <button className="ghostBtn" onClick={() => editChildEntry(entry)}>
                          수정
                        </button>
                        <button className="ghostBtn dangerBtn" onClick={() => deleteChildEntry(entry)}>
                          삭제
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              {isDeveloper && (
                <article className="panel full">
                  <h2>개발자 모드: 작성자별 육아 일기 빠른 보기</h2>
                  <p className="summaryText">
                    같은 작성자 필터를 적용해 육아 일기 활동만 빠르게 확인할 수 있습니다.
                  </p>
                  <div className="authorFilterRow">
                    <button
                      className={`authorChip ${developerAuthorFilter === "all" ? "active" : ""}`}
                      onClick={() => setDeveloperAuthorFilter("all")}
                    >
                      전체 ({childList.length})
                    </button>
                    {developerAuthors
                      .filter((author) => author.child > 0)
                      .map((author) => (
                        <button
                          key={`child-author-${author.key}`}
                          className={`authorChip ${developerAuthorFilter === author.key ? "active" : ""}`}
                          onClick={() => setDeveloperAuthorFilter(author.key)}
                        >
                          {author.label} ({author.child}) · ID:{author.uid}
                        </button>
                      ))}
                  </div>
                  <div className="developerTimeline">
                    {groupedChildByDate.length === 0 && (
                      <p className="emptyText">표시할 육아 일기 활동이 없습니다.</p>
                    )}
                    {groupedChildByDate.map((group) => (
                      <div key={`quick-child-${group.date}`} className="dateGroup">
                        <h4>
                          {group.date} ({group.items.length})
                        </h4>
                        {group.items.map((entry) => (
                          <div key={`child-quick-${entry.id}`} className="developerItem">
                            <p className="summaryText">
                              작성자: {entry.authorLabel || entry.uid} · ID: {entry.uid}
                            </p>
                            <p className="summaryText">
                              <span className="typeBadge">육아일기</span> {entry.childName || "(자녀 미입력)"} · 변화{" "}
                              {entry.progress}/10
                            </p>
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
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </article>
              )}
            </section>
          )}

          {activeTab === "admin" && isDeveloper && (
            <section className="testLayout">
              <article className="panel full">
                <h2>관리자 페이지</h2>
                <p className="summaryText">
                  동의한 이용자의 계정 정보와 삭제 요청을 관리할 수 있습니다. 비밀번호는 Firebase 보안 정책상 조회할 수 없습니다.
                </p>
                <div className="adminGrid">
                  <div className="adminCard">
                    <h3>동의 사용자 목록 ({adminUsers.length})</h3>
                    {adminUsers.length === 0 && <p className="emptyText">동의한 사용자가 없습니다.</p>}
                    {adminUsers.map((profile) => (
                      <div key={`admin-user-${profile.uid}`} className="developerItem">
                        <p className="summaryText">
                          <strong>{profile.nickname || "(이름 없음)"}</strong> · {profile.accountId || "(아이디 없음)"}
                        </p>
                        <p className="summaryText monoText">UID: {profile.uid}</p>
                        <p className="summaryText">연락처: {profile.contact || "(미입력)"}</p>
                        <p className="summaryText">
                          계정 상태: {profile.disabled ? "삭제 처리됨(로그인 차단)" : "사용 중"}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="adminCard">
                    <h3>계정 삭제 요청 ({deleteRequests.length})</h3>
                    {deleteRequests.length === 0 && <p className="emptyText">삭제 요청이 없습니다.</p>}
                    {deleteRequests.map((req) => (
                      <div key={`delete-req-${req.uid}`} className="developerItem">
                        <p className="summaryText">
                          <strong>{req.nickname || "(이름 없음)"}</strong> · {req.accountId || "(아이디 없음)"}
                        </p>
                        <p className="summaryText monoText">UID: {req.uid}</p>
                        <p className="summaryText">사유: {req.reason || "(사유 없음)"}</p>
                        <p className="summaryText">상태: {req.status === "pending" ? "대기" : "처리 완료"}</p>
                        {req.status === "pending" && (
                          <button
                            className="ghostBtn dangerBtn"
                            onClick={() => processDeleteRequest(req.uid)}
                            disabled={deletingUid === req.uid}
                          >
                            {deletingUid === req.uid ? "처리 중..." : "삭제 요청 처리"}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="adminCard">
                    <h3>전문가 요청 관리 ({expertRequests.length})</h3>
                    {expertRequests.length === 0 && <p className="emptyText">등록된 전문가 요청이 없습니다.</p>}
                    {expertRequests.map((request) => (
                      <div key={`admin-expert-${request.id}`} className="developerItem">
                        <p className="summaryText">
                          <strong>{request.authorLabel || request.uid}</strong> · [{request.category}] ·{" "}
                          {request.status === "answered" ? "답변 완료" : "답변 대기"}
                        </p>
                        <p className="summaryText monoText">UID: {request.uid || "-"}</p>
                        <p>{request.requestText}</p>
                        {request.advisorReply && (
                          <div className="solutionBox">
                            <h4>등록된 조언</h4>
                            <p>{request.advisorReply}</p>
                          </div>
                        )}
                        <label>
                          관리자 조언
                          <textarea
                            value={replyDrafts[request.id] ?? ""}
                            onChange={(e) =>
                              setReplyDrafts((prev) => ({ ...prev, [request.id]: e.target.value }))
                            }
                            placeholder="요청자에게 전달할 조언을 입력하세요."
                            rows={3}
                          />
                        </label>
                        <button className="ghostBtn" onClick={() => saveExpertReply(request)}>
                          조언 저장
                        </button>
                      </div>
                    ))}
                  </div>
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
                상담 워크스페이스로 가져오기
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

        .signupPanel {
          border: 1px solid #ecd7c8;
          border-radius: 12px;
          background: #fff8f1;
          padding: 10px;
          display: grid;
          gap: 8px;
        }

        .consentRow {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.84rem;
          color: #6e5448;
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

        .userBar input {
          flex: 1;
          min-width: 180px;
          border: 1px solid #e7d5c7;
          border-radius: 10px;
          padding: 8px 10px;
          background: #fffdfb;
          color: #4a372f;
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
          background: linear-gradient(180deg, #fffdfa 0%, #fff8f2 100%);
          border: 1px solid #f1ddcf;
          border-radius: 24px;
          padding: 16px;
          box-shadow: 0 12px 34px rgba(135, 97, 73, 0.12);
          animation: rise 0.55s ease-out;
        }

        .counselWorkspace {
          max-width: 1100px;
          margin: 14px auto 0;
          display: grid;
          grid-template-columns: 280px 1fr;
          gap: 14px;
          align-items: start;
        }

        .counselWorkspace.guest {
          grid-template-columns: 1fr;
        }

        .threadSidebar {
          position: sticky;
          top: 12px;
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

        .threadPanel {
          border: 1px solid #efdacc;
          border-radius: 14px;
          background: #fffaf5;
          padding: 10px;
          display: grid;
          gap: 8px;
        }

        .threadPanelHead {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .threadPanelHead strong {
          color: #62483c;
          font-size: 0.9rem;
        }

        .threadList {
          display: grid;
          gap: 6px;
          max-height: 180px;
          overflow-y: auto;
        }

        .threadItem {
          border: 1px solid #ead6c8;
          border-radius: 10px;
          background: #fffdfb;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          padding: 6px;
        }

        .threadItem.active {
          background: #ffe8d6;
          border-color: #f1c6a8;
        }

        .threadSelectBtn {
          border: 0;
          background: transparent;
          color: #6d5247;
          text-align: left;
          padding: 4px;
          display: grid;
          gap: 2px;
          min-width: 0;
          flex: 1;
          cursor: pointer;
        }

        .threadSelectBtn strong {
          font-size: 0.86rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .threadSelectBtn span {
          font-size: 0.74rem;
          color: #8a6a5a;
          font-family: "Fira Mono", var(--font-geist-mono), monospace;
        }

        .threadDeleteBtn {
          border: 1px solid #efc5ba;
          background: #fdece8;
          color: #973f37;
          border-radius: 8px;
          padding: 5px 7px;
          font-size: 0.74rem;
          font-weight: 700;
          cursor: pointer;
          flex-shrink: 0;
        }

        .chatSendRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
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

        .analysisHeadRow {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }

        .analysisRangeCard {
          margin-top: 10px;
          border: 1px solid #edd8c9;
          border-radius: 14px;
          padding: 10px 12px;
          background: #fff8f1;
          display: grid;
          gap: 6px;
        }

        .analysisRangeCard label {
          display: grid;
          gap: 6px;
          font-size: 0.86rem;
          color: #6f5348;
          font-weight: 700;
        }

        .analysisRangeCard select,
        .analysisRangeCard input {
          border: 1px solid #e7d5c7;
          border-radius: 10px;
          padding: 9px 10px;
          background: #fffdfb;
          color: #4a372f;
        }

        .analysisRangeInputs {
          margin-top: 6px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
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
          align-items: start;
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

        .adminGrid {
          margin-top: 10px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .adminCard {
          border: 1px solid #ecd9cb;
          border-radius: 14px;
          background: #fffdfb;
          padding: 10px;
          display: grid;
          gap: 8px;
          max-height: 520px;
          overflow-y: auto;
        }

        .adminCard h3 {
          margin: 0;
          color: #62473c;
          font-size: 0.94rem;
        }

        .adminCard label {
          display: grid;
          gap: 6px;
          font-size: 0.82rem;
          color: #6d5348;
        }

        .adminCard textarea {
          width: 100%;
          border: 1px solid #e8d5c8;
          border-radius: 10px;
          padding: 8px 10px;
          background: #fffdfb;
          color: #4a372f;
          font-size: 0.84rem;
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

        .modePicker {
          border: 1px solid #ead7ca;
          border-radius: 12px;
          background: #fff9f4;
          padding: 10px;
          display: grid;
          gap: 8px;
        }

        .fortuneCard {
          border: 1px solid #edd3bf;
          border-radius: 14px;
          background: linear-gradient(180deg, #fff8ef 0%, #fff2e5 100%);
          padding: 10px;
          display: grid;
          gap: 8px;
        }

        .fortuneCard h3 {
          margin: 0;
          color: #724d3a;
          font-size: 0.92rem;
        }

        .fortuneCard p {
          margin: 0;
          color: #6c4e41;
          font-size: 0.84rem;
          line-height: 1.45;
        }

        .fortuneMission {
          border: 1px dashed #e7c2a6;
          border-radius: 10px;
          background: #fff8f2;
          padding: 8px 9px;
        }

        .fortuneMission strong {
          color: #6d4835;
          font-size: 0.82rem;
        }

        .medCard {
          border: 1px solid #ead7ca;
          border-radius: 14px;
          background: #fffdfb;
          padding: 10px;
          display: grid;
          gap: 8px;
        }

        .healthTopRow {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
        }

        .healthAddRow {
          border: 1px dashed #ebd5c6;
          border-radius: 10px;
          background: #fffaf6;
          padding: 8px 10px;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
        }

        .medCard h3 {
          margin: 0;
          color: #66493d;
          font-size: 0.9rem;
        }

        .medHead {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
        }

        .medCard select,
        .medCard input {
          border: 1px solid #e8d5c8;
          border-radius: 10px;
          padding: 9px 10px;
          background: #fffdfb;
          color: #4a372f;
          font-size: 0.85rem;
        }

        .timeChipRow {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
        }

        .healthModalOverlay {
          position: fixed;
          inset: 0;
          z-index: 80;
          background: rgba(36, 22, 14, 0.5);
          display: grid;
          place-items: center;
          padding: 14px;
        }

        .healthModalSheet {
          width: min(520px, 100%);
          border: 1px solid #ead7c8;
          border-radius: 16px;
          background: #fffaf6;
          padding: 14px;
          display: grid;
          gap: 10px;
        }

        .healthModalSheet h3 {
          margin: 0;
          color: #65483d;
          font-size: 1rem;
        }

        .healthConsentBox {
          border: 1px dashed #e6cab8;
          border-radius: 10px;
          background: #fff6ef;
          padding: 8px 9px;
        }

        .healthConsentBox p {
          margin: 0 0 6px;
          color: #704f41;
          font-size: 0.82rem;
          line-height: 1.4;
        }

        .medDot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #7fa05e;
          margin-top: 2px;
        }

        .medLineDot {
          fill: #7fa05e;
        }

        .modeGrid {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .modeChip {
          border: 1px solid #e5cdbd;
          background: #fffdfb;
          color: #6a4f43;
          border-radius: 999px;
          padding: 7px 11px;
          font-size: 0.82rem;
          cursor: pointer;
        }

        .modeChip.active {
          background: #ffdec7;
          border-color: #f1b790;
          color: #55382b;
          font-weight: 700;
        }

        .modeGuideCard {
          border: 1px solid #ebd7c8;
          border-radius: 12px;
          background: #fffdfb;
          padding: 10px;
          display: grid;
          gap: 8px;
        }

        .modeGuideCard h3 {
          margin: 0;
          color: #66493d;
          font-size: 0.9rem;
        }

        .modeGuideCard p {
          margin: 0;
          color: #785d50;
          font-size: 0.82rem;
          line-height: 1.4;
        }

        .guideSteps {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .guideSteps span {
          border: 1px solid #edd8ca;
          background: #fff7f1;
          color: #6f5549;
          border-radius: 999px;
          padding: 4px 8px;
          font-size: 0.76rem;
        }

        .modeFieldGrid {
          display: grid;
          gap: 8px;
        }

        .modeFieldGrid textarea {
          width: 100%;
          border: 1px solid #e8d5c8;
          border-radius: 10px;
          padding: 8px 10px;
          background: #fffdfb;
          color: #4a372f;
          font-size: 0.85rem;
          resize: vertical;
        }

        .emotionPicker {
          display: grid;
          gap: 8px;
          font-size: 0.88rem;
          color: #6d5348;
        }

        .emotionGrid {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .emotionChip {
          border: 1px solid #e6cfbf;
          background: #fff9f3;
          color: #6f5549;
          border-radius: 999px;
          padding: 7px 11px;
          font-size: 0.84rem;
          cursor: pointer;
        }

        .emotionChip.active {
          background: #ffd9c1;
          border-color: #f1b790;
          color: #573b2e;
          font-weight: 700;
        }

        .liveSummary {
          margin: 2px 0 0;
          border: 1px dashed #ebccb6;
          border-radius: 10px;
          background: #fff5ec;
          color: #6a4b3d;
          font-size: 0.83rem;
          line-height: 1.4;
          padding: 8px 10px;
        }

        .textMetaRow {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          font-size: 0.82rem;
          color: #785d50;
        }

        .textMetaRow button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .keySentenceBox {
          border: 1px solid #eed6c6;
          border-radius: 12px;
          background: #fffaf6;
          padding: 9px 10px;
        }

        .keySentenceBox strong {
          display: block;
          color: #6a4a3d;
          font-size: 0.84rem;
        }

        .keySentenceBox p {
          margin: 4px 0 0;
          color: #7a5c4f;
          font-size: 0.84rem;
        }

        .checkRow {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.84rem;
          color: #6e5448;
        }

        .checkRow input {
          width: 16px;
          height: 16px;
        }

        .liveComment {
          margin: 0;
          border: 1px solid #f0c9ac;
          border-radius: 10px;
          background: #ffeede;
          color: #6d4736;
          font-size: 0.84rem;
          line-height: 1.45;
          padding: 8px 10px;
        }

        .diaryDashboard {
          margin-top: 12px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .metricCard {
          border: 1px solid #ecd8ca;
          border-radius: 14px;
          background: #fffaf6;
          padding: 10px;
          display: grid;
          gap: 8px;
        }

        .metricCard h3 {
          margin: 0;
          color: #66493d;
          font-size: 0.9rem;
        }

        .gaugeWrap {
          position: relative;
          width: 140px;
          height: 140px;
          margin: 0 auto;
        }

        .gaugeSvg {
          width: 140px;
          height: 140px;
          transform: rotate(-90deg);
        }

        .gaugeTrack {
          fill: none;
          stroke: #f1ded1;
          stroke-width: 10;
        }

        .gaugeValue {
          fill: none;
          stroke: #ea8f72;
          stroke-width: 10;
          stroke-linecap: round;
        }

        .gaugeCenter {
          position: absolute;
          inset: 0;
          display: grid;
          place-content: center;
          text-align: center;
          color: #6a4a3e;
        }

        .gaugeCenter strong {
          font-size: 1.4rem;
          line-height: 1;
        }

        .gaugeCenter span {
          font-size: 0.8rem;
        }

        .donutWrap {
          display: grid;
          grid-template-columns: 110px 1fr;
          gap: 10px;
          align-items: center;
        }

        .donutChart {
          width: 110px;
          height: 110px;
          border-radius: 50%;
          border: 1px solid #ead4c4;
          position: relative;
        }

        .donutChart::after {
          content: "";
          position: absolute;
          inset: 23px;
          border-radius: 50%;
          background: #fffaf6;
          border: 1px solid #f0dfd1;
        }

        .donutLegend {
          display: grid;
          gap: 5px;
        }

        .donutLegend p {
          margin: 0;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.82rem;
          color: #6e5448;
        }

        .legendDot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }

        .calendarHead {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 10px;
        }

        .calendarHead strong {
          color: #66493d;
        }

        .calendarWeekdays {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: 6px;
          margin-bottom: 6px;
          color: #7b6155;
          font-size: 0.8rem;
          text-align: center;
        }

        .calendarGrid {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: 6px;
        }

        .calendarCell {
          border: 1px solid #ecd8cb;
          border-radius: 10px;
          min-height: 64px;
          background: #fffdfb;
          color: #6e5449;
          display: grid;
          align-content: center;
          justify-items: center;
          font-size: 0.78rem;
          padding: 6px 4px;
          cursor: pointer;
        }

        .calendarCell.empty {
          border: 0;
          background: transparent;
          cursor: default;
        }

        .calendarCell strong {
          font-size: 0.9rem;
        }

        .calendarCell em {
          font-style: normal;
          font-size: 0.7rem;
          color: #7a6054;
        }

        .calendarCell.done {
          background: #ffe9d8;
          border-color: #f2c7a8;
        }

        .calendarCell.heat-good {
          background: #e9f6ea;
          border-color: #b9dfbd;
        }

        .calendarCell.heat-mid {
          background: #fff6dc;
          border-color: #ebd397;
        }

        .calendarCell.heat-low {
          background: #fdeceb;
          border-color: #efc2bd;
        }

        .calendarCell.todo {
          background: #fffdfb;
        }

        .calendarCell.future {
          opacity: 0.58;
        }

        .heatLegend {
          margin-top: 8px;
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          font-size: 0.76rem;
          color: #6f5448;
        }

        .heatLegend span {
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }

        .legendSwatch {
          width: 12px;
          height: 12px;
          border-radius: 3px;
          display: inline-block;
          border: 1px solid transparent;
        }

        .legendSwatch.heat-good {
          background: #e9f6ea;
          border-color: #b9dfbd;
        }

        .legendSwatch.heat-mid {
          background: #fff6dc;
          border-color: #ebd397;
        }

        .legendSwatch.heat-low {
          background: #fdeceb;
          border-color: #efc2bd;
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

        .dayEntryList {
          margin-top: 10px;
          display: grid;
          gap: 8px;
          max-height: 220px;
          overflow-y: auto;
        }

        .dayEntryList h3 {
          margin: 0;
          color: #66493d;
          font-size: 0.9rem;
        }

        .panelHeadRow {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
        }

        .quickTrendRow {
          margin-top: 8px;
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .quickTrendRow span {
          border: 1px solid #ecd8cb;
          border-radius: 999px;
          background: #fff8f1;
          color: #6f5448;
          padding: 4px 8px;
          font-size: 0.78rem;
          font-weight: 700;
        }

        .diaryWriterPanel {
          max-height: 82vh;
          overflow-y: auto;
        }

        .diaryCalendarPanel {
          max-height: 82vh;
          overflow-y: auto;
        }

        .dayEntryCard {
          border: 1px solid #edd9cc;
          border-radius: 10px;
          background: #fffaf6;
          padding: 8px 10px;
        }

        .journalCard {
          border: 1px solid #efdacc;
          border-radius: 14px;
          padding: 10px;
          background: #fff9f4;
        }

        .cardActions {
          margin-top: 8px;
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .authorFilterRow {
          margin-top: 10px;
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .authorCatalog {
          margin-top: 10px;
          border: 1px solid #ead7c9;
          border-radius: 12px;
          overflow: hidden;
          background: #fffdfb;
        }

        .authorCatalogHead,
        .authorCatalogRow {
          display: grid;
          grid-template-columns: 1.2fr 1.5fr 0.5fr 0.7fr 0.8fr;
          gap: 8px;
          align-items: center;
          padding: 8px 10px;
          font-size: 0.8rem;
        }

        .authorCatalogHead {
          background: #f8ece1;
          color: #6d4f40;
          font-weight: 700;
        }

        .authorCatalogRow {
          border-top: 1px solid #f2e5db;
          background: #fffdfb;
          color: #6f5448;
          text-align: left;
          cursor: pointer;
        }

        .authorCatalogRow.active {
          background: #ffe9d8;
        }

        .monoText {
          font-family: "Fira Mono", var(--font-geist-mono), monospace;
          font-size: 0.74rem;
        }

        .authorChip {
          border: 1px solid #e8cdbb;
          background: #fff8f1;
          color: #6a4f43;
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 0.82rem;
          cursor: pointer;
          font-weight: 700;
        }

        .authorChip.active {
          background: #ffd9c1;
          border-color: #f2b990;
          color: #563a2e;
        }

        .developerActivityGrid {
          margin-top: 10px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .developerColumn {
          border: 1px solid #eedacc;
          border-radius: 12px;
          padding: 10px;
          background: #fffaf5;
          max-height: 360px;
          overflow-y: auto;
        }

        .developerColumn h3 {
          margin: 0 0 8px;
          color: #5f4338;
          font-size: 0.94rem;
        }

        .developerTimeline {
          margin-top: 10px;
          display: grid;
          gap: 8px;
          max-height: 460px;
          overflow-y: auto;
        }

        .developerItem {
          border: 1px solid #ecd8cb;
          border-radius: 10px;
          padding: 8px 10px;
          background: #fffdfb;
        }

        .dateGroup {
          margin-top: 8px;
          display: grid;
          gap: 8px;
        }

        .dateGroup h4 {
          margin: 0;
          color: #6a4f43;
          font-size: 0.86rem;
          border-left: 4px solid #f0b48d;
          padding-left: 8px;
        }

        .typeBadge {
          display: inline-block;
          border-radius: 999px;
          border: 1px solid #efc9b2;
          background: #fff0e3;
          color: #84563f;
          padding: 2px 8px;
          font-size: 0.75rem;
          font-weight: 700;
          margin-right: 6px;
        }

        .dangerBtn {
          border-color: #efc1b9;
          background: #fdebe7;
          color: #9a3e35;
        }

        .journalMeta {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          font-size: 0.85rem;
        }

        .childTimeline {
          margin-top: 10px;
          display: grid;
          gap: 10px;
          max-height: 560px;
          overflow-y: auto;
        }

        .timelineRow {
          display: grid;
          grid-template-columns: 140px 1fr;
          gap: 10px;
          border: 1px solid #edd9cc;
          border-radius: 12px;
          background: #fffdfb;
          padding: 10px;
        }

        .timelineDate {
          display: grid;
          gap: 4px;
          align-content: start;
          border-right: 1px dashed #efcfbd;
          padding-right: 8px;
          color: #6a4e41;
        }

        .timelineDate span {
          font-size: 0.82rem;
          color: #856355;
        }

        .timelineBody {
          display: grid;
          gap: 6px;
        }

        .signalRow {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .signalBadge {
          border-radius: 999px;
          padding: 3px 8px;
          font-size: 0.74rem;
          font-weight: 700;
          border: 1px solid transparent;
        }

        .signalBadge.risk {
          background: #fde8e4;
          color: #9a3b31;
          border-color: #efbfb6;
        }

        .signalBadge.good {
          background: #e8f6e8;
          color: #2f7442;
          border-color: #b8dfbf;
        }

        .signalBadge.warn {
          background: #fff3df;
          color: #8a6339;
          border-color: #efd0a4;
        }

        .solutionBox {
          margin-top: 4px;
          border: 1px solid #efcdb4;
          background: #fff3e8;
          border-radius: 10px;
          padding: 8px 10px;
        }

        .solutionBox h4 {
          margin: 0 0 4px;
          font-size: 0.84rem;
          color: #764b35;
        }

        .solutionBox p {
          margin: 0;
          white-space: pre-wrap;
          color: #684d40;
          line-height: 1.45;
        }

        .textHighlight {
          background: #ffe2ca;
          color: #6a3f2b;
          border-radius: 4px;
          padding: 0 2px;
          font-weight: 700;
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

        .lineChartWrap {
          margin-top: 12px;
          border: 1px solid #ecd8cb;
          border-radius: 12px;
          background: #fffdfb;
          padding: 10px;
        }

        .lineChart {
          width: 100%;
          height: auto;
          display: block;
        }

        .lineGrid {
          stroke: #efdfd4;
          stroke-width: 1;
        }

        .linePath {
          fill: none;
          stroke-width: 3;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .linePath.up {
          stroke: #5eaa6f;
        }

        .linePath.down {
          stroke: #d47366;
        }

        .linePoint {
          stroke: #ffffff;
          stroke-width: 1.5;
          fill: #e3916f;
        }

        .linePoint.risk {
          fill: #d6675b;
        }

        .lineLabel {
          font-size: 11px;
          fill: #795f53;
          text-anchor: middle;
        }

        .insightGrid {
          margin-top: 10px;
          display: grid;
          gap: 8px;
        }

        .insightChip {
          border: 1px solid #edd9ca;
          border-radius: 10px;
          background: #fff8f2;
          color: #6d5246;
          font-size: 0.83rem;
          padding: 8px 10px;
        }

        .analysisCards {
          margin-top: 10px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .analysisCard {
          border: 1px solid #ecd8cb;
          border-radius: 12px;
          background: #fffdfb;
          padding: 8px 10px;
        }

        .analysisCard h3 {
          margin: 0;
          font-size: 0.84rem;
          color: #66493d;
        }

        .analysisCard p {
          margin: 4px 0 0;
          color: #72584c;
          font-size: 0.82rem;
          line-height: 1.4;
          white-space: pre-wrap;
        }

        .fortuneWeeklyCard {
          margin-top: 10px;
          border: 1px solid #ecd6c8;
          border-radius: 12px;
          background: #fffbf8;
          padding: 9px 10px;
        }

        .fortuneWeeklyCard h3 {
          margin: 0;
          color: #67493d;
          font-size: 0.86rem;
        }

        .fortuneWeeklyCard p {
          margin: 6px 0 0;
          color: #6f554a;
          font-size: 0.83rem;
          line-height: 1.45;
          white-space: pre-wrap;
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

          .counselWorkspace {
            grid-template-columns: 1fr;
          }

          .threadSidebar {
            position: static;
          }

          .developerActivityGrid {
            grid-template-columns: 1fr;
          }

          .adminGrid {
            grid-template-columns: 1fr;
          }

          .diaryDashboard,
          .analysisCards {
            grid-template-columns: 1fr;
          }

          .diaryWriterPanel {
            max-height: none;
            overflow: visible;
          }

          .analysisRangeInputs {
            grid-template-columns: 1fr;
          }

          .donutWrap {
            grid-template-columns: 1fr;
            justify-items: center;
          }

          .timelineRow {
            grid-template-columns: 1fr;
          }

          .timelineDate {
            border-right: 0;
            border-bottom: 1px dashed #efcfbd;
            padding-right: 0;
            padding-bottom: 6px;
          }

          .authorCatalogHead,
          .authorCatalogRow {
            grid-template-columns: 1fr;
            gap: 4px;
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
