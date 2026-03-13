import { useState, useRef, useEffect } from 'react';

const Registration = ({ onRegister, videoRef }) => {
  const [name, setName] = useState('');
  const [mode, setMode] = useState('timed');
  const [timeLimit, setTimeLimit] = useState(60);
  const [photo, setPhoto] = useState(null);
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
    if (!name.trim()) return;
    // If no photo taken, auto-capture one
    if (!photo) takePhoto();
    
    onRegister({
      name: name.trim(),
      mode,
      timeLimit: mode === 'timed' ? timeLimit : null,
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

        {/* Name */}
        <div className="form-group">
          <label htmlFor="participant-name">Имя участника</label>
          <input
            id="participant-name"
            type="text"
            placeholder="Введите имя..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-field"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleStart()}
          />
        </div>

        {/* Mode */}
        <div className="form-group">
          <label>Режим игры</label>
          <div className="mode-selector">
            <button
              type="button"
              className={`mode-btn ${mode === 'timed' ? 'active' : ''}`}
              onClick={() => setMode('timed')}
            >
              ⏱️ На время
            </button>
            <button
              type="button"
              className={`mode-btn ${mode === 'open' ? 'active' : ''}`}
              onClick={() => setMode('open')}
            >
              ♾️ Свободный
            </button>
          </div>
        </div>

        {mode === 'timed' && (
          <div className="form-group">
            <label>Время (секунды)</label>
            <div className="time-presets">
              {[30, 60, 90, 120].map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`preset-btn ${timeLimit === t ? 'active' : ''}`}
                  onClick={() => setTimeLimit(t)}
                >
                  {t}с
                </button>
              ))}
            </div>
          </div>
        )}

        <button onClick={handleStart} className="btn-start" disabled={!name.trim()}>
          🚀 Начать состязание
        </button>
      </div>

      <canvas ref={photoCanvasRef} style={{ display: 'none' }} />
    </div>
  );
};

export default Registration;
