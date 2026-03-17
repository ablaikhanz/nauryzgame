import { useState, useRef, useEffect } from 'react';

const Registration = ({ onRegister, videoRef }) => {
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState(null);
  const [agreedToRules, setAgreedToRules] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const photoCanvasRef = useRef(null);
  const previewCanvasRef = useRef(null);

  // Live preview — draw the camera feed into a small circular canvas
  useEffect(() => {
    let animId;
    const drawPreview = () => {
      if (previewCanvasRef.current && videoRef.current && videoRef.current.readyState >= 2) {
        const canvas = previewCanvasRef.current;
        const ctx = canvas.getContext('2d');
        const video = videoRef.current;

        canvas.width = 160;
        canvas.height = 160;

        const size = Math.min(video.videoWidth, video.videoHeight);
        const sx = (video.videoWidth - size) / 2;
        const sy = (video.videoHeight - size) / 2;

        ctx.save();
        // Clip to circle
        ctx.beginPath();
        ctx.arc(80, 80, 80, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        // Mirror
        ctx.translate(160, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, sx, sy, size, size, 0, 0, 160, 160);
        ctx.restore();
      }
      animId = requestAnimationFrame(drawPreview);
    };
    animId = requestAnimationFrame(drawPreview);
    return () => cancelAnimationFrame(animId);
  }, [videoRef]);

  const takePhoto = () => {
    if (!videoRef.current || videoRef.current.readyState < 2) return;
    const video = videoRef.current;
    const canvas = photoCanvasRef.current;
    canvas.width = 200;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');

    const size = Math.min(video.videoWidth, video.videoHeight);
    const sx = (video.videoWidth - size) / 2;
    const sy = (video.videoHeight - size) / 2;
    ctx.save();
    ctx.translate(200, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, size, size, 0, 0, 200, 200);
    ctx.restore();

    setPhoto(canvas.toDataURL('image/jpeg', 0.85));
  };

  const handlePhotoAction = () => {
    if (photo) {
      setPhoto(null);
    } else {
      takePhoto();
    }
  };

  const handleStart = () => {
    if (!name.trim() || !agreedToRules) return;
    // If no photo taken, auto-capture one
    if (!photo) takePhoto();
    
    onRegister({
      name: name.trim(),
      photo: photo || (photoCanvasRef.current ? photoCanvasRef.current.toDataURL('image/jpeg', 0.85) : null),
    });
  };

  return (
    <div className="registration-overlay">
      <div className="registration-card">
        <h2>👤 Регистрация участника</h2>

        {/* Live Photo Preview */}
        <div className="photo-section">
          <div className="photo-live-wrapper">
            {photo ? (
              <img src={photo} alt="participant" className="photo-preview" />
            ) : (
              <canvas ref={previewCanvasRef} className="photo-preview-canvas" />
            )}
            <div className="photo-live-label">
              {photo ? '✅ Фото готово' : '📸 Живое превью'}
            </div>
          </div>
          <div className="photo-buttons">
            <button onClick={handlePhotoAction} className="btn-photo" type="button">
              {photo ? '🔄 Переснять' : '📸 Сделать фото'}
            </button>
          </div>
        </div>

        {/* Full Name */}
        <div className="form-group">
          <label htmlFor="participant-name">ФИО участника</label>
          <input
            id="participant-name"
            type="text"
            placeholder="Введите ФИО..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-field"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleStart()}
          />
        </div>

        <div className="rules-summary">
          <p className="rules-summary-text">
            Перед стартом участник должен открыть правила, внимательно их прочитать и подтвердить согласие.
          </p>
          <button type="button" className="btn-action rules-open-btn" onClick={() => setIsRulesOpen(true)}>
            📋 Прочитать правила
          </button>
          <label className="rules-checkbox compact">
            <input
              type="checkbox"
              checked={agreedToRules}
              onChange={(e) => setAgreedToRules(e.target.checked)}
            />
            <span>Я прочитал(а) правила и согласен(на) с ними.</span>
          </label>
        </div>

        <button onClick={handleStart} className="btn-start" disabled={!name.trim() || !agreedToRules}>
          🚀 Начать состязание
        </button>

        {isRulesOpen && (
          <div className="rules-modal-backdrop" onClick={() => setIsRulesOpen(false)}>
            <div className="rules-modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="rules-modal-title">Правила участия</h3>
              <ol className="rules-list">
                <li>Встаньте боком к камере в полный рост: голова, корпус, колени и стопы должны быть видны в кадре.</li>
                <li>Красный мешок должен лежать на плечах до старта и во время всей попытки.</li>
                <li>Старт начинается только после сигнала START на экране.</li>
                <li>Засчитываются только глубокие приседания: обе ноги работают, нельзя просто поднимать одну ногу.</li>
                <li>Если вы вышли из кадра на 30 секунд, попытка завершится автоматически.</li>
                <li>Если не делать приседания 30 секунд, попытка завершится автоматически.</li>
                <li>Если после старта мешок сброшен с плеч, попытка сразу завершается.</li>
                <li>После завершения попытки результат сохраняется автоматически.</li>
              </ol>
              <div className="rules-modal-actions">
                <button type="button" className="btn-action" onClick={() => setIsRulesOpen(false)}>
                  Закрыть
                </button>
                <button
                  type="button"
                  className="btn-action btn-action-primary"
                  onClick={() => {
                    setAgreedToRules(true);
                    setIsRulesOpen(false);
                  }}
                >
                  Прочитал(а) и согласен(на)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <canvas ref={photoCanvasRef} style={{ display: 'none' }} />
    </div>
  );
};

export default Registration;
