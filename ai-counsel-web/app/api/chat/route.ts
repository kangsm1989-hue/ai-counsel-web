import Replicate from "replicate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

function isRisky(text: string) {
  const t = (text ?? "").toLowerCase();
  const keywords = ["자살", "자해", "죽고싶", "죽고 싶", "극단적 선택", "해치고 싶"];
  return keywords.some((k) => t.includes(k));
}

function buildPrompt(message: string, track?: string, technique?: string) {
  const trackHint =
    track === "진로"
      ? "진로 상담 맥락으로 목표/선택지를 구조화해줘."
      : track === "정서"
      ? "정서 상담 맥락으로 감정 조절과 일상 실행 전략을 제안해줘."
      : track === "양육"
      ? "양육 상담 맥락으로 부모-아이 상호작용과 현실적 루틴을 제안해줘."
      : "상담 맥락으로 과도한 단정 없이 안전하고 실용적으로 답해줘.";

  const techniqueHint =
    technique === "gestalt"
      ? "게슈탈트 기법: 지금-여기 경험, 감정 자각, 회피 패턴 인식을 중심으로 답변."
      : technique === "psychoanalysis"
      ? "정신분석학 기법: 과거 경험, 무의식적 갈등, 반복 패턴 탐색 질문 중심으로 답변."
      : technique === "humanistic"
      ? "인간중심 기법: 공감, 무조건적 수용, 자기이해 촉진 질문 중심으로 답변."
      : technique === "behaviorism"
      ? "행동주의 기법: 구체 행동 목표, 촉발요인-행동-결과 분석, 강화 계획 중심으로 답변."
      : technique === "blended"
      ? "일반 AI 대화 모드: 특정 상담 프레임을 강요하지 말고, 자연스러운 대화체로 사용자의 질문 의도에 맞게 답변."
      : "REBT 기법: 비합리적 신념을 찾아 ABCDE 구조로 재구성.";

  const responseFormat =
    technique === "rebt"
      ? [
          "응답 형식:",
          "1) 공감 요약(2문장 이내)",
          "2) A(사건) / B(신념) / C(결과) 정리",
          "3) D(비합리적 신념 논박 질문 2~3개)",
          "4) E(새로운 관점과 실천 2가지)",
          "5) 필요 시 안전 안내",
        ]
      : technique === "blended"
      ? [
          "응답 형식:",
          "1) 질문 의도에 대한 직접 답변",
          "2) 필요하면 선택지/예시 제시",
          "3) 위험 신호가 있을 때만 안전 안내",
        ]
      : [
          "응답 형식:",
          "1) 공감 요약",
          "2) 선택한 기법 기준 핵심 해석",
          "3) 실천 가능한 행동 2~3개",
          "4) 다음 상담에서 점검할 질문 1~2개",
          "5) 필요 시 안전 안내",
        ];

  return [
    "너는 따뜻하고 실용적인 상담형 AI야.",
    "금지: 의료/법률 확정 진단, 과도한 단정, 위험 행동 조장.",
    `추가 지시: ${trackHint}`,
    `상담 기법 지시: ${techniqueHint}`,
    ...responseFormat,
    "",
    `사용자: ${message}`,
    "상담자:",
  ].join("\n");
}

export async function POST(req: Request) {
  try {
    if (!process.env.REPLICATE_API_TOKEN) {
      return new Response(
        JSON.stringify({ reply: "서버 설정 오류: REPLICATE_API_TOKEN이 없습니다." }),
        { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } }
      );
    }

    const body = await req.json();
    const message = body?.message ?? "";
    const riskMessage = body?.riskMessage ?? message;
    const track = body?.track ?? "";
    const technique = body?.technique ?? "blended";

    if (typeof message !== "string" || !message.trim()) {
      return new Response(JSON.stringify({ reply: "메시지가 비어 있어요." }), {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    if (isRisky(String(riskMessage))) {
      return new Response(
        JSON.stringify({
          reply:
            "위기 신호가 감지됐어요.\n" +
            "지금은 혼자 감당하지 말고, 가까운 사람에게 도움을 요청해 주세요.\n" +
            "긴급하면 112/119 또는 1393(자살예방상담)로 즉시 연락해 주세요.",
        }),
        { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } }
      );
    }

    const model = process.env.REPLICATE_MODEL || "openai/gpt-5-mini";

    const input = {
      prompt: buildPrompt(message, track, technique),
      temperature: 0.7,
      max_new_tokens: 256,
    };

    const output = await replicate.run(model as `${string}/${string}`, { input });

    let reply = "";
    if (typeof output === "string") reply = output;
    else if (Array.isArray(output)) reply = output.join("");
    else reply = JSON.stringify(output);

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({
        reply: "Replicate 호출 오류",
        detail: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  }
}
