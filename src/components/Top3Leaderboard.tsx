"use client";

import React, { useState, useEffect, useCallback } from "react";
import { RecordItem, fetchTop3Records } from "@/lib/sheetService";
import { Trophy, Flame, RefreshCw } from "lucide-react";

export default function Top3Leaderboard() {
  const [topRecords, setTopRecords] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const top3 = await fetchTop3Records();
      setTopRecords(top3);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    fetchTop3Records().then((top3) => {
      if (!ignore) {
        setTopRecords(top3);
      }
    });
    return () => {
      ignore = true;
    };
  }, []);

  const medalColors = [
    { bg: "from-amber-400 to-yellow-500", text: "text-amber-300", border: "border-amber-400/40", label: "1위" },
    { bg: "from-slate-300 to-slate-400", text: "text-slate-200", border: "border-slate-300/40", label: "2위" },
    { bg: "from-amber-600 to-orange-700", text: "text-amber-600", border: "border-amber-700/40", label: "3위" },
  ];

  return (
    <div className="w-full max-w-xl bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl backdrop-blur-md mt-4 text-slate-100">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
            <Trophy className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-extrabold text-sm sm:text-base text-white flex items-center gap-1.5">
              명예의 전당 Top 3
              <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1 font-semibold">
                <Flame className="w-3 h-3 text-rose-400 fill-rose-400" /> 최단 클리어
              </span>
            </h3>
          </div>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="text-slate-400 hover:text-white text-xs flex items-center gap-1 transition-colors p-1"
          title="새로고침"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Top 3 랭킹 카드 리스트 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {topRecords.length === 0 ? (
          <div className="col-span-3 text-center py-4 text-xs text-slate-500">
            {loading ? "랭킹을 불러오는 중..." : "아직 등록된 랭킹 기록이 없습니다."}
          </div>
        ) : (
          topRecords.map((item, idx) => {
            const medal = medalColors[idx] || medalColors[2];
            return (
              <div
                key={item.rowIndex || idx}
                className={`relative flex flex-col items-center p-3 rounded-xl bg-slate-950/60 border ${medal.border} shadow-md overflow-hidden hover:scale-[1.02] transition-transform`}
              >
                {/* 순위 배지 */}
                <div
                  className={`w-7 h-7 rounded-full bg-gradient-to-br ${medal.bg} text-slate-950 font-black text-xs flex items-center justify-center mb-2 shadow-md`}
                >
                  {idx + 1}
                </div>

                {/* 플레이어 이름 */}
                <div className="font-bold text-sm text-white truncate max-w-[120px] text-center">
                  {item.name}
                </div>

                {/* 클리어 시간 */}
                <div className={`mt-1 font-mono font-black text-base ${medal.text} tracking-tight`}>
                  ⏱️ {item.finishtime}
                </div>

                {/* 날짜 */}
                <div className="mt-1 text-[10px] text-slate-500 truncate max-w-[110px]">
                  {item.timestamp ? item.timestamp.split(" ")[0] : ""}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
