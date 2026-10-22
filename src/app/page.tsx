"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import confetti from "canvas-confetti";
import { Button } from "@/components/ui/button";
import RecordManagerDialog from "@/components/RecordManagerDialog";
import Top3Leaderboard from "@/components/Top3Leaderboard";
import { createRecord } from "@/lib/sheetService";
import { MASCOT_BASE64 } from "@/lib/mascotBase64";
import { Play, Pause, RotateCcw, Power, Heart, Volume2, VolumeX, Trophy, AlertTriangle, CheckCircle2, ThumbsUp } from "lucide-react";

// 블록 색상 정의
const BLOCK_COLORS = {
  lightRed: { name: "연한 빨강", hex: "#FCA5A5", border: "#F87171", isTarget: true },
  lightOrange: { name: "연한 주황", hex: "#FDBA74", border: "#FB923C", isTarget: false },
  lightYellow: { name: "연한 노랑", hex: "#FDE047", border: "#FACC15", isTarget: false },
  lightGreen: { name: "연한 녹색", hex: "#86EFAC", border: "#4ADE80", isTarget: false },
  lightBlue: { name: "연한 파랑", hex: "#93C5FD", border: "#60A5FA", isTarget: false },
  lightPurple: { name: "연한 보라", hex: "#D8B4FE", border: "#C084FC", isTarget: false },
};

type ColorKey = keyof typeof BLOCK_COLORS;

interface Block {
  x: number;
  y: number;
  width: number;
  height: number;
  colorKey: ColorKey;
  active: boolean;
}

export default function BrickBreakerApp() {
  // 화면 상태: "start" | "playing" | "success" | "failure"
  const [gameState, setGameState] = useState<"start" | "playing" | "success" | "failure">("start");
  
  // 플레이어 정보
  const [userName, setUserName] = useState("");
  
  // 제작자 정보
  const [creatorInfo] = useState({
    department: "경제학과",
    studentId: "202300719",
    name: "정성윤",
  });

  // 카운트다운
  const [countdown, setCountdown] = useState<number | null>(null);

  // 엄지척(Thumbs up) 효과 표시
  const [showThumbsUp, setShowThumbsUp] = useState(false);
  const thumbsUpTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 게임 내 정보
  const [isPaused, setIsPaused] = useState(false);
  const [lives, setLives] = useState(3);
  const [elapsedTime, setElapsedTime] = useState(0); // 초 단위
  const [targetBricksBroken, setTargetBricksBroken] = useState(0); // 부순 연한 빨강 블록 수
  const [isMuted, setIsMuted] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saving" | "saved" | "idle">("idle");

  // Canvas 및 게임 참조
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const requestRef = useRef<number | null>(null);

  // 게임 엔진 가변 변수들
  const gameRunningRef = useRef(false);
  const isPausedRef = useRef(false);
  const livesRef = useRef(3);
  const targetBricksBrokenRef = useRef(0);
  const blocksRef = useRef<Block[]>([]);

  // 캔버스 크기
  const CANVAS_WIDTH = 800;
  const CANVAS_HEIGHT = 500;

  // 패들 설정
  const paddleWidth = 110;
  const paddleHeight = 14;
  const paddleSpeed = 8;
  const paddleXRef = useRef((CANVAS_WIDTH - paddleWidth) / 2);

  // 공 설정
  const ballRadius = 8;
  const ballXRef = useRef(CANVAS_WIDTH / 2);
  const ballYRef = useRef(CANVAS_HEIGHT - 35);
  const ballDxRef = useRef(4);
  const ballDyRef = useRef(-4);

  // 키 입력 상태
  const rightPressedRef = useRef(false);
  const leftPressedRef = useRef(false);

  // 모바일 터치 / 스와이프 관련 ref
  const touchStartXRef = useRef<number | null>(null);
  const touchStartPaddleXRef = useRef<number>(0);

  // 효과음 생성기 (Web Audio API)
  const playHitSound = useCallback(() => {
    if (isMuted) return;
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new AudioCtx();
      }
      if (audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume();
      }
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(480, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(840, ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch {
      // 오디오 컨텍스트 오류 무시
    }
  }, [isMuted]);

  // 패들 충돌 사운드
  const playPaddleSound = useCallback(() => {
    if (isMuted) return;
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new AudioCtx();
      }
      if (audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume();
      }
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(260, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + 0.06);

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.06);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.06);
    } catch {
      // 무시
    }
  }, [isMuted]);

  // 블록 초기화 함수 (5행 x 8열 = 40개, 30% 연한 빨강 즉 12개)
  const initBlocks = () => {
    const rows = 5;
    const cols = 8;
    const total = rows * cols;
    const redCount = Math.round(total * 0.3); // 12개
    
    const colorKeys: ColorKey[] = [];
    for (let i = 0; i < redCount; i++) {
      colorKeys.push("lightRed");
    }
    const otherColors: ColorKey[] = ["lightOrange", "lightYellow", "lightGreen", "lightBlue", "lightPurple"];
    for (let i = redCount; i < total; i++) {
      const randColor = otherColors[Math.floor(Math.random() * otherColors.length)];
      colorKeys.push(randColor);
    }

    // 셔플
    for (let i = colorKeys.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [colorKeys[i], colorKeys[j]] = [colorKeys[j], colorKeys[i]];
    }

    const padding = 10;
    const offsetTop = 45;
    const offsetLeft = 35;
    const blockWidth = (CANVAS_WIDTH - offsetLeft * 2 - padding * (cols - 1)) / cols;
    const blockHeight = 24;

    const newBlocks: Block[] = [];
    let idx = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = offsetLeft + c * (blockWidth + padding);
        const y = offsetTop + r * (blockHeight + padding);
        newBlocks.push({
          x,
          y,
          width: blockWidth,
          height: blockHeight,
          colorKey: colorKeys[idx],
          active: true,
        });
        idx++;
      }
    }
    blocksRef.current = newBlocks;
  };

  // 공 및 패들 위치 재설정
  const resetBallAndPaddle = () => {
    paddleXRef.current = (CANVAS_WIDTH - paddleWidth) / 2;
    ballXRef.current = CANVAS_WIDTH / 2;
    ballYRef.current = CANVAS_HEIGHT - 35;
    
    // 약간의 랜덤 각도로 공 시작
    const angle = (Math.PI / 4) + (Math.random() * (Math.PI / 2)); // 45도 ~ 135도
    const speed = 5.2;
    ballDxRef.current = speed * Math.cos(angle);
    ballDyRef.current = -Math.abs(speed * Math.sin(angle));
  };

  // 게임 시작 버튼 클릭
  const handleStartGame = () => {
    if (!userName.trim()) {
      alert("사용자 이름을 입력해주세요!");
      return;
    }

    // 초기 상태 리셋
    setGameState("playing");
    setLives(3);
    livesRef.current = 3;
    setTargetBricksBroken(0);
    targetBricksBrokenRef.current = 0;
    setElapsedTime(0);
    setIsPaused(false);
    isPausedRef.current = false;
    setSaveStatus("idle");
    gameRunningRef.current = false; // 카운트다운 동안은 false

    initBlocks();
    resetBallAndPaddle();

    // BGM 시작 준비
    if (bgmRef.current) {
      bgmRef.current.currentTime = 0;
      bgmRef.current.volume = 0.35;
      bgmRef.current.play().catch(() => {});
    }

    // 3, 2, 1 카운트다운 시작
    setCountdown(3);
  };

  // 카운트다운 타이머 처리
  useEffect(() => {
    if (countdown === null) return;

    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown((prev) => (prev !== null ? prev - 1 : null));
      }, 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0) {
      // 카운트다운 끝남 -> 공 움직임 시작
      const timer = setTimeout(() => {
        setCountdown(null);
        gameRunningRef.current = true;
        isPausedRef.current = false;
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // 플레이 시간 측정 (분:초)
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (gameState === "playing" && !isPaused && countdown === null) {
      interval = setInterval(() => {
        setElapsedTime((t) => t + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [gameState, isPaused, countdown]);

  // 시간 포맷 (분:초)
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins < 10 ? "0" : ""}${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  // 키보드 이벤트 리스너 (좌우 방향키)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "ArrowRight") {
        rightPressedRef.current = true;
      } else if (e.code === "ArrowLeft") {
        leftPressedRef.current = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "ArrowRight") {
        rightPressedRef.current = false;
      } else if (e.code === "ArrowLeft") {
        leftPressedRef.current = false;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // 터치 이벤트 핸들러 (모바일 스와이프 조작)
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (gameState !== "playing" || countdown !== null || isPaused) return;
    const touch = e.touches[0];
    touchStartXRef.current = touch.clientX;
    touchStartPaddleXRef.current = paddleXRef.current;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (gameState !== "playing" || countdown !== null || isPaused) return;
    if (touchStartXRef.current === null) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const touch = e.touches[0];
    const diffX = touch.clientX - touchStartXRef.current;
    
    // 화면 크기에 따른 캔버스 스케일 보정
    const rect = canvas.getBoundingClientRect();
    const scaleFactor = CANVAS_WIDTH / rect.width;
    const scaledDiff = diffX * scaleFactor;

    // 패들 위치 실시간 업데이트 (벽 제한)
    const newPaddleX = Math.max(0, Math.min(CANVAS_WIDTH - paddleWidth, touchStartPaddleXRef.current + scaledDiff));
    paddleXRef.current = newPaddleX;
  };

  const handleTouchEnd = () => {
    touchStartXRef.current = null;
  };
  const triggerVictory = useCallback(() => {
    gameRunningRef.current = false;
    setGameState("success");
    if (bgmRef.current) bgmRef.current.pause();

    // 완료 시간 계산 및 구글 시트 자동 등록 (Auto Create)
    const finalTimeStr = formatTime(elapsedTime);
    setSaveStatus("saving");
    createRecord({
      name: userName.trim() || "익명",
      finishtime: finalTimeStr,
    })
      .then(() => {
        setSaveStatus("saved");
      })
      .catch((err) => {
        console.error("자동 시트 저장 실패:", err);
        setSaveStatus("saved");
      });

    // 폭죽 효과 (Confetti)
    const duration = 3.5 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 1000 };

    const interval: NodeJS.Timeout = setInterval(function () {
      const timeLeft = animationEnd - Date.now();
      if (timeLeft <= 0) {
        return clearInterval(interval);
      }
      const particleCount = 50 * (timeLeft / duration);
      confetti({ ...defaults, particleCount, origin: { x: 0.2, y: 0.6 } });
      confetti({ ...defaults, particleCount, origin: { x: 0.8, y: 0.6 } });
    }, 250);
  }, [elapsedTime, userName]);

  // 게임 실패 처리
  const triggerGameOver = useCallback(() => {
    gameRunningRef.current = false;
    setGameState("failure");
    if (bgmRef.current) bgmRef.current.pause();
  }, []);

  // 렌더링 및 물리 루프
  useEffect(() => {
    if (gameState !== "playing") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      // 캔버스 클리어 및 배경 그리기
      ctx.fillStyle = "#0f172a"; // slate-900
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // 격자 무늬 배경 장식
      ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
      ctx.lineWidth = 1;
      for (let x = 0; x < CANVAS_WIDTH; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, CANVAS_HEIGHT);
        ctx.stroke();
      }
      for (let y = 0; y < CANVAS_HEIGHT; y += 30) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(CANVAS_WIDTH, y);
        ctx.stroke();
      }

      // 블록 렌더링
      blocksRef.current.forEach((block) => {
        if (!block.active) return;
        const colorConfig = BLOCK_COLORS[block.colorKey];

        ctx.save();
        // 블록 바디
        ctx.fillStyle = colorConfig.hex;
        ctx.strokeStyle = colorConfig.border;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(block.x, block.y, block.width, block.height, 4);
        ctx.fill();
        ctx.stroke();

        // 타겟 블록(연한 빨강) 특별 표시 아이콘/별
        if (colorConfig.isTarget) {
          ctx.fillStyle = "#991B1B";
          ctx.beginPath();
          ctx.arc(block.x + block.width / 2, block.y + block.height / 2, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });

      // 패들 렌더링
      ctx.save();
      const grad = ctx.createLinearGradient(
        paddleXRef.current,
        CANVAS_HEIGHT - 22,
        paddleXRef.current,
        CANVAS_HEIGHT - 22 + paddleHeight
      );
      grad.addColorStop(0, "#38BDF8"); // light blue
      grad.addColorStop(1, "#0284C7"); // blue
      ctx.fillStyle = grad;
      ctx.strokeStyle = "#BAE6FD";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(paddleXRef.current, CANVAS_HEIGHT - 22, paddleWidth, paddleHeight, 7);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // 공 렌더링
      ctx.save();
      ctx.beginPath();
      ctx.arc(ballXRef.current, ballYRef.current, ballRadius, 0, Math.PI * 2);
      ctx.fillStyle = "#F8FAFC";
      ctx.shadowColor = "#38BDF8";
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.closePath();
      ctx.restore();

      // 이동 및 물리 로직 (게임이 실제로 진행 중일 때만)
      if (gameRunningRef.current && !isPausedRef.current) {
        // 패들 이동 (자연스럽게 벽 충돌 처리)
        if (rightPressedRef.current && paddleXRef.current < CANVAS_WIDTH - paddleWidth) {
          paddleXRef.current += paddleSpeed;
        } else if (leftPressedRef.current && paddleXRef.current > 0) {
          paddleXRef.current -= paddleSpeed;
        }

        // 공 이동
        let nextX = ballXRef.current + ballDxRef.current;
        let nextY = ballYRef.current + ballDyRef.current;

        // 좌우 벽 충돌
        if (nextX + ballRadius > CANVAS_WIDTH) {
          nextX = CANVAS_WIDTH - ballRadius;
          ballDxRef.current = -ballDxRef.current;
          playHitSound();
        } else if (nextX - ballRadius < 0) {
          nextX = ballRadius;
          ballDxRef.current = -ballDxRef.current;
          playHitSound();
        }

        // 상단 벽 충돌
        if (nextY - ballRadius < 0) {
          nextY = ballRadius;
          ballDyRef.current = -ballDyRef.current;
          playHitSound();
        }

        // 패들 충돌 판정
        const paddleTop = CANVAS_HEIGHT - 22;
        if (
          nextY + ballRadius >= paddleTop &&
          ballYRef.current + ballRadius <= paddleTop + 6 &&
          nextX >= paddleXRef.current - ballRadius &&
          nextX <= paddleXRef.current + paddleWidth + ballRadius
        ) {
          // 패들의 맞은 위치에 따라 튕겨나가는 각도 계산 (-60도 ~ +60도)
          const hitOffset = (nextX - (paddleXRef.current + paddleWidth / 2)) / (paddleWidth / 2);
          const clampedOffset = Math.max(-1, Math.min(1, hitOffset));
          const maxBounceAngle = Math.PI / 3; // 60도
          const bounceAngle = clampedOffset * maxBounceAngle;
          
          const currentSpeed = Math.sqrt(
            ballDxRef.current * ballDxRef.current + ballDyRef.current * ballDyRef.current
          );
          
          ballDxRef.current = currentSpeed * Math.sin(bounceAngle);
          ballDyRef.current = -Math.abs(currentSpeed * Math.cos(bounceAngle));
          nextY = paddleTop - ballRadius;
          playPaddleSound();
        } 
        // 하단으로 공이 떨어진 경우 (생명 감소)
        else if (nextY - ballRadius > CANVAS_HEIGHT) {
          const newLives = livesRef.current - 1;
          livesRef.current = newLives;
          setLives(newLives);

          if (newLives <= 0) {
            triggerGameOver();
            return;
          } else {
            // 목숨 잃고 공/패들 리셋
            resetBallAndPaddle();
            nextX = ballXRef.current;
            nextY = ballYRef.current;
          }
        }

        // 블록 충돌 판정
        for (let i = 0; i < blocksRef.current.length; i++) {
          const b = blocksRef.current[i];
          if (!b.active) continue;

          // 공의 경계 상자와 블록의 충돌 체크
          if (
            nextX + ballRadius > b.x &&
            nextX - ballRadius < b.x + b.width &&
            nextY + ballRadius > b.y &&
            nextY - ballRadius < b.y + b.height
          ) {
            b.active = false;
            playHitSound();

            // 반사 방향 계산 (가장 가까운 모서리/변)
            const prevX = ballXRef.current;

            if (prevX + ballRadius <= b.x || prevX - ballRadius >= b.x + b.width) {
              ballDxRef.current = -ballDxRef.current;
            } else {
              ballDyRef.current = -ballDyRef.current;
            }

            // 연한 빨강 블록 충돌 체크
            if (b.colorKey === "lightRed") {
              const broken = targetBricksBrokenRef.current + 1;
              targetBricksBrokenRef.current = broken;
              setTargetBricksBroken(broken);

              // 엄지척(Thumbs up) 효과 트리거
              setShowThumbsUp(true);
              if (thumbsUpTimerRef.current) clearTimeout(thumbsUpTimerRef.current);
              thumbsUpTimerRef.current = setTimeout(() => {
                setShowThumbsUp(false);
              }, 1200);

              // 연한 빨강 블록 3개 제거 시 승리!
              if (broken >= 3) {
                triggerVictory();
                return;
              }
            }
            break; // 한 프레임에 블록 하나만 충돌 처리
          }
        }

        ballXRef.current = nextX;
        ballYRef.current = nextY;
      }

      requestRef.current = requestAnimationFrame(render);
    };

    requestRef.current = requestAnimationFrame(render);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameState, playHitSound, playPaddleSound, triggerGameOver, triggerVictory]);

  // 일시정지 / 계속하기 토글
  const togglePause = () => {
    if (gameState !== "playing" || countdown !== null) return;

    if (!isPaused) {
      // 일시정지 진입
      setIsPaused(true);
      isPausedRef.current = true;
      if (bgmRef.current) bgmRef.current.pause();
    } else {
      // 재개: 3, 2, 1 카운트다운 진행 후 재시작
      setIsPaused(false);
      isPausedRef.current = true; // 카운트다운 동안은 공 멈춤 유지
      setCountdown(3);
      if (bgmRef.current && !isMuted) {
        bgmRef.current.play().catch(() => {});
      }
    }
  };

  // 다시 시작 (첫 화면으로 이동)
  const handleRestartToStart = () => {
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    gameRunningRef.current = false;
    if (bgmRef.current) {
      bgmRef.current.pause();
      bgmRef.current.currentTime = 0;
    }
    setGameState("start");
  };

  // 게임 종료 버튼
  const handleQuitGame = () => {
    if (confirm("게임을 종료하고 첫 화면으로 돌아가시겠습니까?")) {
      handleRestartToStart();
    }
  };

  // 음소거 토글
  const toggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    if (bgmRef.current) {
      bgmRef.current.muted = nextMute;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-between p-4 selection:bg-rose-500 selection:text-white font-sans">
      {/* 배경 음악 오디오 요소 */}
      <audio ref={bgmRef} src="/Hyper_Speed_Run.mp3" loop preload="auto" />

      {/* 헤더 */}
      <header className="w-full max-w-4xl flex items-center justify-between py-3 px-6 bg-slate-900/80 border border-slate-800 rounded-2xl backdrop-blur-md shadow-lg my-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-black text-xl text-white shadow-md shadow-blue-500/20">
            INU
          </div>
          <h1 className="text-xl md:text-2xl font-black tracking-tight text-white">
            INU 벽돌깨기
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {/* 구글 시트 CRUD 다이얼로그 모달 */}
          <RecordManagerDialog />

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleMute}
            className="text-slate-300 hover:text-white hover:bg-slate-800"
            title={isMuted ? "음소거 해제" : "음소거"}
          >
            {isMuted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5" />}
          </Button>
          {gameState === "playing" && (
            <div className="px-3 py-1 bg-slate-800 border border-slate-700 rounded-lg text-sm font-semibold flex items-center gap-2">
              <span className="text-slate-400">플레이어:</span>
              <span className="text-sky-400">{userName}</span>
            </div>
          )}
        </div>
      </header>

      {/* 메인 화면 영역 */}
      <main className="w-full max-w-4xl flex-1 flex flex-col items-center justify-center my-4">
        {/* 1. 시작 화면 */}
        {gameState === "start" && (
          <div className="w-full max-w-2xl flex flex-col items-center">
            <div className="w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 flex flex-col items-center text-center shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-300">
              {/* 인천대학교 마스코트 횃불이 */}
              <div className="relative w-40 h-40 sm:w-48 sm:h-48 mb-4 rounded-2xl overflow-hidden border-2 border-indigo-500/30 shadow-xl bg-slate-800/60 p-2 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={MASCOT_BASE64}
                  alt="인천대학교 마스코트 횃불이"
                  className="w-full h-full object-contain"
                />
              </div>

              <h2 className="text-2xl sm:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-indigo-300 to-rose-400 mb-2">
                인천대학교 벽돌깨기 챌린지
              </h2>
              <p className="text-slate-400 text-sm mb-6 max-w-md">
                <span className="text-rose-400 font-bold">연한 빨강 블록 3개</span>를 격파하면 미션 성공!
                <br />
                좌우 방향키(←, →)로 패들을 조작하여 승리하세요.
              </p>

              {/* 사용자 이름 입력 */}
              <div className="w-full max-w-sm mb-6 flex flex-col gap-2 text-left">
                <label htmlFor="username" className="text-sm font-medium text-slate-300">
                  사용자 이름
                </label>
                <input
                  id="username"
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleStartGame()}
                  placeholder="이름을 입력하세요 (예: 홍길동)"
                  className="w-full px-4 py-3 bg-slate-950/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all text-base"
                  maxLength={15}
                />
              </div>

              {/* 시작 버튼 */}
              <Button
                onClick={handleStartGame}
                className="w-full max-w-sm py-6 text-lg font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl shadow-lg shadow-indigo-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Play className="w-5 h-5 mr-2 fill-current" /> 게임 시작
              </Button>

              {/* 제작자 정보 영역 */}
              <div className="mt-8 pt-5 border-t border-slate-800/80 w-full flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-2">
                <div>
                  <span className="font-semibold text-slate-300">제작자:</span> {creatorInfo.department} / {creatorInfo.studentId} {creatorInfo.name}
                </div>
                <div className="text-slate-500">인천대학교 전산실습 프로젝트</div>
              </div>
            </div>

            {/* 최단 완료시간 Top 3 랭킹 보드 */}
            <Top3Leaderboard />
          </div>
        )}

        {/* 2. 게임 플레이 화면 */}
        {gameState === "playing" && (
          <div className="w-full flex flex-col items-center">
            {/* 상태 바 (생명, 시간, 목표 현황) */}
            <div className="w-full max-w-[800px] flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl px-5 py-3 mb-3 shadow-md">
              {/* 남은 목숨 */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400 font-semibold mr-1">생명:</span>
                {[...Array(3)].map((_, i) => (
                  <Heart
                    key={i}
                    className={`w-5 h-5 transition-colors ${
                      i < lives ? "text-rose-500 fill-rose-500" : "text-slate-700 fill-slate-800"
                    }`}
                  />
                ))}
              </div>

              {/* 플레이 시간 */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-semibold">경과 시간:</span>
                <span className="font-mono text-xl font-bold text-sky-400">
                  {formatTime(elapsedTime)}
                </span>
              </div>

              {/* 연한 빨강 블록 미션 현황 */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-semibold">빨강 블록:</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  {targetBricksBroken} / 3 개
                </span>
              </div>
            </div>

            {/* 게임 캔버스 컨테이너 */}
            <div className="relative w-full max-w-[800px] aspect-[800/500] border-2 sm:border-4 border-slate-800 rounded-2xl overflow-hidden shadow-2xl bg-slate-900 touch-none">
              <canvas
                ref={canvasRef}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
                className="w-full h-full block cursor-none touch-none select-none"
              />

              {/* 카운트다운 오버레이 */}
              {countdown !== null && (
                <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm flex flex-col items-center justify-center z-20">
                  <span className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-br from-amber-300 via-rose-400 to-indigo-400 animate-bounce">
                    {countdown === 0 ? "START!" : countdown}
                  </span>
                  <p className="mt-4 text-slate-300 font-medium tracking-wide">
                    {countdown === 0 ? "경기가 시작되었습니다!" : "준비하세요!"}
                  </p>
                </div>
              )}

              {/* 연한 빨강 벽돌 타격 시 엄지척(Thumbs Up) 효과 */}
              {showThumbsUp && (
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-10 animate-in zoom-in-50 fade-in duration-200">
                  <div className="flex flex-col items-center justify-center p-4 rounded-3xl bg-slate-900/80 border-2 border-emerald-400/80 shadow-2xl backdrop-blur-md">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/40 animate-bounce">
                      <ThumbsUp className="w-12 h-12 text-white fill-white" />
                    </div>
                    <span className="mt-2 text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 to-teal-200 drop-shadow-md">
                      최고예요! 잘했어요! 👍
                    </span>
                    <span className="text-xs text-rose-300 font-bold mt-0.5">
                      빨간 벽돌 격파 성공!
                    </span>
                  </div>
                </div>
              )}

              {/* 일시정지 오버레이 */}
              {isPaused && (
                <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center">
                  <div className="bg-slate-900 border border-slate-700 p-8 rounded-2xl shadow-2xl text-center max-w-sm">
                    <Pause className="w-12 h-12 text-amber-400 mx-auto mb-3" />
                    <h3 className="text-2xl font-bold mb-2 text-white">일시 정지</h3>
                    <p className="text-slate-400 text-sm mb-6">게임이 일시적으로 멈췄습니다.</p>
                    <Button onClick={togglePause} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold">
                      계속 진행하기
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* 게임 조작 컨트롤 버튼 */}
            <div className="w-full max-w-[800px] flex items-center justify-between mt-4 px-2">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={togglePause}
                  disabled={countdown !== null}
                  className="bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800"
                >
                  {isPaused ? <Play className="w-4 h-4 mr-2" /> : <Pause className="w-4 h-4 mr-2" />}
                  {isPaused ? "계속하기" : "일시정지"}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleRestartToStart}
                  className="bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800"
                >
                  <RotateCcw className="w-4 h-4 mr-2" /> 다시 시작
                </Button>
              </div>

              <Button
                variant="destructive"
                onClick={handleQuitGame}
                className="bg-rose-950 border border-rose-800 text-rose-200 hover:bg-rose-900"
              >
                <Power className="w-4 h-4 mr-2" /> 게임 종료
              </Button>
            </div>
            
            {/* 키 조작 안내 툴팁 (PC 및 모바일) */}
            <div className="mt-3 text-xs text-slate-500 flex flex-wrap items-center justify-center gap-2">
              <span className="hidden sm:inline">PC 조작:</span>
              <kbd className="hidden sm:inline-block px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-300">←</kbd>
              <kbd className="hidden sm:inline-block px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-300">→</kbd>
              <span className="hidden sm:inline">방향키</span>
              <span className="hidden sm:inline text-slate-600">|</span>
              <span className="text-sky-400 font-medium">📱 모바일: 화면을 좌우로 스와이프하여 패들을 이동하세요.</span>
            </div>
          </div>
        )}

        {/* 3. 승리 결과 화면 */}
        {gameState === "success" && (
          <div className="w-full max-w-lg bg-slate-900/90 border border-emerald-500/40 rounded-3xl p-8 flex flex-col items-center text-center shadow-2xl backdrop-blur-xl animate-in zoom-in-95">
            <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center text-emerald-400 mb-4 shadow-lg shadow-emerald-500/20">
              <Trophy className="w-10 h-10 animate-bounce" />
            </div>

            <h2 className="text-3xl font-black text-emerald-400 mb-1">미션 성공!</h2>
            <p className="text-slate-300 text-base mb-6">
              축하합니다, <strong className="text-sky-400">{userName}</strong>님! 연한 빨강 블록 3개를 모두 격파했습니다!
            </p>

            <div className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl p-4 mb-4 flex items-center justify-around">
              <div>
                <div className="text-xs text-slate-400 mb-1 font-medium">완료 시간</div>
                <div className="text-2xl font-mono font-black text-emerald-400">
                  {formatTime(elapsedTime)}
                </div>
              </div>
              <div className="w-px h-8 bg-slate-800" />
              <div>
                <div className="text-xs text-slate-400 mb-1 font-medium">잔여 생명</div>
                <div className="text-2xl font-mono font-black text-rose-400">
                  {lives} / 3
                </div>
              </div>
            </div>

            {/* 구글 시트 자동 저장 상태 배지 */}
            <div className="mb-6 flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700">
              {saveStatus === "saving" ? (
                <span className="text-amber-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                  구글 시트에 기록 자동 등록 중...
                </span>
              ) : (
                <span className="text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  구글 시트에 기록이 자동 등록되었습니다!
                </span>
              )}
            </div>

            <Button
              onClick={handleRestartToStart}
              className="w-full py-6 text-lg font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl shadow-lg shadow-emerald-600/30 transition-all hover:scale-[1.02]"
            >
              <RotateCcw className="w-5 h-5 mr-2" /> 다시 도전하기
            </Button>
          </div>
        )}

        {/* 4. 실패 결과 화면 */}
        {gameState === "failure" && (
          <div className="w-full max-w-lg bg-slate-900/90 border border-rose-500/40 rounded-3xl p-8 flex flex-col items-center text-center shadow-2xl backdrop-blur-xl animate-in zoom-in-95">
            <div className="w-20 h-20 rounded-full bg-rose-500/20 border-2 border-rose-500/40 flex items-center justify-center text-rose-400 mb-4 shadow-lg shadow-rose-500/20">
              <AlertTriangle className="w-10 h-10" />
            </div>

            <h2 className="text-3xl font-black text-rose-400 mb-2">게임 미션 실패</h2>
            <p className="text-slate-300 text-base mb-6">
              모든 생명을 소진하였습니다. 다시 한 번 도전해보세요!
            </p>

            <div className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl p-4 mb-6">
              <div className="text-xs text-slate-400 mb-1 font-medium">제거한 연한 빨강 블록</div>
              <div className="text-xl font-bold text-slate-200">
                {targetBricksBroken} / 3 개
              </div>
            </div>

            <Button
              onClick={handleRestartToStart}
              className="w-full py-6 text-lg font-bold bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white rounded-xl shadow-lg shadow-rose-600/30 transition-all hover:scale-[1.02]"
            >
              <RotateCcw className="w-5 h-5 mr-2" /> 메인 화면으로 이동
            </Button>
          </div>
        )}
      </main>

      {/* 하단 푸터 */}
      <footer className="w-full max-w-4xl text-center py-2 text-xs text-slate-600 border-t border-slate-900 mt-2">
        INU Brick Breaking Game Service © 2026 인천대학교
      </footer>
    </div>
  );
}