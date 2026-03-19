import { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';

const Registration = ({ onRegister, videoRef }) => {
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [photo, setPhoto] = useState(null);
  const [agreedToRules, setAgreedToRules] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [photoError, setPhotoError] = useState('');
  const photoCanvasRef = useRef(null);
  const previewCanvasRef = useRef(null);

  const formatPhoneMask = (value) => {
    let digits = value.replace(/\D/g, '');
    if (digits.startsWith('8')) digits = '7' + digits.slice(1);
    else if (!digits.startsWith('7') && digits.length > 0) digits = '7' + digits;
    digits = digits.slice(0, 11);
    let result = '+7';
    if (digits.length <= 1) return result;
    result += ' (' + digits.slice(1, Math.min(4, digits.length));
    if (digits.length < 4) return result;
    result += ') ' + digits.slice(4, Math.min(7, digits.length));
    if (digits.length < 7) return result;
    result += '-' + digits.slice(7, Math.min(9, digits.length));
    if (digits.length < 9) return result;
    result += '-' + digits.slice(9, 11);
    return result;
  };

  const handlePhoneChange = (e) => {
    if (phoneError) setPhoneError('');
    const formatted = formatPhoneMask(e.target.value);
    setPhone(formatted);
  };

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
    const digits = phone.replace(/\D/g, '');
    let hasError = false;

    if (digits.length < 11) {
      setPhoneError(t('phoneFormatError'));
      hasError = true;
    } else {
      setPhoneError('');
    }

    if (!photo) {
      setPhotoError(t('photoRequiredError'));
      hasError = true;
    } else {
      setPhotoError('');
    }

    if (!name.trim() || !agreedToRules || hasError) return;

    onRegister({
      name: name.trim(),
      phone: phone.trim(),
      photo,
    });
  };

  return (
    <div className="registration-overlay">
      <div className="registration-card">
        <h2>{t('registrationTitle')}</h2>

        {/* Live Photo Preview */}
        <div className="photo-section">
          <div className="photo-live-wrapper">
            {photo ? (
              <img src={photo} alt="participant" className="photo-preview" />
            ) : (
              <canvas ref={previewCanvasRef} className={`photo-preview-canvas${photoError ? ' photo-preview-canvas--error' : ''}`} />
            )}
            <div className="photo-live-label">
              {photo ? t('photoReady') : t('livePreview')}
            </div>
          </div>
          <div className="photo-buttons">
            <button onClick={handlePhotoAction} className="btn-photo" type="button">
              {photo ? t('photoRetake') : t('takePhoto')}
            </button>
          </div>
          {photoError && <p className="phone-error-text" style={{ textAlign: 'center', marginTop: '4px' }}>{photoError}</p>}
        </div>

        {/* Full Name */}
        <div className="form-group">
          <label htmlFor="participant-name">{t('fullName')}</label>
          <input
            id="participant-name"
            type="text"
            placeholder={t('enterFullName')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-field"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleStart()}
          />
        </div>

        <div className="form-group">
          <label htmlFor="participant-phone">{t('phone')}</label>
          <input
            id="participant-phone"
            type="tel"
            placeholder="+7 (___) ___-__-__"
            value={phone}
            onChange={handlePhoneChange}
            className="input-field"
            onKeyDown={(e) => e.key === 'Enter' && handleStart()}
          />
          {phoneError && <p className="phone-error-text">{phoneError}</p>}
        </div>

        <div className="rules-summary">
          <p className="rules-summary-text">
            {t('rulesSummary')}
          </p>
          <button type="button" className="btn-action rules-open-btn" onClick={() => setIsRulesOpen(true)}>
            {t('readRulesBtn')}
          </button>
          <label className="rules-checkbox compact">
            <input
              type="checkbox"
              checked={agreedToRules}
              onChange={(e) => setAgreedToRules(e.target.checked)}
            />
            <span>{t('agreeRules')}</span>
          </label>
        </div>

        <button onClick={handleStart} className="btn-start" disabled={!name.trim() || phone.replace(/\D/g, '').length < 11 || !photo || !agreedToRules}>
          {t('startCompetition')}
        </button>

        {isRulesOpen && (
          <div className="rules-modal-backdrop" onClick={() => setIsRulesOpen(false)}>
            <div className="rules-modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="rules-modal-title">{t('rulesTitle')}</h3>
              <ol className="rules-list">
                <li>{t('rule1')}</li>
                <li>{t('rule2')}</li>
                <li>{t('rule3')}</li>
                <li>{t('rule4')}</li>
                <li>{t('rule5')}</li>
                <li>{t('rule6')}</li>
                <li>{t('rule7')}</li>
                <li>{t('rule8')}</li>
              </ol>
              <div className="rules-modal-actions">
                <button type="button" className="btn-action" onClick={() => setIsRulesOpen(false)}>
                  {t('close')}
                </button>
                <button
                  type="button"
                  className="btn-action btn-action-primary"
                  onClick={() => {
                    setAgreedToRules(true);
                    setIsRulesOpen(false);
                  }}
                >
                  {t('agreeBtn')}
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
