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
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const poseRef = useRef(null);
  const streamRef = useRef(null);

  // Screens: 'register' | 'playing' | 'finished' | 'leaderboard'
  const [screen, setScreen] = useState('register');
  const [participant, setParticipant] = useState(null);
  const [count, setCount] = useState(0);
  const [stage, setStage] = useState('up');
  const [feedback, setFeedback] = useState('');
  const [timeLeft, setTimeLeft] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [debugInfo, setDebugInfo] = useState('');
  const [comment, setComment] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Refs for MediaPipe callback
  const stageRef = useRef('up');
  const screenRef = useRef('register');

  useEffect(() => { stageRef.current = stage; }, [stage]);
  useEffect(() => { screenRef.current = screen; }, [screen]);

  // ---- Timer / Stopwatch ----
  useEffect(() => {
    let timer;
    if (screen === 'playing') {
      timer = setInterval(() => {
        setElapsed((prev) => prev + 1);
        if (participant?.mode === 'timed') {
          setTimeLeft((prev) => {
            if (prev <= 1) {
              setTimeout(() => finishGame(), 0);
              return 0;
            }
            return prev - 1;
          });
        }
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [screen, participant]);

  // ---- Finish game ----
  const finishGame = useCallback(() => {
    setScreen('finished');
  }, []);

  // ---- Save result manually ----
  const handleSaveResult = async () => {
    if (!participant) return;
    setIsSaving(true);
    const today = new Date().toISOString().slice(0, 10);
    const result = {
      name: participant.name,
      photo: participant.photo,
      score: count,
      elapsed,
      mode: participant.mode,
      timeLimit: participant.timeLimit,
      comment: comment.trim(),
      date: today,
      timestamp: Date.now(),
    };
    try {
      await saveResult(result);
      console.log('Result saved!');
      setScreen('leaderboard');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

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
          const leftVis = (lm[23].visibility + lm[25].visibility + lm[27].visibility) / 3;
          const rightVis = (lm[24].visibility + lm[26].visibility + lm[28].visibility) / 3;

          let hip, knee, ankle;
          if (leftVis > rightVis) {
            hip = lm[23]; knee = lm[25]; ankle = lm[27];
          } else {
            hip = lm[24]; knee = lm[26]; ankle = lm[28];
          }

          if (hip.visibility > 0.5 && knee.visibility > 0.5 && ankle.visibility > 0.5) {
            const angle = calculateAngle(hip, knee, ankle);

            // Draw angle text near knee
            ctx.font = 'bold 24px Inter, sans-serif';
            ctx.fillStyle = '#FBBF24';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 3;
            const tx = knee.x * canvas.width + 15;
            const ty = knee.y * canvas.height;
            ctx.strokeText(Math.round(angle) + '°', tx, ty);
            ctx.fillText(Math.round(angle) + '°', tx, ty);

            // State machine
            if (angle > 160) {
              if (stageRef.current === 'down') {
                stageRef.current = 'up';
                setStage('up');
                setCount((prev) => prev + 1);
                setFeedback('Отлично! Продолжай!');
              } else {
                setFeedback('Можно приседать');
              }
            } else if (angle < 100) {
              stageRef.current = 'down';
              setStage('down');
              setFeedback('Хорошо! Вставай!');
            } else if (stageRef.current === 'up') {
              setFeedback('Глубже!');
            }
          } else {
            setFeedback('Покажи ноги полностью');
          }
        } catch (err) {
          console.error('Pose error:', err);
        }
      }
    }
    ctx.restore();
  }, []);

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
    setComment('');
    stageRef.current = 'up';
    setTimeLeft(data.mode === 'timed' ? data.timeLimit : null);
    setFeedback('Время пошло! Приседай!');
    setScreen('playing');
  };

  const handleNewParticipant = () => {
    setParticipant(null);
    setCount(0);
    setElapsed(0);
    setStage('up');
    stageRef.current = 'up';
    setFeedback('');
    setComment('');
    setScreen('register');
  };

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}:${String(sec).padStart(2, '0')}` : `${sec}с`;
  };

  const getFeedbackClass = () => {
    if (feedback.includes('Отлично') || feedback.includes('Хорошо')) return 'good';
    if (feedback.includes('Глубже')) return 'deeper';
    if (feedback.includes('Вставай')) return 'stand';
    return 'neutral';
  };

  return (
    <div className="app">
      <header className="header no-print">
        <h1>Қошқар Көтеру</h1>
        <p>Состязание по приседаниям — Наурыз мейрамы 🐏</p>
      </header>

      {/* Leaderboard - full width, camera hidden */}
      {screen === 'leaderboard' && (
        <Leaderboard onNewParticipant={handleNewParticipant} />
      )}

      {/* Camera + Sidebar for non-leaderboard screens */}
      <div className="main-content" style={{ display: screen === 'leaderboard' ? 'none' : '' }}>
        {/* Camera — ALWAYS mounted, never removed from DOM */}
        <div className="camera-container">
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
                {participant?.mode === 'timed' ? (
                  <div className="hud-item">
                    <div className="label">Осталось</div>
                    <div className={`value ${timeLeft <= 10 ? 'warning' : ''}`}>{timeLeft}с</div>
                  </div>
                ) : (
                  <div className="hud-item">
                    <div className="label">Время</div>
                    <div className="value">{formatTime(elapsed)}</div>
                  </div>
                )}
              </div>

              <div className="participant-badge">
                {participant?.photo && <img src={participant.photo} alt="" className="badge-photo" />}
                <span>{participant?.name}</span>
              </div>

              <div className="feedback-bar">
                <span className={`feedback-text ${getFeedbackClass()}`}>{feedback}</span>
              </div>
            </>
          )}

          {/* Registration Overlay — camera visible behind it */}
          {screen === 'register' && cameraReady && (
            <Registration onRegister={handleRegister} videoRef={videoRef} />
          )}

          {/* Finished Overlay */}
          {screen === 'finished' && (
            <div className="start-overlay">
              <div className="registration-card">
                <h2>🎉 Финиш!</h2>
                <div style={{ textAlign: 'center' }}>
                  <p className="finish-score">{count}</p>
                  <p className="finish-label">приседаний за {formatTime(elapsed)}</p>
                  <p className="finish-name">{participant?.name}</p>
                </div>
                
                <div className="form-group" style={{ marginTop: '20px', textAlign: 'left' }}>
                  <label>Комментарий судьи (опционально)</label>
                  <textarea 
                    className="input-field" 
                    placeholder="Например: Спорный момент на 10-м приседании..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows="3"
                    style={{ resize: 'none', height: 'auto' }}
                  />
                </div>

                <button 
                  onClick={handleSaveResult} 
                  className="btn-start" 
                  disabled={isSaving}
                >
                  {isSaving ? 'Сохранение...' : '💾 Сохранить результат'}
                </button>
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
                  {participant?.mode === 'timed' ? `⏱️ ${participant.timeLimit}с` : '♾️ Свободный'}
                </p>
              </div>
              <button onClick={() => finishGame()} className="btn-stop">
                ⏹️ Завершить досрочно
              </button>
            </div>
          ) : screen === 'register' ? (
            <div className="panel">
              <h3 style={{ color: 'var(--gold)', marginBottom: '12px', fontSize: '1.3rem' }}>📋 Инструкция</h3>
              <ol className="instructions-list">
                <li>Введи свое имя</li>
                <li>Сделай фото — камера прямо перед тобой!</li>
                <li>Выбери режим: на время или свободный</li>
                <li>Встань перед камерой в полный рост</li>
                <li>Присядь глубоко — бедро ниже колена!</li>
              </ol>
              <button onClick={() => setScreen('leaderboard')} className="btn-action" style={{ marginTop: '20px', width: '100%' }}>
                🏆 Посмотреть лидерборд
              </button>
            </div>
          ) : null}

          {/* Developer Info */}
          <div className="dev-info">
            <img src="/Logo.png" alt="Juniors.kz" className="dev-logo" />
            <div className="dev-text">
              <p className="dev-title">Разработка приложения:</p>
              <p><strong>Школа "Juniors.kz"</strong></p>
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
