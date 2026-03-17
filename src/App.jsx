import { useRef, useEffect, useState, useCallback } from 'react';
import { calculateAngle } from './utils/squatCounter';
import { saveResult } from './utils/db';
import Registration from './components/Registration';
import Leaderboard from './components/Leaderboard';

// Fallback POSE_CONNECTIONS in case CDN doesn't set window.POSE_CONNECTIONS
const FALLBACK_POSE_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,7],[0,4],[4,5],[5,6],[6,8],
  [9,10],[11,12],[11,13],[13,15],[15,17],[15,19],[15,21],
  [17,19],[12,14],[14,16],[16,18],[16,20],[16,22],[18,20],
  [11,23],[12,24],[23,24],[23,25],[24,26],[25,27],[26,28],
  [27,29],[28,30],[29,31],[30,32],[27,31],[28,32]
];

function App() {
  const baseUrl = import.meta.env.BASE_URL;
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const analysisCanvasRef = useRef(null);
  const poseRef = useRef(null);
  const streamRef = useRef(null);

  // Screens: 'register' | 'playing' | 'finished' | 'leaderboard'
  const [screen, setScreen] = useState('register');
  const [participant, setParticipant] = useState(null);
  const [count, setCount] = useState(0);
  const [stage, setStage] = useState('up');
  const [feedback, setFeedback] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [debugInfo, setDebugInfo] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [devMessages, setDevMessages] = useState([]);
  const [devMessageIndex, setDevMessageIndex] = useState(0);
  const [hasBag, setHasBag] = useState(false);
  const [finishReason, setFinishReason] = useState('');
  const [roundStarted, setRoundStarted] = useState(false);
  const [inactivityLeft, setInactivityLeft] = useState(30);

  // Refs for MediaPipe callback
  const stageRef = useRef('up');
  const screenRef = useRef('register');
  const hasBagRef = useRef(false);
  const roundStartedRef = useRef(false);
  const outOfViewSinceRef = useRef(null);
  const bagMissingSinceRef = useRef(null);
  const lastRepAtRef = useRef(Date.now());
  const bagConfidenceRef = useRef(0);
  const didAutoSaveRef = useRef(false);
  const hadBagDetectedRef = useRef(false);
  const readySinceRef = useRef(null);

  useEffect(() => { stageRef.current = stage; }, [stage]);
  useEffect(() => { screenRef.current = screen; }, [screen]);
  useEffect(() => { hasBagRef.current = hasBag; }, [hasBag]);
  useEffect(() => { roundStartedRef.current = roundStarted; }, [roundStarted]);

  // ---- Dynamic developer promo text from editable txt files ----
  useEffect(() => {
    const promoFiles = [
      `${baseUrl}dev-texts/promo-1.txt`,
      `${baseUrl}dev-texts/promo-2.txt`,
      `${baseUrl}dev-texts/promo-3.txt`,
    ];

    const loadPromoTexts = async () => {
      try {
        const results = await Promise.all(
          promoFiles.map(async (file) => {
            const response = await fetch(file);
            if (!response.ok) return '';
            return (await response.text()).trim();
          })
        );
        const filtered = results.filter(Boolean);
        if (filtered.length > 0) {
          setDevMessages(filtered);
        }
      } catch (err) {
        // Keep fallback static text if txt files are not available.
      }
    };

    loadPromoTexts();
  }, [baseUrl]);

  useEffect(() => {
    if (devMessages.length <= 1) return;
    const timer = setInterval(() => {
      setDevMessageIndex((prev) => (prev + 1) % devMessages.length);
    }, 5000);

    return () => clearInterval(timer);
  }, [devMessages]);

  // ---- Timer / Stopwatch ----
  useEffect(() => {
    let timer;
    if (screen === 'playing' && roundStarted) {
      timer = setInterval(() => {
        setElapsed((prev) => prev + 1);

        // Auto-finish if no squat counted for 30 seconds (only while participant is visible)
        const noRepMs = Date.now() - lastRepAtRef.current;
        const noRepLeft = Math.max(0, 30 - Math.floor(noRepMs / 1000));
        setInactivityLeft(noRepLeft);

        if (!outOfViewSinceRef.current && !bagMissingSinceRef.current && noRepMs >= 30000) {
          setTimeout(() => finishGame('Нет приседаний 30 секунд'), 0);
          return;
        }

        if (!outOfViewSinceRef.current && !bagMissingSinceRef.current && noRepLeft <= 10 && noRepLeft > 0 && stageRef.current === 'up') {
          setFeedback(`Сделайте приседание: ${noRepLeft}с до автозавершения`);
        }
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [screen, roundStarted]);

  // ---- Finish game ----
  const finishGame = useCallback((reason = '') => {
    if (screenRef.current !== 'playing') return;
    setFinishReason(reason);
    setScreen('finished');
  }, []);

  // ---- MediaPipe results handler ----
  const onResults = useCallback((results) => {
    if (!canvasRef.current || !videoRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (results.poseLandmarks) {
      const connections = window.POSE_CONNECTIONS || FALLBACK_POSE_CONNECTIONS;

      // Draw skeleton
      if (window.drawConnectors) {
        window.drawConnectors(ctx, results.poseLandmarks, connections, {
          color: '#22C55E', lineWidth: 3,
        });
      } else {
        // Manual fallback drawing
        ctx.strokeStyle = '#22C55E';
        ctx.lineWidth = 3;
        for (const [i, j] of connections) {
          const a = results.poseLandmarks[i];
          const b = results.poseLandmarks[j];
          if (a && b) {
            ctx.beginPath();
            ctx.moveTo(a.x * canvas.width, a.y * canvas.height);
            ctx.lineTo(b.x * canvas.width, b.y * canvas.height);
            ctx.stroke();
          }
        }
      }

      if (window.drawLandmarks) {
        window.drawLandmarks(ctx, results.poseLandmarks, {
          color: '#EF4444', lineWidth: 1, radius: 4,
        });
      } else {
        // Manual fallback
        ctx.fillStyle = '#EF4444';
        for (const lm of results.poseLandmarks) {
          ctx.beginPath();
          ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 4, 0, 2 * Math.PI);
          ctx.fill();
        }
      }

      // Squat logic
      if (screenRef.current === 'playing') {
        try {
          const lm = results.poseLandmarks;

          const trackedVisibility = [11, 12, 23, 24, 25, 26, 27, 28]
            .map((i) => lm[i]?.visibility || 0)
            .reduce((sum, v) => sum + v, 0) / 8;

          // Visibility checks for preparation and active phase
          if (trackedVisibility < 0.45) {
            readySinceRef.current = null;
            if (!roundStartedRef.current) {
              setFeedback('Встаньте в полный рост и полностью войдите в кадр');
              return;
            }

            if (!outOfViewSinceRef.current) outOfViewSinceRef.current = Date.now();
            const outMs = Date.now() - outOfViewSinceRef.current;
            const outLeft = Math.max(0, 30 - Math.floor(outMs / 1000));
            bagMissingSinceRef.current = null;
            if (outMs >= 30000) {
              finishGame('Участник вышел из поля видимости');
              return;
            }
            setFeedback(`Вернитесь в кадр: ${outLeft}с до автозавершения`);
            return;
          }
          outOfViewSinceRef.current = null;

          // Red bag detection in ROI above shoulders
          const shoulderVis = Math.min(lm[11].visibility || 0, lm[12].visibility || 0);
          if (shoulderVis > 0.5 && analysisCanvasRef.current) {
            const analysisCanvas = analysisCanvasRef.current;
            const aCtx = analysisCanvas.getContext('2d', { willReadFrequently: true });
            const shoulderCx = ((lm[11].x + lm[12].x) / 2) * canvas.width;
            const shoulderCy = ((lm[11].y + lm[12].y) / 2) * canvas.height;
            const shoulderWidth = Math.abs(lm[12].x - lm[11].x) * canvas.width;
            const roiW = Math.max(40, shoulderWidth * 2.1);
            const roiH = Math.max(28, shoulderWidth * 0.95);
            const roiX = Math.max(0, Math.min(canvas.width - roiW, shoulderCx - roiW / 2));
            const roiY = Math.max(0, Math.min(canvas.height - roiH, shoulderCy - roiH * 0.75));

            analysisCanvas.width = 64;
            analysisCanvas.height = 36;
            aCtx.drawImage(video, roiX, roiY, roiW, roiH, 0, 0, 64, 36);

            const pixels = aCtx.getImageData(0, 0, 64, 36).data;
            let redPixels = 0;
            for (let i = 0; i < pixels.length; i += 4) {
              const r = pixels[i];
              const g = pixels[i + 1];
              const b = pixels[i + 2];
              const max = Math.max(r, g, b);
              const min = Math.min(r, g, b);
              const strongRed = r > 120 && r > g * 1.35 && r > b * 1.35;
              const saturated = (max - min) > 45;
              if (strongRed && saturated) redPixels += 1;
            }

            const redRatio = redPixels / (64 * 36);
            const frameSignal = redRatio > 0.08 ? 1 : 0;
            bagConfidenceRef.current = bagConfidenceRef.current * 0.85 + frameSignal * 0.15;

            if (!hasBagRef.current && bagConfidenceRef.current > 0.6) {
              hadBagDetectedRef.current = true;
              bagMissingSinceRef.current = null;
              setHasBag(true);
            }
            if (hasBagRef.current && bagConfidenceRef.current < 0.4) setHasBag(false);

            // ROI debug rectangle (yellow when bag detected, red otherwise)
            ctx.strokeStyle = hasBagRef.current ? '#FBBF24' : '#EF4444';
            ctx.lineWidth = 2;
            ctx.strokeRect(roiX, roiY, roiW, roiH);
          }

          // Use minimum visibility across hip/knee/ankle for each side
          const leftVis = Math.min(lm[23].visibility, lm[25].visibility, lm[27].visibility);
          const rightVis = Math.min(lm[24].visibility, lm[26].visibility, lm[28].visibility);

          const fullBodyVisible = trackedVisibility >= 0.6 && leftVis > 0.5 && rightVis > 0.5;

          // Preparation phase: full body + bag on shoulders, then start
          if (!roundStartedRef.current) {
            if (!fullBodyVisible) {
              readySinceRef.current = null;
              setFeedback('Встаньте в полный рост: голова, корпус и ноги должны быть в кадре');
              return;
            }

            if (!hasBagRef.current) {
              readySinceRef.current = null;
              setFeedback('Поднимите красный мешок на плечи для старта');
              return;
            }

            if (!readySinceRef.current) readySinceRef.current = Date.now();
            const readyMs = Date.now() - readySinceRef.current;
            const secToStart = Math.max(0, 3 - Math.floor(readyMs / 1000));

            if (readyMs < 3000) {
              setFeedback(`Готовность подтверждена. START через ${secToStart}...`);
              return;
            }

            setRoundStarted(true);
            roundStartedRef.current = true;
            lastRepAtRef.current = Date.now();
            setFeedback('✅ START! Начинайте приседать');
            return;
          }

          if (leftVis > 0.5 && rightVis > 0.5) {
            const leftAngle  = calculateAngle(lm[23], lm[25], lm[27]);
            const rightAngle = calculateAngle(lm[24], lm[26], lm[28]);
            const avgAngle   = (leftAngle + rightAngle) / 2;

            // Anti-cheat: if one ankle is significantly higher than the other → leg raise
            const ankleYDiff = Math.abs(lm[27].y - lm[28].y);
            const legRaised  = ankleYDiff > 0.13;

            // Draw avg angle text near mid-knees
            const mkx = ((lm[25].x + lm[26].x) / 2) * canvas.width + 15;
            const mky = ((lm[25].y + lm[26].y) / 2) * canvas.height;
            ctx.font = 'bold 24px Inter, sans-serif';
            ctx.fillStyle = '#FBBF24';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 3;
            // Canvas itself is mirrored in CSS, so flip text locally back to normal.
            ctx.save();
            ctx.translate(mkx, mky);
            ctx.scale(-1, 1);
            ctx.strokeText(Math.round(avgAngle) + '°', 0, 0);
            ctx.fillText(Math.round(avgAngle) + '°', 0, 0);
            ctx.restore();

            if (!hasBagRef.current) {
              if (hadBagDetectedRef.current) {
                setFeedback('⚠️ Мешок сброшен. Попытка завершена');
                finishGame('Мешок сброшен во время попытки');
              } else {
                setFeedback('Поднимите красный мешок на плечи');
              }
              return;
            }
            bagMissingSinceRef.current = null;

            // State machine — both legs must participate
            if (leftAngle > 155 && rightAngle > 155) {
              // Both legs straight → standing
              if (stageRef.current === 'down') {
                stageRef.current = 'up';
                setStage('up');
                setCount((prev) => {
                  const next = prev + 1;
                  lastRepAtRef.current = Date.now();
                  setInactivityLeft(30);
                  return next;
                });
                setFeedback('Отлично! Продолжай!');
              } else {
                setFeedback('Можно приседать');
              }
            } else if (leftAngle < 110 && rightAngle < 110) {
              // Both knees bent → valid squat depth
              if (legRaised) {
                setFeedback('❌ Не поднимай ногу!');
              } else {
                stageRef.current = 'down';
                setStage('down');
                setFeedback('Хорошо! Вставай!');
              }
            } else if (legRaised) {
              setFeedback('❌ Не поднимай ногу!');
            } else if (stageRef.current === 'up') {
              setFeedback('Глубже!');
            }
          } else {
            setFeedback('Встаньте в полный рост и покажите ноги полностью');
          }
        } catch (err) {
          console.error('Pose error:', err);
        }
      }
    } else if (screenRef.current === 'playing') {
      readySinceRef.current = null;
      if (!roundStartedRef.current) {
        setFeedback('Не вижу человека. Встаньте в полный рост для старта');
      } else {
        if (!outOfViewSinceRef.current) outOfViewSinceRef.current = Date.now();
        const outMs = Date.now() - outOfViewSinceRef.current;
        const outLeft = Math.max(0, 30 - Math.floor(outMs / 1000));
        bagMissingSinceRef.current = null;
        if (outMs >= 30000) {
          finishGame('Участник вышел из поля видимости');
        } else {
          setFeedback(`Не вижу участника. Вернитесь в кадр: ${outLeft}с`);
        }
      }
    }
    ctx.restore();
  }, [finishGame]);

  // ---- Auto-save result on finish ----
  useEffect(() => {
    if (screen !== 'finished' || !participant || didAutoSaveRef.current) return;

    const saveAndGoLeaderboard = async () => {
      setIsSaving(true);
      const today = new Date().toISOString().slice(0, 10);
      const result = {
        name: participant.name,
        photo: participant.photo,
        score: count,
        elapsed,
        hasBag,
        finishReason,
        date: today,
        timestamp: Date.now(),
      };
      try {
        await saveResult(result);
        didAutoSaveRef.current = true;
        setTimeout(() => setScreen('leaderboard'), 8000);
      } catch (err) {
        console.error(err);
      } finally {
        setIsSaving(false);
      }
    };

    saveAndGoLeaderboard();
  }, [screen, participant, count, elapsed, hasBag, finishReason]);

  // ---- Initialize camera + MediaPipe (runs ONCE) ----
  useEffect(() => {
    let animationId = null;
    let isRunning = true;

    const initPose = async () => {
      setDebugInfo('Загрузка MediaPipe...');

      // Wait for Pose to load from CDN
      await new Promise((resolve, reject) => {
        let attempts = 0;
        const check = () => {
          attempts++;
          if (window.Pose) resolve();
          else if (attempts > 150) reject(new Error('MediaPipe Pose не загрузился'));
          else setTimeout(check, 200);
        };
        check();
      });

      setDebugInfo('MediaPipe загружен. Настройка...');
      console.log('✅ MediaPipe Pose loaded');
      console.log('drawConnectors:', typeof window.drawConnectors);
      console.log('drawLandmarks:', typeof window.drawLandmarks);
      console.log('POSE_CONNECTIONS:', !!window.POSE_CONNECTIONS);

      const pose = new window.Pose({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
      });

      pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        smoothSegmentation: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      pose.onResults(onResults);
      poseRef.current = pose;

      setDebugInfo('Подключение камеры...');

      // Access webcam
      const video = videoRef.current;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      streamRef.current = stream;
      video.srcObject = stream;

      await new Promise((resolve) => {
        video.onloadedmetadata = () => {
          video.play();
          resolve();
        };
      });

      console.log('✅ Camera ready:', video.videoWidth, 'x', video.videoHeight);
      setDebugInfo('');
      setIsLoading(false);
      setCameraReady(true);

      // Send frames ~15fps
      let lastTime = 0;
      const sendFrame = async (timestamp) => {
        if (!isRunning) return;
        if (timestamp - lastTime > 66) {
          lastTime = timestamp;
          try {
            if (video.readyState >= 2) {
              await pose.send({ image: video });
            }
          } catch (err) {
            // Silently skip frame errors
          }
        }
        animationId = requestAnimationFrame(sendFrame);
      };
      animationId = requestAnimationFrame(sendFrame);
    };

    initPose().catch((err) => {
      console.error('Init error:', err);
      setDebugInfo('Ошибка: ' + err.message);
      setIsLoading(false);
      setFeedback('Ошибка камеры. Разреши доступ и перезагрузи.');
    });

    return () => {
      isRunning = false;
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, [onResults]);

  // ---- Handlers ----
  const handleRegister = (data) => {
    setParticipant(data);
    setCount(0);
    setElapsed(0);
    setStage('up');
    setRoundStarted(false);
    setHasBag(false);
    setInactivityLeft(30);
    hasBagRef.current = false;
    roundStartedRef.current = false;
    bagConfidenceRef.current = 0;
    hadBagDetectedRef.current = false;
    readySinceRef.current = null;
    outOfViewSinceRef.current = null;
    bagMissingSinceRef.current = null;
    lastRepAtRef.current = Date.now();
    didAutoSaveRef.current = false;
    setFinishReason('');
    stageRef.current = 'up';
    setFeedback('Подготовка: встаньте в полный рост и поднимите красный мешок на плечи');
    setScreen('playing');
  };

  const handleNewParticipant = () => {
    setParticipant(null);
    setCount(0);
    setElapsed(0);
    setStage('up');
    setRoundStarted(false);
    stageRef.current = 'up';
    setFeedback('');
    setHasBag(false);
    setInactivityLeft(30);
    roundStartedRef.current = false;
    bagConfidenceRef.current = 0;
    hadBagDetectedRef.current = false;
    readySinceRef.current = null;
    outOfViewSinceRef.current = null;
    bagMissingSinceRef.current = null;
    lastRepAtRef.current = Date.now();
    didAutoSaveRef.current = false;
    setFinishReason('');
    setScreen('register');
  };

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}:${String(sec).padStart(2, '0')}` : `${sec}с`;
  };

  const getFeedbackClass = () => {
    if (feedback.includes('❌')) return 'cheat';
    if (feedback.includes('Не вижу') || feedback.includes('Вернитесь') || feedback.includes('Надень') || feedback.includes('сброшен') || feedback.includes('автозавершения')) return 'cheat';
    if (feedback.includes('Отлично') || feedback.includes('Хорошо')) return 'good';
    if (feedback.includes('Глубже')) return 'deeper';
    if (feedback.includes('Вставай')) return 'stand';
    return 'neutral';
  };

  const getCenterBannerClass = () => {
    if (feedback.includes('START')) return 'start';
    if (feedback.includes('автозавершения') || feedback.includes('Не вижу') || feedback.includes('Вернитесь')) return 'danger';
    if (feedback.includes('мешок') || feedback.includes('Мешок') || feedback.includes('Надень')) return 'warning';
    if (feedback.includes('Подготовка') || feedback.includes('полный рост')) return 'info';
    return 'default';
  };

  const showCenterBanner =
    screen === 'playing' && (
      feedback.includes('START') ||
      feedback.includes('автозавершения') ||
      feedback.includes('Не вижу') ||
      feedback.includes('Вернитесь') ||
      feedback.includes('мешок') ||
      feedback.includes('Мешок') ||
      feedback.includes('Надень') ||
      feedback.includes('полный рост') ||
      feedback.includes('Подготовка')
    );

  const showInactivityCountdown =
    screen === 'playing' &&
    roundStarted &&
    !outOfViewSinceRef.current &&
    !bagMissingSinceRef.current &&
    stage === 'up' &&
    inactivityLeft < 10 &&
    inactivityLeft > 0;

  return (
    <div className="app">
      <header className="header no-print">
        <h1>Қой көтеру сайысы</h1>
        <p>Состязание по приседаниям — Наурыз мейрамы 🐏</p>
      </header>

      {/* Leaderboard - full width, camera hidden */}
      {screen === 'leaderboard' && (
        <Leaderboard onNewParticipant={handleNewParticipant} />
      )}

      {/* Camera + Sidebar for non-leaderboard screens */}
      <div className="main-content" style={{ display: screen === 'leaderboard' ? 'none' : '' }}>
        {/* Camera — ALWAYS mounted, never removed from DOM */}
        <div className={`camera-container ${screen === 'register' ? 'camera-register-focus' : ''}`}>
          <video ref={videoRef} playsInline muted />
          <canvas ref={canvasRef} />

          {/* Loading */}
          {isLoading && (
            <div className="loading-overlay">
              <div className="spinner" />
              <span className="loading-text">
                {debugInfo || 'Загрузка модели...'}
              </span>
            </div>
          )}

          {/* HUD during game */}
          {screen === 'playing' && (
            <>
              <div className="hud">
                <div className="hud-item">
                  <div className="label">Счет</div>
                  <div className="value gold">{count}</div>
                </div>
                <div className="hud-item">
                  <div className="label">{roundStarted ? 'Время' : 'Этап'}</div>
                  <div className="value" style={{ fontSize: roundStarted ? '2.2rem' : '1rem' }}>
                    {roundStarted ? formatTime(elapsed) : 'Подготовка'}
                  </div>
                </div>
                <div className="hud-item">
                  <div className="label">Автостоп</div>
                  <div
                    className={`value ${roundStarted && !outOfViewSinceRef.current && !bagMissingSinceRef.current && inactivityLeft <= 10 ? 'warning' : ''}`}
                    style={{ fontSize: roundStarted ? '1.4rem' : '1rem' }}
                  >
                    {!roundStarted
                      ? 'Ждет START'
                      : outOfViewSinceRef.current
                        ? 'Нет в кадре'
                        : bagMissingSinceRef.current
                          ? 'Нет мешка'
                          : `${inactivityLeft}с`}
                  </div>
                </div>
              </div>

              <div className="participant-badge">
                {participant?.photo && <img src={participant.photo} alt="" className="badge-photo" />}
                <span>{participant?.name}</span>
              </div>

              <div className="feedback-bar">
                <span className={`feedback-text ${getFeedbackClass()}`}>{feedback}</span>
              </div>

              {showCenterBanner && (
                <div className={`center-banner ${getCenterBannerClass()}`}>
                  {feedback}
                </div>
              )}

              {showInactivityCountdown && (
                <div className="countdown-overlay">
                  <div className="countdown-label">Продолжайте приседать</div>
                  <div className="countdown-text">Попытка закончится через</div>
                  <div className="countdown-number">{inactivityLeft}</div>
                  <div className="countdown-subtitle">секунд</div>
                </div>
              )}

            </>
          )}

          {/* Registration Overlay — camera visible behind it */}
          {screen === 'register' && cameraReady && (
            <Registration onRegister={handleRegister} videoRef={videoRef} />
          )}

          <canvas ref={analysisCanvasRef} style={{ display: 'none' }} />

          {/* Finished Overlay */}
          {screen === 'finished' && (
            <div className="start-overlay">
              <div className="registration-card">
                <h2>🎉 Финиш!</h2>
                <div style={{ textAlign: 'center' }}>
                  <p className="finish-score">{count}</p>
                  <p className="finish-label">приседаний за {formatTime(elapsed)}</p>
                  <p className="finish-name">{participant?.name}</p>
                  <p style={{ marginTop: '8px', fontSize: '1rem', color: hasBag ? 'var(--gold)' : 'var(--text-secondary)' }}>
                    {hasBag ? '🐏 С мешком на плечах' : '🚫 Без мешка'}
                  </p>
                  {finishReason && (
                    <p style={{ marginTop: '8px', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
                      {finishReason}
                    </p>
                  )}
                  <p style={{ marginTop: '12px', fontSize: '0.95rem', color: 'var(--teal-light)' }}>
                    {isSaving ? 'Сохраняем результат...' : 'Результат сохранен автоматически. Экран закроется через несколько секунд.'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="sidebar">
          {screen === 'playing' ? (
            <div className="panel stats-panel">
              <div>
                <p className="current-score-label">Текущий счет</p>
                <p className="current-score-number">{count}</p>
              </div>
              <div className="status-box">
                <p className="status-label">Статус</p>
                <p className="status-value">{stage === 'up' ? '🧍 СТОИМ' : '🏋️ ПРИСЕД'}</p>
              </div>
              <div className="status-box">
                <p className="status-label">Участник</p>
                <p className="status-value" style={{ fontSize: '1.2rem' }}>{participant?.name}</p>
              </div>
              <div className="status-box">
                <p className="status-label">Режим</p>
                <p className="status-value" style={{ fontSize: '1rem' }}>
                  ♾️ Открытый
                </p>
              </div>
              <div className="status-box">
                <p className="status-label">До автостопа</p>
                <p className="status-value" style={{ fontSize: '1rem' }}>
                  {!roundStarted
                    ? 'Ожидание старта'
                    : outOfViewSinceRef.current
                      ? 'Пауза: нет в кадре'
                      : bagMissingSinceRef.current
                        ? 'Пауза: нет мешка'
                        : `${inactivityLeft}с без приседания`}
                </p>
              </div>
            </div>
          ) : screen === 'register' ? (
            <div className="panel">
              <h3 style={{ color: 'var(--gold)', marginBottom: '12px', fontSize: '1.3rem' }}>📋 Инструкция</h3>
              <ol className="instructions-list">
                <li>Введите ФИО участника</li>
                <li>Сделайте фото участника!</li>
                <li>Участник встает перед камерой в полный рост</li>
                <li>Встаньте боком к камере для лучшей работы компьютерного зрения</li>
                <li>На плечах должен быть красный мешок</li>
                <li>Приседайте глубоко — бедро ниже колена!</li>
              </ol>
              <button onClick={() => setScreen('leaderboard')} className="btn-action" style={{ marginTop: '20px', width: '100%' }}>
                🏆 Посмотреть лидерборд
              </button>
            </div>
          ) : null}

          {/* Developer Info */}
          <div className="dev-info">
            <img src={`${baseUrl}Logo.png`} alt="Juniors.kz" className="dev-logo" />
            <div className="dev-text">
              <p className="dev-title">Разработка приложения:</p>
              <p><strong>Школа "Juniors.kz"</strong></p>
              <p key={devMessageIndex} className="dev-rotating-text">
                {devMessages[devMessageIndex] || 'Готовим будущих разработчиков и помогаем бизнесу с digital-проектами.'}
              </p>
              <p>📍 г. Кокшетау, пр. Назарбаева 17а</p>
              <p>📞 <a href="tel:+77016713696" style={{color: 'inherit'}}>+7 701 671 3696</a></p>
              <p>📸 <a href="https://instagram.com/juniors.kz" target="_blank" rel="noreferrer" style={{color: 'inherit'}}>@juniors.kz</a> &nbsp;|&nbsp; 🌐 <a href="https://juniors.kz" target="_blank" rel="noreferrer" style={{color: 'inherit'}}>juniors.kz</a></p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default App;
