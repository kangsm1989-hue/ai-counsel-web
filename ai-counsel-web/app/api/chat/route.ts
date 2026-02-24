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

function buildPrompt(message: string, track?: string) {
  const trackHint =
    track === "진로"
      ? "진로 상담 맥락으로 질문을 명확히 하고 선택지를 정리해줘."
      : track === "정서"
      ? "정서 상담 맥락으로 공감과 현실적인 다음 행동 1~2개를 제안해줘."
      : "상담 맥락으로 과도한 단정 없이 안전하고 실용적으로 답해줘.";

  return [
    "너는 따뜻하고 실용적인 상담형 AI야.",
    "금지: 의료/법률 확정 진단, 과도한 단정, 위험 행동 조장.",
    `추가 지시: ${trackHint}`,
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
    const track = body?.track ?? "";

    if (typeof message !== "string" || !message.trim()) {
      return new Response(JSON.stringify({ reply: "메시지가 비어 있어요." }), {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    if (track === "위기" || isRisky(message)) {
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
      prompt: buildPrompt(message, track),
      temperature: 0.7,
      max_new_tokens: 256,
    };

    const output = await replicate.run(model as any, { input });

    let reply = "";
    if (typeof output === "string") reply = output;
    else if (Array.isArray(output)) reply = output.join("");
    else reply = JSON.stringify(output);

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        reply: "Replicate 호출 오류",
        detail: err?.message ?? String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  }
}